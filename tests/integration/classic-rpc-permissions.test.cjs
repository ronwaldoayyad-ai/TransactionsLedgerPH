const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {db}=require('../fixtures/service.cjs');
after(()=>db.end());
const names=['acknowledge_loan_disbursement','activate_my_account','create_invoice','create_loan_disbursement','is_admin','update_loan_request_status','update_my_profile'];
test('Classic signed-in RPCs deny anonymous execution and retain authenticated access',async()=>{
 const rows=(await db.query("select p.proname,has_function_privilege('anon',p.oid,'execute') as anonymous,has_function_privilege('authenticated',p.oid,'execute') as signed_in,has_function_privilege('service_role',p.oid,'execute') as server from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])",[names])).rows;
 assert.equal(rows.length,7);for(const row of rows){assert.equal(row.anonymous,false,row.proname);assert.equal(row.signed_in,true,row.proname);assert.equal(row.server,true,row.proname);}
});
test('private access counters and release assignments remain unavailable to browser roles',async()=>{
 for(const table of ['login_attempts','service_rate_limits','release_assignments'])for(const role of ['anon','authenticated']){
  const row=(await db.query("select has_table_privilege($1,$2,'select') as allowed",[role,'mobile_private.'+table])).rows[0];assert.equal(row.allowed,false,role+':'+table);
 }
});