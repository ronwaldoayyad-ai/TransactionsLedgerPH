// Read-only PostgreSQL regression checks. Run against the local staging schema.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Readable}=require('node:stream');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'server/notification-rules.cjs'),'utf8');
const factory=require(path.join(root,'server/notification-rules.cjs'));
const {db}=require(path.join(root,'server/local-flow-service.cjs'));
const parser=vm.createContext({});
const querySources=source+'\n'+fs.readFileSync(path.join(root,'server/sent-notifications.cjs'),'utf8');
const literals=[...querySources.matchAll(/\b(?:db|client)\.query\(\s*((?:'(?:\\.|[^'\\])*')|(?:"(?:\\.|[^"\\])*"))/g)].map(match=>vm.runInContext(match[1],parser,{timeout:5000}));
const queries=[...new Set(literals.filter(sql=>/^\s*(select|insert|update|delete)\b/i.test(sql)))];
const countsQuery=queries.find(sql=>sql.includes('as linked')&&sql.includes('notification_links'));
after(()=>db.end());

test('every literal notification-service query prepares against the actual local schema',async t=>{
 const client=await db.connect();
 try{await client.query('begin read only');
  assert.ok(queries.length>=35,'Query extraction unexpectedly missed service statements.');
  for(const [index,sql] of queries.entries()){
   await client.query('savepoint notification_sql_check');
   try{await client.query('prepare notification_sql_'+index+' as '+sql);await client.query('deallocate notification_sql_'+index)}
   catch(error){await client.query('rollback to savepoint notification_sql_check');throw new Error('Notification SQL statement '+index+' failed ('+error.code+'): '+error.message,{cause:error})}
   await client.query('release savepoint notification_sql_check');
  }
  t.diagnostic(queries.length+' service queries prepared; no business statements executed.');
 }finally{await client.query('rollback');client.release()}
});

test('linked counts remain unambiguous when both tables have rule_id, including archived messages',async()=>{
 assert.ok(countsQuery,'The live list query must be covered.');
 const rule='10000000-0000-4000-8000-000000000001';
 const ids=[1,2,3].map(n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0'));
 const links=ids.map(id=>({rule_id:rule,notification_id:id}));
 const notifications=ids.map((id,index)=>({id,rule_id:index===2?'10000000-0000-4000-8000-000000000002':null,archived_at:index===2?'2026-10-16T00:00:00Z':null}));
 const sql=countsQuery.replace('mobile_private.notification_links',"(select * from jsonb_to_recordset($1::jsonb) as rows(rule_id uuid,notification_id uuid))").replace('public.notifications',"(select * from jsonb_to_recordset($2::jsonb) as rows(id uuid,rule_id uuid,archived_at timestamptz))");
 const result=await db.query(sql,[JSON.stringify(links),JSON.stringify(notifications)]);
 assert.deepEqual(result.rows,[{rule_id:rule,linked:3,visible:2}]);
});

test('notification workspace read handlers return real local data with stubbed authentication',async()=>{
 // Only authentication is stubbed. No session is forged or sent to the app.
 // The production handlers and SQL run unchanged in a read-only transaction.
 const client=await db.connect();
 const fakeUser={id:'30000000-0000-4000-8000-000000000001',role:'admin'};
 const sessionId='40000000-0000-4000-8000-000000000001';
 const req={headers:{authorization:'Bearer header.'+Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')+'.signature'}};
 const facade={query:(sql,args)=>sql==='select 1 from auth.sessions where id=$1 and user_id=$2'?Promise.resolve({rowCount:1,rows:[{}]}):client.query(sql,args)};
 const service=factory({db:facade,active:async(_req,admin)=>{assert.equal(admin,true);return fakeUser}});
 try{await client.query('begin read only');
  const listing=await service.list(req);assert.ok(listing.rules.length>0);assert.ok(listing.catalog.length>0);
  const rule=listing.rules[0];const preview=await service.preview(req,{rule});assert.ok(Number.isInteger(preview.total));
  const sent=await service.sent(req,{});assert.ok(Array.isArray(sent.items));
  const activity=await service.activity(req,{});assert.ok(Array.isArray(activity.events));assert.ok(Array.isArray(activity.deliveries));assert.ok(Array.isArray(activity.audit));
 }finally{await client.query('rollback');client.release()}
});

async function errorResponse(error){
 const logs=[];
 const handler=require(path.join(root,'server/notification-rules-http.cjs'))({origin:'http://127.0.0.1:5173',service:{list:async()=>{throw error}},onError:detail=>logs.push(detail)});
 const req=Readable.from([Buffer.from('{}')]);Object.assign(req,{url:'/notification-rules/list',method:'POST',headers:{origin:'http://127.0.0.1:5173'}});
 const res={status:200,setHeader(){},writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};
 await handler(req,res);return {res,logs};
}
test('database faults show safe retry feedback and never expose SQL diagnostics',async()=>{
 const {res,logs}=await errorResponse(Object.assign(new Error('column reference "rule_id" is ambiguous'),{code:'42702'}));
 assert.equal(res.status,503);assert.equal(res.body.error,'Notifications are temporarily unavailable. Please try again.');assert.deepEqual(logs,[{code:'42702'}]);
});
test('actionable validation feedback is retained for the administrator',async()=>{
 const {res,logs}=await errorResponse(new Error('This rule changed. Refresh it before saving.'));
 assert.equal(res.status,400);assert.equal(res.body.error,'This rule changed. Refresh it before saving.');assert.deepEqual(logs,[]);
});
