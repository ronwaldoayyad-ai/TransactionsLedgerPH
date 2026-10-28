const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Pool}=require('pg'),{createRequestSecurity}=require('../../server/request-security.cjs');
test('real PostgreSQL quotas are atomic across processes, reset expired windows, and never expose raw subjects',async()=>{
 const config={host:'127.0.0.1',port:Number(process.env.PAYMENT_TEST_PORT||25432),user:'postgres',password:'postgres',max:8,connectionTimeoutMillis:5000},name='security_test_'+crypto.randomBytes(6).toString('hex'),control=new Pool({...config,database:'postgres'});let db;
 try{await control.query('create database '+name);db=new Pool({...config,database:name});await db.query('create schema mobile_private; create table mobile_private.service_rate_limits(subject text primary key,window_start timestamptz not null,attempts integer not null)');
  const a=createRequestSecurity({db,secret:'synthetic-test-secret-at-least-32-characters'}),b=createRequestSecurity({db,secret:'synthetic-test-secret-at-least-32-characters'});
  const results=await Promise.allSettled(Array.from({length:30},(_,i)=>(i%2?a:b).consume('fixture','192.0.2.1',15,60)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,15);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
  const rows=(await db.query('select * from mobile_private.service_rate_limits')).rows;assert.equal(rows.length,1);assert.match(rows[0].subject,/^[0-9a-f]{64}$/);assert.ok(rows[0].attempts>=16);
  await db.query("update mobile_private.service_rate_limits set window_start=now()-interval '2 minutes'");const c=createRequestSecurity({db,secret:'synthetic-test-secret-at-least-32-characters'});await c.consume('fixture','192.0.2.1',15,60);assert.equal((await db.query('select attempts from mobile_private.service_rate_limits')).rows[0].attempts,1);
 }finally{await db?.end();await control.query('drop database if exists '+name);await control.end();}
});
