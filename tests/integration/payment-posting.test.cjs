const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const root=path.resolve(__dirname,'../..'),workspace=path.resolve(root,'../..');
const config={host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',connectionTimeoutMillis:5000,statement_timeout:10000};
const database='payment_posting_test_'+crypto.randomBytes(6).toString('hex');
const control=new Pool({...config,database:'postgres'});let db,created=false;
const clean=sql=>sql.replace(/^\\.*$/gm,'');
before(async()=>{
 await control.query('create database '+database);created=true;db=new Pool({...config,database});
 await db.query(clean(fs.readFileSync(path.join(workspace,'outputs/release-readiness/platform-pre.sql'),'utf8')));
 await db.query('alter table auth.users add primary key(id);alter table auth.sessions add primary key(id);alter table storage.objects add primary key(id);alter table storage.buckets add primary key(id)');
 await db.query(clean(fs.readFileSync(path.join(workspace,'outputs/staging-baseline/production-public-schema.sql'),'utf8')));
 await db.query('create publication supabase_realtime');
 await db.query(fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8'));
 await db.query('set row_security=on;set check_function_bodies=on');
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
 await client.query("insert into public.transactions(id,loan_id,user_id,n,description,amount,type,txn_date,due_date) values($1,$2,$3,1,'Synthetic due',1000,'Installment',current_date,current_date)",[due,loan,borrower]);
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
