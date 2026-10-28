const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Pool}=require('pg');
const {assertSingleTransaction}=require('../../release/option3/sql-transaction-boundaries.cjs');
const root=path.resolve(__dirname,'../..');
const candidate=fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8');
const commands=assertSingleTransaction(candidate);
const config={host:'127.0.0.1',port:Number(process.env.PAYMENT_TEST_PORT||25432),user:'postgres',password:'postgres',max:1,connectionTimeoutMillis:5000,statement_timeout:Number(process.env.MIGRATION_TEST_TIMEOUT_MS||30000)};
const clean=sql=>sql.replace(/^\\.*$/gm,'');

const {fingerprint}=require('../../release/option3/database-fingerprint.cjs');

async function prepare(db){
  await db.query(clean(fs.readFileSync(path.join(root,'tests/fixtures/sql/platform-pre.sql'),'utf8')));
  await db.query('alter table auth.users add primary key(id);alter table auth.sessions add primary key(id);alter table storage.objects add primary key(id);alter table storage.buckets add primary key(id)');
  await db.query(clean(fs.readFileSync(path.join(root,'tests/fixtures/sql/classic-public-schema.sql'),'utf8')));
  await db.query('set row_security=on;set check_function_bodies=on;create publication supabase_realtime');
  const id=crypto.randomUUID();
  await db.query("insert into auth.users(id,email,encrypted_password) values($1,'rollback-fixture@test.invalid','synthetic-opaque-password-hash')",[id]);
  await db.query("insert into public.profiles(id,email,name,role,status) values($1,'rollback-fixture@test.invalid','Rollback fixture','user','active')",[id]);
  await db.query("insert into public.loans(id,user_id,label,principal,duration_months,txn_date,first_payment_date) values('rollback-loan',$1,'Legacy unclassified loan',2000,2,'2026-10-01','2026-11-01')",[id]);
  await db.query("insert into public.transactions(id,user_id,loan_id,n,description,amount,type,txn_date,due_date,status,date_paid) values('rollback-unpaid',$1,'rollback-loan',1,'Legacy unpaid',1000,'Installment','2026-10-01','2026-11-01','unpaid',null),('rollback-paid',$1,'rollback-loan',2,'Legacy paid',1000,'Installment','2026-10-01','2026-12-01','paid','2026-10-12'),('rollback-negative',$1,null,1,'Legacy negative',-100,'Straight','2026-10-01','2026-11-01','unpaid',null)",[id]);
  await db.query("insert into public.payments(user_id,loan_id,amount,method,reference,status,submitted_at,file_name,file_type,file_path) values($1,'rollback-loan',1000,'Bank Transfer','LEGACY-ROLLBACK','approved','2026-10-12','fixture.png','image','fixture.png')",[id]);
  await db.query("insert into public.payment_logs(user_id,reference,subject,amount_owed,funds_applied,remaining_balance) values($1,'LEGACY-ROLLBACK','Legacy acknowledgement',1000,1000,0)",[id]);
  await db.query("insert into storage.buckets(id,name,file_size_limit) values('payment-proofs','payment-proofs',10485760)");
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('payment-proofs','fixture.png',$1,'{\"size\":7340032}')",[id]);
}

for(const [name,fraction]of [['early',0.1],['middle',0.5],['late',1]])test(`complete ${name} failure rollback, successful retry, and safe repeated-apply rejection`,{timeout:120000},async()=>{
  const database='release_atomic_'+crypto.randomBytes(6).toString('hex');
  const control=new Pool({...config,database:'postgres'});let db,created=false;
  try{
    await control.query('create database '+database);created=true;db=new Pool({...config,database});await prepare(db);
    const before=await fingerprint(db);
    const index=fraction===1?commands.length-2:Math.max(3,Math.floor(commands.length*fraction));
    const offset=commands[index].end;
    const broken=candidate.slice(0,offset)+'\nselect 1/0; -- deliberate local failure\n'+candidate.slice(offset);
    await assert.rejects(db.query(broken),/division by zero/);await db.query('rollback');
    assert.deepEqual(await fingerprint(db),before,'Every schema, policy, grant, function, trigger and saved data fingerprint must return to baseline.');
    await db.query(candidate);
    assert.equal((await db.query("select to_regclass('public.payment_postings')::text table_name")).rows[0].table_name,'public.payment_postings');
    assert.deepEqual((await db.query('select rollout_enabled,default_interface from mobile_private.release_settings')).rows[0],{rollout_enabled:false,default_interface:'classic'});
    const completed=await fingerprint(db);
    await assert.rejects(db.query(candidate),error=>['42710','42P07'].includes(error.code));await db.query('rollback');
    assert.deepEqual(await fingerprint(db),completed,'A repeated successful apply must not leave any changes or duplicate financial data.');
  }finally{
    await db?.end();if(created&&/^release_atomic_[a-f0-9]{12}$/.test(database))await control.query('drop database '+database);await control.end();
  }
});

module.exports={fingerprint};
