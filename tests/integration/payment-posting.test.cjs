const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const root=path.resolve(__dirname,'../..'),workspace=path.resolve(root,'../..');
const port=Number(process.env.PAYMENT_TEST_PORT??54322);
if(![54322,25432].includes(port))throw Error('Only the local staging or separate rehearsal port is permitted.');
const config={host:'127.0.0.1',port,user:'postgres',password:'postgres',connectionTimeoutMillis:5000,statement_timeout:10000};
const database='payment_posting_test_'+crypto.randomBytes(6).toString('hex');
const control=new Pool({...config,database:'postgres'});let db,created=false;
const clean=sql=>sql.replace(/^\\.*$/gm,'');
before(async()=>{
 await control.query('create database '+database);created=true;db=new Pool({...config,database});
 await db.query(clean(fs.readFileSync(path.join(workspace,'outputs/release-readiness/platform-pre.sql'),'utf8')));
 await db.query('alter table auth.users add primary key(id);alter table auth.sessions add primary key(id);alter table storage.objects add primary key(id);alter table storage.buckets add primary key(id)');
 await db.query(clean(fs.readFileSync(path.join(workspace,'outputs/staging-baseline/production-public-schema.sql'),'utf8')));
 await db.query('create publication supabase_realtime');
 await db.query("insert into storage.buckets(id,name,file_size_limit) values('payment-proofs','payment-proofs',10485760)");
 await db.query(fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8'));
 await db.query('set row_security=on;set check_function_bodies=on');
 if(!(await db.query("select to_regprocedure('mobile_private.post_reviewed_payment(jsonb,boolean)') as posting")).rows[0].posting)
  await db.query(fs.readFileSync(path.join(root,'supabase/migrations/20261018023949_reviewed_payment_posting.sql'),'utf8'));
});
after(async()=>{await db?.end();if(created&&/^payment_posting_test_[a-f0-9]{12}$/.test(database))await control.query('drop database '+database);await control.end()});

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
async function revokeSession(f){await f.client.query('reset role');await f.client.query('delete from auth.sessions where id=$1',[f.sid]);await f.client.query('set local role authenticated')}

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
