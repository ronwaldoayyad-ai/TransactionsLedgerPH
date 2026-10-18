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
 return {client,admin,borrower,proof,due,loan,payload:{key:crypto.randomUUID(),id:proof,status:'approved',reviewed:true,creditUsed:'0.00',expectedCredit:'0.00',allocations:[{id:due,amount:String(amount),expectedBalance:'1000.00'}]}};
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
