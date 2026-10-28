const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{Readable}=require('node:stream')
const factory=require('../../server/sent-notifications.cjs'),{sentFilters,SENT_SQL}=factory
const id='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',actor='30000000-0000-4000-8000-000000000003',key='40000000-0000-4000-8000-000000000004'
test('sent filters bind borrower, category and subject with literal wildcard escaping and bounded pages',()=>{
 assert.deepEqual(sentFilters({borrowerIds:[id,id],category:'payment',subject:'  50%_paid  ',offset:51.8}),[false,'',[id],'payment','%50\\%\\_paid%',51,false])
 assert.equal(sentFilters({hideAdmin:true})[6],true);assert.equal(sentFilters({hideAdmin:'true'})[6],false)
 assert.equal(sentFilters({offset:Infinity})[5],0);assert.equal(sentFilters({offset:1e9})[5],100000)
 for(const borrowerIds of ['not-array',[null],['invalid'],Array(101).fill(id)])assert.throws(()=>sentFilters({borrowerIds}),/borrower/)
 assert.match(SENT_SQL,/n\.title ilike \$5/);assert.doesNotMatch(SENT_SQL,/n\.body ilike \$5/)
 assert.match(SENT_SQL,/n\.audience='all'/);assert.match(SENT_SQL,/n\.target_user_ids && \$3/)
 assert.match(SENT_SQL,/count\(\*\)::int from matched/)
 assert.doesNotMatch(SENT_SQL,/n\.\*|n\.attachments/,'Sent cards do not transfer embedded attachments.')
})
function service(role='admin',stale=false){
 const calls=[],cache=new Map(),db={query:async()=>({rows:[{items:[],total:0}]}),connect:async()=>({release(){calls.push('release')},async query(sql,args){calls.push(sql)
  if(sql.startsWith('select action,payload_hash'))return {rows:cache.has(args[1])?[cache.get(args[1])]:[]}
  if(sql.startsWith('select id,xmin'))return {rows:args[0].map(value=>({id:value,edit_version:stale?'2':'1',archived_at:null}))}
  if(sql.startsWith('insert into mobile_private.operation_keys'))cache.set(args[1],{action:args[2],payload_hash:args[3],result:args[4]})
  return {rows:[],rowCount:1}
 }})}
 return {api:factory({db,authorize:async()=>({id:actor,role})}),calls}
}
const payload={key,ids:[id,other],expected:[{id,version:'1'},{id:other,version:'1'}],reviewed:true}
test('sent reads and deletes deny borrowers before any database mutation',async()=>{
 const {api,calls}=service('user');await assert.rejects(api.sent({},{}),/Only an active lender/);await assert.rejects(api.deleteSent({},payload),/Only an active lender/);assert.equal(calls.length,0)
})
test('notification deletion rejects missing review, invalid ids and invalid version snapshots',async()=>{
 for(const patch of [{reviewed:false},{key:'bad'},{ids:[]},{ids:[id,id]},{ids:Array(51).fill(id)},{expected:[null,null]},{expected:[{id,version:1},{id:other,version:'1'}]}]){
  const {api,calls}=service();await assert.rejects(api.deleteSent({},{...payload,...patch}));assert.equal(calls.length,0)
 }
})
test('bulk deletion is reviewed, atomic, recoverable and idempotent after an uncertain response',async()=>{
 const {api,calls}=service();assert.deepEqual(await api.deleteSent({},payload),{deleted:2});assert.deepEqual(await api.deleteSent({},payload),{deleted:2})
 assert.equal(calls.filter(sql=>sql.startsWith('update public.notifications set archived_at')).length,1)
 assert.ok(calls.some(sql=>sql.includes('notification_rule_audit')));assert.ok(!calls.some(sql=>/^delete from/i.test(sql)))
 await assert.rejects(api.deleteSent({},{...payload,ids:[id],expected:[{id,version:'1'}]}),/Retry details changed/)
 const stale=service('admin',true);await assert.rejects(stale.api.deleteSent({},payload),/changed/);assert.ok(stale.calls.includes('rollback'));assert.ok(!stale.calls.some(sql=>sql.startsWith('update public.notifications')))
})
test('the protected HTTP handler routes sent deletion separately from deleting rules',async()=>{
 let received
 const handler=require('../../server/notification-rules-http.cjs')({origin:'https://preview.test',service:{deleteSent:async(_req,body)=>{received=body;return {deleted:2}}}})
 const req=Readable.from([Buffer.from(JSON.stringify(payload))]);Object.assign(req,{method:'POST',url:'/notification-rules/sent-delete',headers:{origin:'https://preview.test'}})
 const res={setHeader(){},writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};await handler(req,res)
 assert.deepEqual(received,payload);assert.deepEqual(res.body,{deleted:2})
})
test('sent manager shows borrower pills, subject/category filters and reviewed page-only deletion',()=>{
 const source=fs.readFileSync('src/components/notifications/SentNotificationsManager.jsx','utf8')
 for(const label of ['Filter notifications by borrower','Filter sent notifications by category','Filter sent notifications by subject','Select all notifications on this page','Delete selected','Include deleted','Hide admin notifications'])assert.ok(source.includes(label),label)
 assert.match(source,/shared notifications/);assert.match(source,/expected:deleting.expected/)
 assert.doesNotMatch(source,/setInterval/)
})
