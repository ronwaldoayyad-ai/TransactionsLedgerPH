const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const root=path.resolve(__dirname,'../..');
const port=Number(process.env.PAYMENT_TEST_PORT??54322);
if(![54322,25432].includes(port))throw Error('Only the local staging or separate rehearsal port is permitted.');
const config={host:'127.0.0.1',port,user:'postgres',password:'postgres',connectionTimeoutMillis:5000,statement_timeout:10000};
const database='payment_posting_test_'+crypto.randomBytes(6).toString('hex');
const control=new Pool({...config,database:'postgres'});let db,created=false;
const clean=sql=>sql.replace(/^\\.*$/gm,'');
before(async()=>{
 await control.query('create database '+database);created=true;db=new Pool({...config,database});
 await db.query(clean(fs.readFileSync(path.join(root,'tests/fixtures/sql/platform-pre.sql'),'utf8')));
 await db.query('alter table auth.users add primary key(id);alter table auth.sessions add primary key(id);alter table storage.objects add primary key(id);alter table storage.buckets add primary key(id)');
 await db.query(clean(fs.readFileSync(path.join(root,'tests/fixtures/sql/classic-public-schema.sql'),'utf8')));
 await db.query('create publication supabase_realtime');
 await db.query("insert into storage.buckets(id,name,file_size_limit) values('payment-proofs','payment-proofs',10485760)");
 await db.query(fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8'));
 await db.query('set row_security=on;set check_function_bodies=on');
 if(!(await db.query("select to_regprocedure('mobile_private.post_reviewed_payment(jsonb,boolean)') as posting")).rows[0].posting)
  await db.query(fs.readFileSync(path.join(root,'supabase/migrations/20261018023949_reviewed_payment_posting.sql'),'utf8'));
});
after(async()=>{await db?.end();if(created&&/^payment_posting_test_[a-f0-9]{12}$/.test(database))await control.query('drop database '+database);await control.end()});

async function sentFixture(){
 const f=await fixture();await f.client.query('commit');f.client.release();
 const service=require('../../server/sent-notifications.cjs')({db,authorize:async()=>({id:f.admin,role:'admin'})}),prefix='QA Sent '+crypto.randomUUID()
 const insert=async(title,category,targets,audience='targeted',creator=f.admin,event=null)=>(await db.query('insert into public.notifications(category,title,body,audience,target_user_ids,created_by,event_id) values($1,$2,$3,$4,$5,$6,$7) returning id',[category,prefix+' '+title,'Synthetic notification only',audience,targets,creator,event])).rows[0].id
 return {...f,service,prefix,insert}
}
test('sent filters combine borrower recipients, broadcasts, captured borrower identity, categories and subjects',async()=>{
 const f=await sentFixture();const direct=await f.insert('Direct','payment',[f.borrower]),broadcast=await f.insert('Shared','payment',[],'all'),foreign=await f.insert('Admin only','payment',[f.admin]),general=await f.insert('General','general',[f.borrower])
 const event=(await db.query("insert into mobile_private.notification_events(event_type,actor_id,payload) values('payment.proof_submitted_admin',$1,$2) returning id",[f.admin,{email:f.borrower+'@test.invalid'}])).rows[0].id
 const about=await f.insert('About borrower','payment',[f.admin],'targeted',f.admin,event)
 const filtered=await f.service.sent({}, {borrowerIds:[f.borrower],category:'payment',subject:f.prefix})
 assert.deepEqual(new Set(filtered.items.map(n=>n.id)),new Set([direct,broadcast,about]));assert.equal(filtered.total,3);assert.ok(filtered.items.every(n=>typeof n.edit_version==='string'))
 assert.ok(!filtered.items.some(n=>[foreign,general].includes(n.id)))
 const subject=await f.service.sent({}, {borrowerIds:[f.borrower],subject:f.prefix+' Direct'});assert.equal(subject.total,1);assert.equal(subject.items[0].id,direct)
});
test('hide-admin filtering keeps borrower and shared notices, with accurate counts before pagination',async()=>{
 const f=await sentFixture(),direct=await f.insert('Borrower','general',[f.borrower]),shared=await f.insert('Shared','general',[],'all'),mixed=await f.insert('Mixed','general',[f.admin,f.borrower]);
 await f.insert('Admin','general',[f.admin]);
 const shown=await f.service.sent({}, {subject:f.prefix,hideAdmin:true});assert.equal(shown.total,3);assert.deepEqual(new Set(shown.items.map(n=>n.id)),new Set([direct,shared,mixed]));
 assert.equal((await f.service.sent({}, {subject:f.prefix})).total,4);
 assert.equal((await f.service.sent({}, {subject:f.prefix,borrowerIds:[f.borrower],hideAdmin:true})).total,3);
});

test('notification metadata signals cover insert, edit, retarget, archive, restore, reads and deletion without exposing another recipient',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');
  const other=crypto.randomUUID();await f.client.query('insert into auth.users(id,email) values($1,$2)',[other,other+'@test.invalid']);await f.client.query("insert into public.profiles(id,email,name,role,status) values($1,$2,'Unrelated recipient','user','active')",[other,other+'@test.invalid']);
  const revisions=async()=>Object.fromEntries((await f.client.query('select user_id,revision from public.notification_change_signals where user_id=any($1::uuid[])',[[f.admin,f.borrower,other]])).rows.map(r=>[r.user_id,r.revision]));
  const id=(await f.client.query("insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('general','Synthetic live notification','QA','targeted',array[$1::uuid],$2) returning id",[f.borrower,f.admin])).rows[0].id;
  let before=await revisions();assert.ok(before[f.admin]);assert.ok(before[f.borrower]);assert.equal(before[other],undefined);
  for(const sql of ["update public.notifications set body='Edited' where id=$1","update public.notifications set archived_at=now() where id=$1","update public.notifications set archived_at=null where id=$1"]){await f.client.query(sql,[id]);const after=await revisions();assert.notEqual(after[f.borrower],before[f.borrower]);assert.equal(after[other],undefined);before=after;}
  await f.client.query('insert into public.notification_reads(notification_id,user_id) values($1,$2)',[id,f.borrower]);let after=await revisions();assert.notEqual(after[f.borrower],before[f.borrower]);assert.notEqual(after[f.admin],before[f.admin]);assert.equal(after[other],undefined);
  before=after;await f.client.query('update public.notifications set target_user_ids=array[$2::uuid] where id=$1',[id,other]);after=await revisions();assert.notEqual(after[f.borrower],before[f.borrower]);assert.ok(after[other]);
  await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:f.sid})]);
  // Use an actual session belonging to the borrower for the metadata RLS check.
  const sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,f.borrower]);await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:sid})]);
  await f.client.query('set local role authenticated');assert.deepEqual((await f.client.query('select user_id from public.notification_change_signals')).rows.map(r=>r.user_id),[f.borrower]);
  await f.client.query('reset role');before=await revisions();await f.client.query('delete from public.notifications where id=$1',[id]);after=await revisions();assert.notEqual(after[other],before[other]);
 }finally{await release(f)}
});

test('sent paging counts all matching notifications instead of filtering only a 50-row page',async()=>{
 const f=await sentFixture();await db.query("insert into public.notifications(category,title,body,audience,target_user_ids,created_by) select 'general',$1||' #'||s,'Synthetic page test','targeted',array[$2::uuid],$3 from generate_series(1,51) s",[f.prefix,f.borrower,f.admin])
 const first=await f.service.sent({}, {subject:f.prefix,borrowerIds:[f.borrower]}),second=await f.service.sent({}, {subject:f.prefix,borrowerIds:[f.borrower],offset:50})
 assert.equal(first.total,51);assert.equal(first.items.length,50);assert.equal(second.total,51);assert.equal(second.items.length,1);assert.ok(!first.items.some(n=>n.id===second.items[0].id))
});
test('sent bulk deletion retains reads and rule links, disappears from active filters and retries once',async()=>{
 const f=await sentFixture(),ids=[await f.insert('A','payment',[f.borrower]),await f.insert('B','payment',[f.borrower])]
 await db.query('insert into public.notification_reads(notification_id,user_id) values($1,$2)',[ids[0],f.borrower])
 const rule=(await db.query('select id,version from mobile_private.notification_rules limit 1')).rows[0]
 await db.query("insert into mobile_private.notification_links(notification_id,rule_id,rule_version,node_id,event_type,payload) values($1,$2,$3,'qa-node','payment.recorded','{}')",[ids[0],rule.id,rule.version])
 const rows=await f.service.sent({}, {subject:f.prefix}),payload={key:crypto.randomUUID(),ids,expected:rows.items.map(n=>({id:n.id,version:n.edit_version})),reviewed:true}
 assert.deepEqual(await f.service.deleteSent({},payload),{deleted:2});assert.deepEqual(await f.service.deleteSent({},payload),{deleted:2})
 assert.equal((await f.service.sent({}, {subject:f.prefix})).total,0);assert.equal((await f.service.sent({}, {subject:f.prefix,includeArchived:true})).total,2)
 assert.equal((await db.query('select count(*)::int n from public.notification_reads where notification_id=$1',[ids[0]])).rows[0].n,1)
 assert.equal((await db.query('select count(*)::int n from mobile_private.notification_links where notification_id=$1',[ids[0]])).rows[0].n,1)
 assert.equal((await db.query("select count(*)::int n from mobile_private.notification_rule_audit where operation='notification.deleted' and notification_id=any($1::uuid[])",[ids])).rows[0].n,2)
});
test('a changed notification aborts the entire deletion batch',async()=>{
 const f=await sentFixture(),ids=[await f.insert('First','general',[f.borrower]),await f.insert('Second','general',[f.borrower])],rows=await f.service.sent({}, {subject:f.prefix})
 await db.query("update public.notifications set title=title||' edited' where id=$1",[ids[1]])
 await assert.rejects(f.service.deleteSent({}, {key:crypto.randomUUID(),ids,expected:rows.items.map(n=>({id:n.id,version:n.edit_version})),reviewed:true}),/changed/)
 assert.equal((await db.query('select count(*)::int n from public.notifications where id=any($1::uuid[]) and archived_at is null',[ids])).rows[0].n,2)
});

async function fixture(amount=1000){
 const client=await db.connect();await client.query('begin');
 try{
 const admin=crypto.randomUUID(),borrower=crypto.randomUUID(),sid=crypto.randomUUID(),proof=crypto.randomUUID(),loan='loan-'+crypto.randomUUID(),due='due-'+crypto.randomUUID();
 await client.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[admin,admin+'@test.invalid',borrower,borrower+'@test.invalid']);
 await client.query("insert into public.profiles(id,email,name,role,status) values($1,$2,'Synthetic admin','admin','active'),($3,$4,'Synthetic borrower','user','active')",[admin,admin+'@test.invalid',borrower,borrower+'@test.invalid']);
 await client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,admin]);
 await client.query("insert into public.loans(id,user_id,label,principal,duration_months,txn_date,first_payment_date) values($1,$2,'Synthetic posting loan',1000,1,current_date,current_date)",[loan,borrower]);
 await client.query("insert into public.transactions(id,loan_id,user_id,n,description,amount,type,txn_date,due_date) values($1,$2,$3,1,'Synthetic due',1000,'Installment',current_date,(now() at time zone 'Asia/Manila')::date)",[due,loan,borrower]);
 await client.query("insert into public.payments(id,user_id,loan_id,amount,method,reference,file_name,file_type,file_path,paid_date,requested_allocations) values($1,$2,$3,$4,'Bank Transfer',$6,'synthetic.png','image','synthetic-only.png',current_date,$5)",[proof,borrower,loan,amount,JSON.stringify([{id:due,amount:1000}]),proof]);
 await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admin,role:'authenticated',session_id:sid})]);
 await client.query('set local role authenticated');
 return {client,admin,borrower,sid,proof,due,loan,payload:{key:crypto.randomUUID(),id:proof,status:'approved',reviewed:true,creditUsed:'0.00',expectedCredit:'0.00',allocations:[{id:due,amount:String(amount),expectedBalance:'1000.00'}]}};
 }catch(error){await client.query('rollback');client.release();throw error}
}
async function release(f){await f.client.query('rollback');f.client.release()}

async function correctionPayload(f,patch){
 const row=(await f.client.query('select to_jsonb(t) row from public.transactions t where id=$1',[f.due])).rows[0].row;
 const keys=['user_id','loan_id','n','description','amount','amount_applied','type','txn_date','due_date','date_paid','status','fee_assessment_id','archived_at'];
 return {key:crypto.randomUUID(),id:f.due,patch,expected:Object.fromEntries(keys.map(k=>[k,row[k]])),reason:'Synthetic QA correction for accounting regression',reviewed:true};
}
const correct=(f,payload)=>f.client.query('select public.admin_correct_transaction($1) result',[payload]);

test('reviewed admin correction returns only excess applied funds to credit and retries exactly once',async()=>{
 const f=await fixture(400);try{
  await post(f);const payload=await correctionPayload(f,{amount:'100.00'}),result=(await correct(f,payload)).rows[0].result;
  assert.equal(result.creditReturned,300);assert.equal(result.transaction.amount_applied,100);assert.equal(result.creditBalance,300);
  assert.deepEqual((await correct(f,payload)).rows[0].result,result);
  assert.equal((await f.client.query('select count(*)::int n from public.transaction_corrections where transaction_id=$1',[f.due])).rows[0].n,1);
  assert.equal(Number((await f.client.query('select sum(amount) n from public.payment_allocation_releases where transaction_id=$1',[f.due])).rows[0].n),300);
  assert.equal((await f.client.query('select count(*)::int n from public.payment_logs where correction_id=$1',[result.correctionId])).rows[0].n,1);
  const posting=(await f.client.query('select id,cash_amount,allocated_amount from public.payment_postings where payment_id=$1',[f.proof])).rows[0];
  assert.equal(Number(posting.allocated_amount),400,'original posting is immutable');
  await f.client.query("select public.mobile_action('payment-reverse',$1)",[{key:crypto.randomUUID(),id:posting.id,expectedCredit:'300',reviewed:true,reason:'Synthetic reversal after correction test'}]);
  const reversal=(await f.client.query('select correction_credit_reclaimed,note from public.payment_postings where reversal_of=$1',[posting.id])).rows[0];assert.equal(Number(reversal.correction_credit_reclaimed),300);assert.match(reversal.note,/Reclaimed PHP 300/);
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0);
  assert.equal(Number((await f.client.query('select amount_applied from public.transactions where id=$1',[f.due])).rows[0].amount_applied),0);
 }finally{await release(f)}
});
test('increasing a fully allocated amount keeps payments and reopens only the unpaid remainder',async()=>{
 const f=await fixture();try{await post(f);const r=(await correct(f,await correctionPayload(f,{amount:1200,type:'Straight',description:'Corrected full paid due',txnDate:'2026-10-01',dueDate:'2026-12-01'}))).rows[0].result;
  assert.equal(r.transaction.amount_applied,1000);assert.equal(r.transaction.status,'unpaid');assert.equal(r.transaction.date_paid,null);assert.equal(r.transaction.type,'Straight');assert.equal(r.creditReturned,0);
 }finally{await release(f)}
});
test('cancelled and negative corrections return all applied funds without inventing cash',async()=>{
 for(const patch of [{status:'cancelled'},{amount:-25}]){const f=await fixture(400);try{
  await post(f);const r=(await correct(f,await correctionPayload(f,patch))).rows[0].result;
  assert.equal(r.creditReturned,400);assert.equal(r.transaction.amount_applied,0);
  assert.equal((await f.client.query('select count(*)::int n from public.payment_postings where user_id=$1',[f.borrower])).rows[0].n,1);
 }finally{await release(f)}}
});
test('borrower reassignment detaches unpaid schedules and requires reversal for reviewed payments',async()=>{
 const f=await fixture(400);try{
  const other=crypto.randomUUID();await f.client.query('reset role');await f.client.query("insert into auth.users(id,email) values($1,$2)",[other,other+'@test.invalid']);await f.client.query("insert into public.profiles(id,email,name,role,status) values($1,$2,'Other QA borrower','user','active')",[other,other+'@test.invalid']);await f.client.query('set local role authenticated');
  await post(f);await f.client.query('savepoint no_move');await assert.rejects(correct(f,await correctionPayload(f,{userId:other})),/Reverse the reviewed payments/);await f.client.query('rollback to savepoint no_move');
  const posting=(await f.client.query('select id from public.payment_postings where payment_id=$1',[f.proof])).rows[0].id;
  await f.client.query("select public.mobile_action('payment-reverse',$1)",[{key:crypto.randomUUID(),id:posting,expectedCredit:'0',reviewed:true,reason:'Synthetic reassignment reversal test'}]);
  const r=(await correct(f,await correctionPayload(f,{userId:other}))).rows[0].result;
  assert.equal(r.transaction.user_id,other);assert.equal(r.transaction.loan_id,null);assert.equal(r.transaction.n,1);
 }finally{await release(f)}
});
test('invalid, stale and unauthorized overrides fail atomically; correction history stays immutable',async()=>{
 const f=await fixture(400);try{await post(f);
  const payload=await correctionPayload(f,{amount:100});
  for(const bad of [{reviewed:false},{reason:'short'},{patch:{amount:0}},{patch:{amount:'1.001'}},{patch:{amount_applied:0}},{expected:{}}]){
   await f.client.query('savepoint invalid_correction');await assert.rejects(correct(f,{...payload,...bad}));await f.client.query('rollback to savepoint invalid_correction');
  }
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0);
  const r=(await correct(f,payload)).rows[0].result;
  for(const statement of ['update public.transaction_corrections set reason=\'mutated reason\' where id=$1','delete from public.payment_allocation_releases where correction_id=$1','update public.payment_logs set note=\'mutated\' where correction_id=$1']){
   await f.client.query('savepoint immutable_correction');await assert.rejects(f.client.query(statement,[r.correctionId]));await f.client.query('rollback to savepoint immutable_correction');
  }
  await f.client.query('reset role');const sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,f.borrower]);await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:sid})]);await f.client.query('set local role authenticated');
  await f.client.query('savepoint denied');await assert.rejects(correct(f,await correctionPayload(f,{description:'Borrower must not edit this'})),/Only an active lender/);await f.client.query('rollback to savepoint denied');
 }finally{await release(f)}
});

test('permanent archive deletion removes eligible rows, reports protected rows and retries safely',async()=>{
 const f=await fixture();try{
  await post(f)
  const plain='purge-'+crypto.randomUUID()
  await f.client.query("insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date,archived_at) values($1,$2,1,'Disposable archive',10,'Straight',current_date,current_date,current_date)",[plain,f.borrower])
  await f.client.query('update public.transactions set archived_at=current_date where id=$1',[f.due])
  const payload={key:crypto.randomUUID(),ids:[f.due,plain],reviewed:true},purge=()=>f.client.query('select public.admin_purge_archived_transactions($1) result',[payload])
  const result=(await purge()).rows[0].result
  assert.deepEqual(result.deletedIds,[plain]);assert.equal(result.blocked[0].id,f.due);assert.match(result.blocked[0].reason,/allocations/)
  assert.deepEqual((await purge()).rows[0].result,result)
  assert.equal((await f.client.query('select count(*)::int n from public.transactions where id=$1',[plain])).rows[0].n,0)
  assert.equal(Number((await f.client.query('select amount_applied from public.transactions where id=$1',[f.due])).rows[0].amount_applied),1000)
 }finally{await release(f)}
});

test('archive purge preserves active records and correction history and rejects missing review',async()=>{
 const f=await fixture();try{
  await correct(f,await correctionPayload(f,{description:'Corrected synthetic due'}))
  let r=(await f.client.query('select public.admin_purge_archived_transactions($1) result',[{key:crypto.randomUUID(),ids:[f.due],reviewed:true}])).rows[0].result
  assert.deepEqual(r.deletedIds,[]);assert.match(r.blocked[0].reason,/no longer archived/)
  await f.client.query('update public.transactions set archived_at=current_date where id=$1',[f.due])
  r=(await f.client.query('select public.admin_purge_archived_transactions($1) result',[{key:crypto.randomUUID(),ids:[f.due],reviewed:true}])).rows[0].result
  assert.deepEqual(r.deletedIds,[]);assert.match(r.blocked[0].reason,/correction history/)
  await f.client.query('savepoint validation');await assert.rejects(f.client.query('select public.admin_purge_archived_transactions($1)',[{key:crypto.randomUUID(),ids:[f.due],reviewed:false}]),/Review/);await f.client.query('rollback to savepoint validation')
 }finally{await release(f)}
});

test('single and bulk breakdown hiding changes display metadata only and restores safely',async()=>{
 const f=await fixture(400);try{
  await post(f)
  const posting=(await f.client.query('select id from public.payment_postings where payment_id=$1',[f.proof])).rows[0].id
  const before=(await f.client.query('select to_jsonb(p) row from public.payment_postings p where id=$1',[posting])).rows[0].row
  const payload={key:crypto.randomUUID(),ids:[posting],hidden:true,reviewed:true},hide=()=>f.client.query('select public.admin_set_payment_breakdown_visibility($1) result',[payload])
  assert.deepEqual((await hide()).rows[0].result.ids,[posting]);assert.equal((await hide()).rows[0].result.hidden,true)
  assert.equal((await f.client.query('select count(*)::int n from public.payment_breakdown_visibility where posting_id=$1',[posting])).rows[0].n,1)
  assert.deepEqual((await f.client.query('select to_jsonb(p) row from public.payment_postings p where id=$1',[posting])).rows[0].row,before)
  assert.equal(Number((await f.client.query('select amount_applied from public.transactions where id=$1',[f.due])).rows[0].amount_applied),400)
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0)
  await f.client.query('select public.admin_set_payment_breakdown_visibility($1)',[{key:crypto.randomUUID(),ids:[posting],hidden:false,reviewed:true}])
  assert.equal((await f.client.query('select count(*)::int n from public.payment_breakdown_visibility where posting_id=$1',[posting])).rows[0].n,0)
  await f.client.query('savepoint bad_retry');await assert.rejects(f.client.query('select public.admin_set_payment_breakdown_visibility($1)',[{...payload,hidden:false}]),/Retry details changed/);await f.client.query('rollback to savepoint bad_retry')
 }finally{await release(f)}
});

test('borrowers see only their ledger revisions and cannot delete archives or hide breakdowns',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');const sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,f.borrower]);await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:sid})]);await f.client.query('set local role authenticated')
  assert.deepEqual((await f.client.query('select borrower_id from public.ledger_change_signals')).rows.map(r=>r.borrower_id),[f.borrower])
  for(const name of ['admin_purge_archived_transactions','admin_set_payment_breakdown_visibility']){
   await f.client.query('savepoint denied');await assert.rejects(f.client.query('select public.'+name+'($1)',[{key:crypto.randomUUID(),ids:[f.due],hidden:true,reviewed:true}]),/Only an active lender/);await f.client.query('rollback to savepoint denied')
  }
  await f.client.query('savepoint cannot_forge');await assert.rejects(f.client.query('insert into public.ledger_change_signals(borrower_id) values($1)',[f.borrower]),/permission denied/);await f.client.query('rollback to savepoint cannot_forge')
 }finally{await release(f)}
});

test('transaction edits, archive/restore, loan edits and owner moves notify every affected ledger',async()=>{
 const f=await fixture();try{
  const version=async owner=>(await f.client.query('select version from public.ledger_change_signals where borrower_id=$1',[owner])).rows[0]?.version
  let previous=await version(f.borrower)
  for(const [sql,args] of [["update public.transactions set description='Live edit' where id=$1",[f.due]],["update public.transactions set archived_at=current_date where id=$1",[f.due]],["update public.transactions set archived_at=null where id=$1",[f.due]],["update public.loans set label='Live category label' where id=$1",[f.loan]]]){await f.client.query(sql,args);const next=await version(f.borrower);assert.ok(Number(next)>Number(previous));previous=next}
  const targetBefore=await version(f.admin);await f.client.query('update public.transactions set user_id=$2,loan_id=null where id=$1',[f.due,f.admin]);assert.ok(Number(await version(f.borrower))>Number(previous));assert.ok(Number(await version(f.admin))>Number(targetBefore))
 }finally{await release(f)}
});

test('reviewed approval atomically posts the proof to its selected installment',async()=>{
 const f=await fixture();try{
  await f.client.query("select public.mobile_action('payment-review',$1)",[f.payload]);
  const row=(await f.client.query('select to_jsonb(t) as data from public.transactions t where id=$1',[f.due])).rows[0].data;
  assert.equal(row.status,'paid','approval must settle its fully allocated installment');
  assert.equal(Number(row.amount),1000,'the original installment amount is preserved');
  assert.equal(Number(row.amount_applied),1000);
  const proof=(await f.client.query('select to_jsonb(p) data from public.payments p where id=$1',[f.proof])).rows[0].data;
  assert.equal(proof.posted_allocations?.[0]?.id,f.due);assert.equal(Number(proof.posted_allocations?.[0]?.amount),1000);
  const logs=await f.client.query('select count(*)::int as count from public.payment_logs where user_id=$1',[f.borrower]);assert.equal(logs.rows[0].count,1);
 }finally{await release(f)}
});

const post=(f,patch={})=>f.client.query("select public.mobile_action('payment-review',$1) as result",[{...f.payload,...patch}]);
async function addDue(f,amount=500,n=2){
 const id='due-'+crypto.randomUUID();
 await f.client.query("insert into public.transactions(id,loan_id,user_id,n,description,amount,type,txn_date,due_date) values($1,$2,$3,$4,'Additional synthetic due',$5,'Installment',current_date,current_date+30)",[id,f.loan,f.borrower,n,amount]);return id;
}

test('partial approval reduces only the outstanding remainder and creates an underpayment acknowledgement',async()=>{
 const f=await fixture(400);try{
  await post(f);
  const row=(await f.client.query('select amount,amount_applied,status,date_paid from public.transactions where id=$1',[f.due])).rows[0];
  assert.equal(Number(row.amount),1000);assert.equal(Number(row.amount_applied),400);assert.equal(row.status,'unpaid');assert.equal(row.date_paid,null);
  const log=(await f.client.query('select alloc_status,remaining_balance,funds_applied from public.payment_logs where user_id=$1',[f.borrower])).rows[0];
  assert.equal(log.alloc_status,'Underpayment');assert.equal(Number(log.remaining_balance),-600);assert.equal(Number(log.funds_applied),400);
 }finally{await release(f)}
});

test('excess credit can be explicitly applied later without a fake cash proof',async()=>{
 const f=await fixture(1200);try{
  await post(f,{allocations:[{id:f.due,amount:'1000',expectedBalance:'1000'}]});
  const profile=()=>f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower]);
  assert.equal(Number((await profile()).rows[0].credit_balance),200);
  const id=await addDue(f,200),date=(await f.client.query('select current_date::text as date')).rows[0].date;
  await f.client.query("select public.mobile_action('credit-apply',$1)",[{key:crypto.randomUUID(),userId:f.borrower,reviewed:true,paidDate:date,creditUsed:'200',expectedCredit:'200',allocations:[{id,amount:'200',expectedBalance:'200'}]}]);
  assert.equal(Number((await profile()).rows[0].credit_balance),0);
  const due=(await f.client.query('select status,amount_applied from public.transactions where id=$1',[id])).rows[0];assert.equal(due.status,'paid');assert.equal(Number(due.amount_applied),200);
  const totals=(await f.client.query('select sum(cash_amount)::text as cash,count(*)::int as postings from public.payment_postings where user_id=$1',[f.borrower])).rows[0];assert.equal(Number(totals.cash),1200);assert.equal(totals.postings,2);
 }finally{await release(f)}
});

test('an uncertain response can be retried without posting or acknowledging twice',async()=>{
 const f=await fixture();try{
  const first=await post(f),again=await post(f);assert.deepEqual(first.rows,again.rows);
  const count=(await f.client.query('select count(*)::int as count from public.payment_postings where payment_id=$1',[f.proof])).rows[0].count;assert.equal(count,1);
  await f.client.query('savepoint changed_retry');await assert.rejects(post(f,{note:'changed retry'}),/Retry details changed/);await f.client.query('rollback to savepoint changed_retry');
  await f.client.query('savepoint duplicate_proof');await assert.rejects(post(f,{key:crypto.randomUUID()}),/already been reviewed/);await f.client.query('rollback to savepoint duplicate_proof');
 }finally{await release(f)}
});

test('stale review, unavailable funds and duplicate allocations leave the financial state untouched',async()=>{
 const f=await fixture();try{
  const bad=[{reviewed:false},{expectedCredit:'1'},{allocations:[{id:f.due,amount:'1000',expectedBalance:'999'}]},{allocations:[{id:f.due,amount:'1001',expectedBalance:'1000'}]},{allocations:[{id:f.due,amount:'500',expectedBalance:'1000'},{id:f.due,amount:'500',expectedBalance:'1000'}]},{creditUsed:'1'},{allocations:[{id:f.due,amount:'0.001',expectedBalance:'1000'}]}];
  for(const patch of bad){await f.client.query('savepoint invalid_review');await assert.rejects(post(f,patch));await f.client.query('rollback to savepoint invalid_review')}
  const row=(await f.client.query('select status,amount_applied from public.transactions where id=$1',[f.due])).rows[0];assert.equal(row.status,'unpaid');assert.equal(Number(row.amount_applied),0);
  assert.equal((await f.client.query('select count(*)::int as count from public.payment_logs where user_id=$1',[f.borrower])).rows[0].count,0);
 }finally{await release(f)}
});

test('direct browser updates cannot change applied amounts, credit or posted financial history',async()=>{
 const f=await fixture();try{
  await post(f);
  for(const [sql,args] of [
   ['update public.transactions set amount_applied=0 where id=$1',[f.due]],
   ['update public.profiles set credit_balance=1 where id=$1',[f.borrower]],
   ['delete from public.payments where id=$1',[f.proof]],
   ['delete from public.payment_logs where user_id=$1',[f.borrower]],
   ['update public.payment_postings set cash_amount=1 where payment_id=$1',[f.proof]],
  ]){await f.client.query('savepoint immutable_record');await assert.rejects(f.client.query(sql,args));await f.client.query('rollback to savepoint immutable_record')}
 }finally{await release(f)}
});

test('reviewed reversal restores dues and credit without deleting or rewriting the original posting',async()=>{
 const f=await fixture(1200);try{
  await post(f,{allocations:[{id:f.due,amount:'1000',expectedBalance:'1000'}]});
  const original=(await f.client.query('select id from public.payment_postings where payment_id=$1',[f.proof])).rows[0].id;
  const payload={key:crypto.randomUUID(),id:original,reviewed:true,expectedCredit:'200',reason:'Synthetic duplicate bank receipt correction'};
  const first=await f.client.query("select public.mobile_action('payment-reverse',$1) as result",[payload]);
  const repeat=await f.client.query("select public.mobile_action('payment-reverse',$1) as result",[payload]);assert.deepEqual(first.rows,repeat.rows);
  const row=(await f.client.query('select status,amount_applied from public.transactions where id=$1',[f.due])).rows[0];assert.equal(Number(row.amount_applied),0);assert.equal(row.status,'unpaid');
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0);
  assert.equal((await f.client.query('select count(*)::int as n from public.payment_postings where user_id=$1',[f.borrower])).rows[0].n,2);
  assert.equal((await f.client.query('select count(*)::int as n from public.payment_logs where user_id=$1',[f.borrower])).rows[0].n,2);
  assert.equal((await f.client.query('select status from public.payments where id=$1',[f.proof])).rows[0].status,'rejected');
  await f.client.query('savepoint twice');await assert.rejects(f.client.query("select public.mobile_action('payment-reverse',$1)",[{...payload,key:crypto.randomUUID()}]),/already.*revers|revers.*already/i);await f.client.query('rollback to savepoint twice');
 }finally{await release(f)}
});

test('reversal cannot remove surplus credit already spent by a later posting',async()=>{
 const f=await fixture(1200);try{
  await post(f,{allocations:[{id:f.due,amount:'1000',expectedBalance:'1000'}]});
  const original=(await f.client.query('select id from public.payment_postings where payment_id=$1',[f.proof])).rows[0].id,id=await addDue(f,200);
  await f.client.query("select public.mobile_action('credit-apply',$1)",[{key:crypto.randomUUID(),reviewed:true,userId:f.borrower,paidDate:new Date().toISOString().slice(0,10),creditUsed:'200',expectedCredit:'200',allocations:[{id,amount:'200',expectedBalance:'200'}]}]);
  await f.client.query('savepoint spent_credit');await assert.rejects(f.client.query("select public.mobile_action('payment-reverse',$1)",[{key:crypto.randomUUID(),id:original,reviewed:true,expectedCredit:'0',reason:'Synthetic correction after credit already used'}]),/credit.*(used|spent|insufficient)|insufficient.*credit/i);await f.client.query('rollback to savepoint spent_credit');
  assert.equal((await f.client.query('select status from public.transactions where id=$1',[f.due])).rows[0].status,'paid');
 }finally{await release(f)}
});

test('borrower sessions cannot approve, spend credit, reverse or read another account posting',async()=>{
 const f=await fixture();try{
  await post(f);await f.client.query('reset role');
  const sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,f.borrower]);
  await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:sid})]);await f.client.query('set local role authenticated');
  assert.equal((await f.client.query('select count(*)::int n from public.payment_postings')).rows[0].n,1);
  for(const action of ['payment-review','credit-apply','payment-reverse']){await f.client.query('savepoint denied');await assert.rejects(f.client.query('select public.mobile_action($1,$2)',[action,f.payload]));await f.client.query('rollback to savepoint denied')}
  await f.client.query('reset role');const other=crypto.randomUUID(),otherSid=crypto.randomUUID();await f.client.query('insert into auth.users(id,email) values($1,$2)',[other,other+'@test.invalid']);await f.client.query("insert into public.profiles(id,email,name,role,status) values($1,$2,'Other borrower','user','active')",[other,other+'@test.invalid']);await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[otherSid,other]);await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:other,role:'authenticated',session_id:otherSid})]);await f.client.query('set local role authenticated');
  assert.equal((await f.client.query('select count(*)::int n from public.payment_postings')).rows[0].n,0);assert.equal((await f.client.query('select count(*)::int n from public.payment_allocations')).rows[0].n,0);
 }finally{await release(f)}
});

test('inactive accounts and revoked sessions cannot post or read accounting records',async()=>{
 for(const mode of ['inactive','revoked']){const f=await fixture();try{
  await post(f);await f.client.query('reset role');
  if(mode==='inactive')await f.client.query("update public.profiles set status='disabled' where id=$1",[f.admin]);else await f.client.query('delete from auth.sessions where id=$1',[f.sid]);
  await f.client.query('set local role authenticated');assert.equal((await f.client.query('select count(*)::int n from public.payment_postings')).rows[0].n,0);
  await assert.rejects(post(f,{key:crypto.randomUUID()}),/active sign-in/i);
 }finally{await release(f)}}
});

test('concurrent approvals of one proof commit exactly one posting and acknowledgement',async()=>{
 const f=await fixture();await f.client.query('commit');f.client.release();
 const run=async()=>{const client=await db.connect();try{await client.query('begin');await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.admin,role:'authenticated',session_id:f.sid})]);await client.query('set local role authenticated');const r=await client.query("select public.mobile_action('payment-review',$1)",[{...f.payload,key:crypto.randomUUID()}]);await client.query('commit');return r}catch(e){await client.query('rollback');throw e}finally{client.release()}};
 const result=await Promise.allSettled([run(),run()]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
 const row=(await db.query('select (select count(*) from public.payment_postings where user_id=$1)::int postings,(select count(*) from public.payment_logs where user_id=$1)::int logs',[f.borrower])).rows[0];assert.deepEqual(row,{postings:1,logs:1});
});

test('legacy negative adjustments remain valid and are not treated as payment allocations',async()=>{
 const f=await fixture();try{const id=await addDue(f,-50);const row=(await f.client.query('select amount,amount_applied from public.transactions where id=$1',[id])).rows[0];assert.equal(Number(row.amount),-50);assert.equal(Number(row.amount_applied),0)}finally{await release(f)}
});

test('already-approved legacy proofs cannot create another posting, allocation or credit',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');await f.client.query("update public.payments set status='approved' where id=$1",[f.proof]);await f.client.query('set local role authenticated;savepoint legacy_denied');
  await assert.rejects(post(f,{allocations:[]}),/already been reviewed/);await f.client.query('rollback to savepoint legacy_denied');
  assert.equal((await f.client.query('select count(*)::int n from public.payment_postings where payment_id=$1',[f.proof])).rows[0].n,0);
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0);
  assert.equal((await f.client.query('select count(*)::int n from public.payment_allocations where user_id=$1',[f.borrower])).rows[0].n,0);
 }finally{await release(f)}
});

test('prior credit and new cash fund the exact reviewed allocation without overpaying a due',async()=>{
 const f=await fixture(400);try{
  await post(f,{allocations:[]});
  await f.client.query('reset role');const proof=crypto.randomUUID();await f.client.query("insert into public.payments(id,user_id,loan_id,amount,method,reference,file_name,file_type,file_path,paid_date) values($1,$2,$3,600,'Bank Transfer','SYNTHETIC-SECOND','synthetic.png','image','synthetic.png',current_date)",[proof,f.borrower,f.loan]);await f.client.query('set local role authenticated');
  await post(f,{key:crypto.randomUUID(),id:proof,creditUsed:'400',expectedCredit:'400',allocations:[{id:f.due,amount:'1000',expectedBalance:'1000'}]});
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),0);assert.equal((await f.client.query('select status from public.transactions where id=$1',[f.due])).rows[0].status,'paid');
 }finally{await release(f)}
});

test('closed, archived and foreign borrower dues cannot receive an allocation',async()=>{
 const f=await fixture();try{
  for(const change of ["status='cancelled'","status='paid',date_paid=current_date","archived_at=current_date","user_id='"+f.admin+"'"]){
   await f.client.query('savepoint unavailable');await f.client.query('reset role');await f.client.query('update public.transactions set '+change+' where id=$1',[f.due]);await f.client.query('set local role authenticated');await assert.rejects(post(f),/unavailable borrower due/);await f.client.query('rollback to savepoint unavailable');
  }
  assert.equal((await f.client.query('select status from public.payments where id=$1',[f.proof])).rows[0].status,'pending');
 }finally{await release(f)}
});

test('two simultaneous credit reviews cannot spend the same credit twice',async()=>{
 const f=await fixture();await post(f,{allocations:[]});const a=await addDue(f,600,2),b=await addDue(f,600,3);await f.client.query('commit');f.client.release();
 const run=async id=>{const client=await db.connect();try{await client.query('begin');await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.admin,role:'authenticated',session_id:f.sid})]);await client.query('set local role authenticated');await client.query("select public.mobile_action('credit-apply',$1)",[{key:crypto.randomUUID(),reviewed:true,userId:f.borrower,paidDate:new Date().toISOString().slice(0,10),creditUsed:'600',expectedCredit:'1000',allocations:[{id,amount:'600',expectedBalance:'600'}]}]);await client.query('commit')}catch(e){await client.query('rollback');throw e}finally{client.release()}};
 const results=await Promise.allSettled([run(a),run(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/credit changed/);
 assert.equal(Number((await db.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),400);
});

test('review date records the lender action separately from the earlier bank payment date',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');await f.client.query('update public.payments set paid_date=current_date-10 where id=$1',[f.proof]);await f.client.query('set local role authenticated');await post(f);
  assert.equal((await f.client.query("select reviewed_at=(now() at time zone 'Asia/Manila')::date as today,paid_date<reviewed_at as separate from public.payments where id=$1",[f.proof])).rows[0].today,true);
 }finally{await release(f)}
});

test('borrower allocation reads have a covering ownership index',async()=>{
 assert.match((await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='payment_allocations_user'")).rows[0]?.indexdef??'',/user_id, posting_id/);
});

const invoice=f=>f.client.query("select public.create_invoice($1,'Synthetic borrower',current_date,array[current_date],1000,0,0,1000,'[]'::jsonb)",[f.borrower]);
const disburse=f=>f.client.query("select (public.create_loan_disbursement($1,null::uuid,'QA-SECURITY',current_date,'QA','QA bank','000000','QA borrower',1000,1000,100,current_date,current_date,0,0,0,0,1000,'bank_transfer','[]'::jsonb)).id id",[f.borrower]);
async function revokeSession(f){await f.client.query('reset role');await f.client.query('delete from auth.sessions where id=$1',[f.sid]);await f.client.query('set local role authenticated')}

test('legacy disbursement creation requires a lender and rejects revoked lender sessions',async()=>{
 const f=await fixture();try{assert.ok((await disburse(f)).rows[0].id);await revokeSession(f);await assert.rejects(disburse(f),/not authorized|active sign-in/i);}finally{await release(f)}
});
test('legacy invoice and disbursement creation deny a signed-in borrower',async()=>{
 for(const action of [invoice,disburse]){const f=await fixture();try{await f.client.query('reset role');await f.client.query("update public.profiles set role='user' where id=$1",[f.admin]);await f.client.query('set local role authenticated');await assert.rejects(action(f),/not authorized|active sign-in/i);}finally{await release(f)}}
});
test('legacy request status updates require a live lender session',async()=>{
 const f=await fixture();try{await f.client.query('reset role');const id=crypto.randomUUID();await f.client.query("insert into public.loan_requests(id,user_id,amount,term_months,monthly_rate,bank_name,bank_account_number,bank_account_name) values($1,$2,1000,3,0.03,'QA bank','000','Synthetic')",[id,f.borrower]);await f.client.query('set local role authenticated');await f.client.query("select public.update_loan_request_status($1,'pending','Synthetic review')",[id]);await revokeSession(f);await assert.rejects(f.client.query("select public.update_loan_request_status($1,'completed','Must reject')",[id]),/not authorized|active sign-in/i);}finally{await release(f)}
});
test('legacy disbursement acknowledgement rejects foreign owners and revoked borrower sessions',async()=>{
 for(const mode of ['foreign','revoked','valid']){const f=await fixture();try{const id=(await disburse(f)).rows[0].id;await f.client.query('reset role');await f.client.query("update public.loan_disbursements set status='assigned' where id=$1",[id]);const actor=mode==='foreign'?f.admin:f.borrower,sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,actor]);if(mode==='revoked')await f.client.query('delete from auth.sessions where id=$1',[sid]);await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,role:'authenticated',session_id:sid})]);await f.client.query('set local role authenticated');const action=()=>f.client.query('select public.acknowledge_loan_disbursement($1)',[id]);if(mode==='valid')await action();else await assert.rejects(action(),/not found|active sign-in/i);}finally{await release(f)}}
});

test('legacy invoice creation accepts an active lender but rejects the same revoked session',async()=>{
 const f=await fixture();try{
  assert.equal((await f.client.query('select public.is_admin() allowed')).rows[0].allowed,true);await invoice(f);
  await revokeSession(f);await assert.rejects(invoice(f),/not authorized|active sign-in/i);
 }finally{await release(f)}
});

test('legacy administrator predicate is false after the auth session is revoked',async()=>{
 const f=await fixture();try{await revokeSession(f);assert.equal((await f.client.query('select public.is_admin() allowed')).rows[0].allowed,false)}finally{await release(f)}
});

test('self-service profile editing requires an active account and a live session',async()=>{
 for(const mode of ['revoked','disabled']){const f=await fixture();try{
  await f.client.query("select public.update_my_profile('Synthetic','Lender','','123')");
  if(mode==='revoked')await revokeSession(f);else{await f.client.query('reset role');await f.client.query("update public.profiles set status='disabled' where id=$1",[f.admin]);await f.client.query('set local role authenticated')}
  await assert.rejects(f.client.query("select public.update_my_profile('Changed','After lock','','456')"),/active sign-in/i);
 }finally{await release(f)}}
});

test('invited account activation accepts a live session and rejects a revoked one',async()=>{
 for(const revoked of [false,true]){const f=await fixture();try{
  await f.client.query('reset role');await f.client.query("update public.profiles set role='user',status='invited' where id=$1",[f.admin]);await f.client.query('set local role authenticated');
  if(revoked){await revokeSession(f);await assert.rejects(f.client.query('select public.activate_my_account()'),/active sign-in/i)}
  else{await f.client.query('select public.activate_my_account()');await f.client.query('reset role');assert.equal((await f.client.query('select status from public.profiles where id=$1',[f.admin])).rows[0].status,'active')}
 }finally{await release(f)}}
});

test('revoked sessions cannot read their profile through the older own-record policy',async()=>{
 const f=await fixture();try{
  assert.equal((await f.client.query('select count(*)::int n from public.profiles where id=$1',[f.admin])).rows[0].n,1);
  await revokeSession(f);assert.equal((await f.client.query('select count(*)::int n from public.profiles where id=$1',[f.admin])).rows[0].n,0);
 }finally{await release(f)}
});

test('every public table exposed to signed-in clients has a restrictive live-session boundary',async()=>{
 const rows=(await db.query("select distinct p.tablename from pg_policies p where p.schemaname='public' and p.permissive='PERMISSIVE' and (p.roles && array['authenticated','public']::name[]) and not exists(select 1 from pg_policies s where s.schemaname=p.schemaname and s.tablename=p.tablename and s.permissive='RESTRICTIVE' and s.policyname in ('mobile_valid_session','mobile_live_session'))")).rows;
 assert.deepEqual(rows,[]);
});

test('proof storage and verified submissions cap new files at 5 MB even when an old caller requests 10 MB',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');
  assert.equal(Number((await f.client.query("select file_size_limit from storage.buckets where id='payment-proofs'")).rows[0].file_size_limit),5242880);
  const objectId=crypto.randomUUID(),name=f.admin+'/boundary.png';
  await f.client.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'payment-proofs',$2,jsonb_build_object('mimetype','image/png','size',5242880))",[objectId,name]);
  await f.client.query("insert into mobile_private.verified_uploads(object_id,owner_id,bucket,path,updated_at,sha256,mime,size) select id,$2,'payment-proofs',name,updated_at,repeat('a',64),'image/png',5242880 from storage.objects where id=$1",[objectId,f.admin]);
  await f.client.query("select mobile_private.check_file('payment-proofs',$1,array['image/png'],10485760)",[name]);
  await f.client.query("update storage.objects set metadata=jsonb_set(metadata,'{size}','5242881') where id=$1",[objectId]);
  await f.client.query('update mobile_private.verified_uploads set size=5242881 where object_id=$1',[objectId]);
  await assert.rejects(f.client.query("select mobile_private.check_file('payment-proofs',$1,array['image/png'],10485760)",[name]),/5 MB/);
 }finally{await release(f)}
});

async function feePayload(f,patch={}){const dates=(await f.client.query("select to_char(due_date,'YYYY-MM-DD') as day,to_char(now() at time zone 'Asia/Manila','YYYY-MM-01') as cycle from public.transactions where id=$1",[f.due])).rows[0];return {key:crypto.randomUUID(),borrowerId:f.borrower,assessmentMonth:dates.cycle,sourceDueDate:dates.day,chargeDueDate:dates.day,financeEnabled:true,rate:'3',lateEnabled:true,lateAmount:'1500',reviewed:true,selections:[{id:f.due,expectedBalance:'1000'}],...patch}}
const assessFee=async(f,payload)=>((await f.client.query("select public.mobile_action('fee-assess',$1) result",[payload])).rows[0].result)

test('admin can correct assessed fee fields while retaining the original assessment snapshot',async()=>{
 const f=await fixture();try{
  const assessment=await assessFee(f,await feePayload(f));const before=(await f.client.query('select to_jsonb(a) row from public.fee_assessments a where id=$1',[assessment.id])).rows[0].row;
  const fee=(await f.client.query("select id from public.transactions where fee_assessment_id=$1 and fee_kind='finance_charge'",[assessment.id])).rows[0].id;
  const r=(await correct({...f,due:fee},await correctionPayload({...f,due:fee},{amount:'25.50',description:'Corrected finance charge',type:'Installment',txnDate:'2026-10-01',dueDate:'2026-12-10',status:'paid',datePaid:'2026-10-19'}))).rows[0].result;
  assert.equal(r.transaction.amount,25.5);assert.equal(r.transaction.type,'Installment');assert.equal(r.transaction.status,'paid');assert.equal(r.transaction.date_paid,'2026-10-19');assert.equal(r.transaction.fee_assessment_id,assessment.id);
  assert.deepEqual((await f.client.query('select to_jsonb(a) row from public.fee_assessments a where id=$1',[assessment.id])).rows[0].row,before);
 }finally{await release(f)}
});
test('reversal cannot spend correction credit that was already applied elsewhere',async()=>{
 const f=await fixture(400);try{
  await post(f);await correct(f,await correctionPayload(f,{amount:100}));const due=await addDue(f,200);
  await f.client.query("select public.mobile_action('credit-apply',$1)",[{userId:f.borrower,key:crypto.randomUUID(),paidDate:(await f.client.query("select to_char(current_date,'YYYY-MM-DD') as day")).rows[0].day,reviewed:true,expectedCredit:'300',creditUsed:'200',allocations:[{id:due,amount:'200',expectedBalance:'200'}]}]);
  const posting=(await f.client.query('select id from public.payment_postings where payment_id=$1',[f.proof])).rows[0].id;
  await f.client.query('savepoint credit_already_used');await assert.rejects(f.client.query("select public.mobile_action('payment-reverse',$1)",[{key:crypto.randomUUID(),id:posting,reviewed:true,reason:'Synthetic reversal must reject spent correction credit',expectedCredit:'100'}]),/already used/);await f.client.query('rollback to savepoint credit_already_used');
  assert.equal(Number((await f.client.query('select credit_balance from public.profiles where id=$1',[f.borrower])).rows[0].credit_balance),100);
 }finally{await release(f)}
});
test('a stale correction and a changed retry cannot overwrite later edits',async()=>{
 const f=await fixture();try{
  const stale=await correctionPayload(f,{description:'Stale correction must fail'}),first=await correctionPayload(f,{description:'First saved correction'});await correct(f,first);
  for(const payload of [stale,{...first,reason:'Changed retry must not save'}]){await f.client.query('savepoint stale_correction');await assert.rejects(correct(f,payload),/changed/i);await f.client.query('rollback to savepoint stale_correction')}
  assert.equal((await f.client.query('select description from public.transactions where id=$1',[f.due])).rows[0].description,'First saved correction');
 }finally{await release(f)}
});

test('fee assessment posts both positive fee dues atomically with immutable calculation snapshots',async()=>{
 const f=await fixture();try{const p=await feePayload(f),result=await assessFee(f,p);assert.equal(Number(result.total),1530);
 const rows=(await f.client.query('select * from public.transactions where fee_assessment_id=$1 order by fee_kind',[result.id])).rows;
 assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>Number(r.amount)),[30,1500]);assert.ok(rows.every(r=>r.type==='Straight'&&!r.loan_id&&r.user_id===f.borrower));assert.match(rows[0].description,/3% Finance Charge.*₱1,000.00/);assert.equal((await f.client.query("select to_char(due_date,'YYYY-MM-DD') as day from public.transactions where id=$1",[rows[0].id])).rows[0].day,p.chargeDueDate);
 const header=(await f.client.query('select * from public.fee_assessments where id=$1',[result.id])).rows[0];assert.equal(Number(header.base_amount),1000);assert.equal(header.source_rows[0].id,f.due);
 assert.equal(Number((await f.client.query('select amount from public.transactions where id=$1',[f.due])).rows[0].amount),1000);
 }finally{await release(f)}
});
test('fee assessment retries are idempotent and a different key cannot assess the same cycle twice',async()=>{
 const f=await fixture();try{const p=await feePayload(f),a=await assessFee(f,p),b=await assessFee(f,p);assert.deepEqual(a,b);
 await assert.rejects(assessFee(f,{...p,key:crypto.randomUUID()}),/already assessed/i);
 }finally{await release(f)}
});
test('fee calculation includes selected unpaid prior fees and uses only the remaining balance',async()=>{
 const f=await fixture();try{await f.client.query('reset role');await f.client.query('update public.transactions set amount_applied=400 where id=$1',[f.due]);
 const oldFee='legacy-fee-'+crypto.randomUUID();await f.client.query("insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date) select $1,user_id,1,'Late Payment fee for earlier period',1500,'Straight',txn_date,due_date from public.transactions where id=$2",[oldFee,f.due]);await f.client.query('set local role authenticated');
 const result=await assessFee(f,await feePayload(f,{lateEnabled:false,lateAmount:'',selections:[{id:f.due,expectedBalance:'600'},{id:oldFee,expectedBalance:'1500'}]}));assert.equal(Number(result.base),2100);assert.equal(Number(result.finance),63);assert.equal(Number(result.late),0);
 }finally{await release(f)}
});
test('fee posting rejects changed balances, foreign ownership and missing review',async()=>{
 for(const change of ['stale','foreign','unconfirmed']){const f=await fixture();try{const p=await feePayload(f);if(change==='stale')p.selections[0].expectedBalance='999';if(change==='foreign')p.borrowerId=f.admin;if(change==='unconfirmed')p.reviewed=false;await assert.rejects(assessFee(f,p),/changed|unavailable|borrower|confirm/i);}finally{await release(f)}}
});
test('borrowers and revoked lender sessions cannot assess or read another borrower fee history',async()=>{
 const f=await fixture();try{const p=await feePayload(f);await f.client.query('reset role');await f.client.query("update public.profiles set role='user' where id=$1",[f.admin]);await f.client.query('set local role authenticated');await assert.rejects(assessFee(f,p),/lender/i);}finally{await release(f)}
 const revoked=await fixture();try{const p=await feePayload(revoked);await revokeSession(revoked);await assert.rejects(assessFee(revoked,p),/active sign-in/i);}finally{await release(revoked)}
});
test('switches and decimal rate rounding are enforced by the fee server independently',async()=>{
 const f=await fixture();try{const p=await feePayload(f,{financeEnabled:false,rate:'',lateAmount:'500'});const r=await assessFee(f,p);assert.equal(Number(r.finance),0);assert.equal(Number(r.total),500);}finally{await release(f)}
 const other=await fixture();try{const p=await feePayload(other,{rate:'3.25',lateEnabled:false,lateAmount:''});const r=await assessFee(other,p);assert.equal(Number(r.finance),32.5);}finally{await release(other)}
});
test('an unpaid fee assessment can be voided with a reason and corrected without losing its audit history',async()=>{
 const f=await fixture();try{const p=await feePayload(f),r=await assessFee(f,p);await f.client.query("select public.mobile_action('fee-void',$1)",[{id:r.id,reason:'Synthetic assessment correction',key:crypto.randomUUID(),reviewed:true}]);
 assert.equal(Number((await f.client.query("select count(*) n from public.transactions where fee_assessment_id=$1 and status='cancelled'",[r.id])).rows[0].n),2);
 const header=(await f.client.query('select void_reason from public.fee_assessments where id=$1',[r.id])).rows[0];assert.equal(header.void_reason,'Synthetic assessment correction');assert.notEqual((await assessFee(f,{...p,key:crypto.randomUUID()})).id,r.id);
 }finally{await release(f)}
});
test('assessed fees accept reviewed payments and cannot be voided after allocation',async()=>{
 const f=await fixture(30);try{const r=await assessFee(f,await feePayload(f,{lateEnabled:false}));const fee=(await f.client.query("select id from public.transactions where fee_assessment_id=$1",[r.id])).rows[0].id;
 await post(f,{allocations:[{id:fee,amount:'30',expectedBalance:'30'}]});assert.equal((await f.client.query('select status from public.transactions where id=$1',[fee])).rows[0].status,'paid');
 await assert.rejects(f.client.query("select public.mobile_action('fee-void',$1)",[{id:r.id,key:crypto.randomUUID(),reason:'Must reverse allocated payment first',reviewed:true}]),/payment|allocated/i);
 }finally{await release(f)}
});

test('two concurrent fee confirmations cannot charge the same borrower and month twice',async()=>{
 const f=await fixture(),p=await feePayload(f);await f.client.query('commit');f.client.release();
 const clients=await Promise.all([db.connect(),db.connect()]);
 try{const results=await Promise.allSettled(clients.map(async c=>{try{await c.query('begin');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.admin,role:'authenticated',session_id:f.sid})]);await c.query('set local role authenticated');const result=await c.query("select public.mobile_action('fee-assess',$1)",[{...p,key:crypto.randomUUID()}]);await c.query('commit');return result.rows}catch(e){await c.query('rollback');throw e}}));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&/already assessed/i.test(r.reason.message)).length,1);assert.equal(Number((await db.query('select count(*) n from public.fee_assessments where user_id=$1',[f.borrower])).rows[0].n),1)}finally{clients.forEach(c=>c.release())}
});

test('fee snapshots are private to their borrower and deny direct financial edits',async()=>{
 const f=await fixture();try{const r=await assessFee(f,await feePayload(f));await f.client.query('reset role');await f.client.query("update public.profiles set role='user' where id=$1",[f.admin]);await f.client.query('set local role authenticated');assert.equal(Number((await f.client.query('select count(*) n from public.fee_assessments where id=$1',[r.id])).rows[0].n),0);}finally{await release(f)}
 const other=await fixture();try{const r=await assessFee(other,await feePayload(other));await assert.rejects(other.client.query('update public.transactions set amount=1 where fee_assessment_id=$1',[r.id]),/fee manager|payment review/i);}finally{await release(other)}
});

test('a stale calendar cycle and invalid or empty fee requests fail without posting charges',async()=>{
 for(const patch of [{assessmentMonth:'2000-01-01'},{financeEnabled:false,lateEnabled:false},{rate:'3.001'},{rate:'101'},{lateAmount:'-1'},{selections:[]},{selections:[{id:'missing',expectedBalance:'1000'}]}]){const f=await fixture();try{await assert.rejects(assessFee(f,await feePayload(f,patch)));}finally{await release(f)}}
});

test('a retry key cannot change its reviewed fees and a 100 percent description retains both zeros',async()=>{
 const f=await fixture();try{const p=await feePayload(f,{rate:'100',lateEnabled:false}),r=await assessFee(f,p);assert.equal((await f.client.query('select description from public.transactions where fee_assessment_id=$1',[r.id])).rows[0].description.startsWith('100% Finance Charge'),true);await assert.rejects(assessFee(f,{...p,rate:'99'}),/retry details changed/i);}finally{await release(f)}
});

test('an older monthly assessment does not block a new reviewed calendar month',async()=>{
 const f=await fixture();try{const p=await feePayload(f);await f.client.query('reset role');await f.client.query("insert into public.fee_assessments(user_id,actor_id,operation_key,source_due_date,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_rows) values($1,$2,$3,$4,($5::date-interval '1 month')::date,$4,true,3,false,1000,30,0,30,'[]')",[f.borrower,f.admin,crypto.randomUUID(),p.sourceDueDate,p.assessmentMonth]);await f.client.query('set local role authenticated');const r=await assessFee(f,p);assert.equal(r.saved,true);assert.equal(Number((await f.client.query('select count(*) n from public.fee_assessments where user_id=$1',[f.borrower])).rows[0].n),2);}finally{await release(f)}
});


test('disabled accounts lose existing session access and cannot mint or refresh tokens',async()=>{
 const f=await fixture();try{
  assert.equal((await f.client.query('select mobile_private.valid_session() ok')).rows[0].ok,true);
  await f.client.query("update public.profiles set status='disabled' where id=$1",[f.admin]);
  assert.equal((await f.client.query('select mobile_private.valid_session() ok')).rows[0].ok,false);
  await f.client.query('reset role');
  assert.equal((await f.client.query("select has_function_privilege('supabase_auth_admin','mobile_private.account_disabled(uuid)','EXECUTE') ok")).rows[0].ok,true);
  for(const authentication_method of ['password','token_refresh','otp']){
   const r=(await f.client.query('select mobile_private.login_access_token($1) r',[{user_id:f.admin,authentication_method,claims:{sub:f.admin}}])).rows[0].r;
   assert.equal(r.error.message,'LOGIN_ACCOUNT_DISABLED');
  }
  await f.client.query('reset role');
  await f.client.query("update public.profiles set status='active' where id=$1",[f.admin]);
  assert.equal((await f.client.query('select mobile_private.valid_session() ok')).rows[0].ok,true);
 }finally{await release(f)}
});

test('override history is not readable or writable by browser roles',async()=>{
 const r=(await db.query("select has_table_privilege('anon','mobile_private.borrower_access_events','SELECT') a,has_table_privilege('authenticated','mobile_private.borrower_access_events','SELECT') b,has_table_privilege('authenticated','mobile_private.borrower_access_events','INSERT') c")).rows[0];
 assert.deepEqual(r,{a:false,b:false,c:false});
});

test('chat and due-date changes publish scoped metadata even when the source is deleted',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');
  const m=(await f.client.query("insert into public.messages(borrower_id,sender_id,from_admin,body) values($1,$2,true,'Synthetic realtime fixture') returning id",[f.borrower,f.admin])).rows[0].id;
  const version=async table=>Number((await f.client.query('select version from public.'+table+' where borrower_id=$1',[f.borrower])).rows[0]?.version);
  assert.equal(await version('message_change_signals'),1);
  await f.client.query("update public.messages set body='Synthetic changed message' where id=$1",[m]);assert.equal(await version('message_change_signals'),2);
  await f.client.query('delete from public.messages where id=$1',[m]);assert.equal(await version('message_change_signals'),3);
  await f.client.query("insert into public.payment_due_overrides(borrower_id,due_dates,updated_by) values($1,array['2026-10-26'],$2)",[f.borrower,f.admin]);assert.equal(await version('payment_due_change_signals'),1);
  await f.client.query("update public.payment_due_overrides set next_due_dates=array['2026-11-26'] where borrower_id=$1",[f.borrower]);assert.equal(await version('payment_due_change_signals'),2);
  await f.client.query('delete from public.payment_due_overrides where borrower_id=$1',[f.borrower]);assert.equal(await version('payment_due_change_signals'),3);
  assert.equal((await f.client.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and tablename in ('message_change_signals','payment_due_change_signals')")).rows[0].n,2);
 }finally{await release(f)}
});

test('borrowers cannot read other change signals or forge invalidations',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');const sid=crypto.randomUUID();await f.client.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,f.borrower]);
  for(const table of ['message_change_signals','payment_due_change_signals'])await f.client.query('insert into public.'+table+'(borrower_id) values($1),($2)',[f.borrower,f.admin]);
  await f.client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:f.borrower,role:'authenticated',session_id:sid})]);await f.client.query('set local role authenticated');
  for(const table of ['message_change_signals','payment_due_change_signals']){
   assert.deepEqual((await f.client.query('select borrower_id from public.'+table)).rows.map(r=>r.borrower_id),[f.borrower]);
   assert.equal((await f.client.query("select has_table_privilege('authenticated',$1,'INSERT') p",['public.'+table])).rows[0].p,false);
  }
 }finally{await release(f)}
});

test('loan rate configuration supports an initially empty table and one atomic admin batch',async()=>{
 const f=await fixture();try{
  await f.client.query('delete from public.loan_request_rates');
  await f.client.query("insert into public.loan_request_rates(term_months,monthly_rate) values(3,0.012),(6,0.0145),(12,0.017),(24,0.0195),(36,0.022) on conflict(term_months) do update set monthly_rate=excluded.monthly_rate");
  assert.equal((await f.client.query('select count(*)::int n from public.loan_request_rates')).rows[0].n,5);
  await f.client.query('savepoint invalid_rate');
  await assert.rejects(f.client.query('insert into public.loan_request_rates(term_months,monthly_rate) values(3,0.03),(99,0.02) on conflict(term_months) do update set monthly_rate=excluded.monthly_rate'),/constraint/);
  await f.client.query('rollback to savepoint invalid_rate');
  assert.equal(Number((await f.client.query('select monthly_rate from public.loan_request_rates where term_months=3')).rows[0].monthly_rate),0.012);
 }finally{await release(f)}
});

test('Telegram queue is future-only, atomic with proof submission, private, and does not change financial records',async()=>{
 const f=await fixture();try{
  await f.client.query('reset role');
  assert.equal((await f.client.query('select count(*)::int n from mobile_private.telegram_deliveries where payment_id=$1',[f.proof])).rows[0].n,0);
  await f.client.query("update mobile_private.telegram_settings set enabled=true,chat_id='123456',chat_label='Synthetic private chat',bot_id='1',version=version+1 where singleton");
  const before=(await f.client.query('select t.amount,t.status,p.credit_balance from public.transactions t join public.profiles p on p.id=t.user_id where t.id=$1',[f.due])).rows[0];
  const payment=crypto.randomUUID();await f.client.query('savepoint new_proof');
  const insert=()=>f.client.query("insert into public.payments(id,user_id,loan_id,amount,method,reference,file_name,file_type,file_path) values($1,$2,$3,500,'Bank Transfer','synthetic reference','synthetic.png','image','synthetic-only.png')",[payment,f.borrower,f.loan]);
  await insert();
  const job=(await f.client.query('select * from mobile_private.telegram_deliveries where payment_id=$1',[payment])).rows[0];
  assert.equal(job.status,'queued');assert.equal(job.destination,'123456');assert.equal(job.payload.borrower,'Synthetic borrower');assert.equal(Number(job.payload.amount),500);
  assert.deepEqual((await f.client.query('select t.amount,t.status,p.credit_balance from public.transactions t join public.profiles p on p.id=t.user_id where t.id=$1',[f.due])).rows[0],before);
  assert.ok((await f.client.query('select count(*)::int n from mobile_private.notification_events')).rows[0].n>0,'existing in-app notification events remain queued');
  await f.client.query('rollback to savepoint new_proof');
  assert.equal((await f.client.query('select count(*)::int n from mobile_private.telegram_deliveries where payment_id=$1',[payment])).rows[0].n,0);
  await insert();assert.equal((await f.client.query('select count(*)::int n from mobile_private.telegram_deliveries where payment_id=$1',[payment])).rows[0].n,1);
  for(const role of ['anon','authenticated'])for(const table of ['telegram_settings','telegram_connections','telegram_deliveries','telegram_audit'])assert.equal((await f.client.query('select has_table_privilege($1,$2,\'SELECT\') ok',[role,'mobile_private.'+table])).rows[0].ok,false);
 }finally{await release(f)}
});
test('Telegram delivery records success once and marks ambiguous sends for manual review',async()=>{
 const f=await fixture();await f.client.query('reset role');await f.client.query("update mobile_private.telegram_settings set enabled=true,chat_id='123456',bot_id='1',version=version+1 where singleton");
 const id=crypto.randomUUID();await f.client.query("insert into mobile_private.telegram_deliveries(payment_id,destination,bot_id,settings_version,payload) select $1,'123456','1',version,$2 from mobile_private.telegram_settings",[f.proof,{borrower:'Synthetic borrower',amount:1000,reference:'QA',submittedAt:new Date().toISOString()}]);
 await f.client.query('commit');f.client.release();
 const createTelegram=require('../../server/telegram.cjs');let sends=0;
 const fetchImpl=async url=>({ok:true,status:200,json:async()=>({ok:true,result:url.endsWith('/getMe')?{id:1,is_bot:true,username:'PayTrack_payment_bot'}:(sends++,{message_id:123})})});
 const service=createTelegram({db,active:async()=>({id:f.admin}),origin:'https://fixture.example',token:'123456:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',deliveryEnabled:true,fetchImpl});
 try{
  await service.run();await service.run();assert.equal(sends,1);
  assert.equal((await db.query('select status from mobile_private.telegram_deliveries where payment_id=$1',[f.proof])).rows[0].status,'delivered');
  await db.query("insert into mobile_private.telegram_deliveries(id,kind,destination,bot_id,settings_version,payload) select $1,'test','123456','1',version,'{}' from mobile_private.telegram_settings",[id]);
  const uncertain=createTelegram({db,active:async()=>({id:f.admin}),origin:'https://fixture.example',token:'123456:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',deliveryEnabled:true,fetchImpl:async url=>{if(url.endsWith('/sendMessage'))throw Error('network timeout');return fetchImpl(url)}});
  await uncertain.run();await uncertain.run();assert.equal((await db.query('select status from mobile_private.telegram_deliveries where id=$1',[id])).rows[0].status,'uncertain');assert.equal(sends,1);
 }finally{await db.query("update mobile_private.telegram_settings set enabled=false where singleton")}
});
