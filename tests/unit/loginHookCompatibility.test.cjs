const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const create=require('../../server/login-access.cjs');
const id='00000000-0000-4000-8000-000000000001';
function fixture(withHook=false){
 const rows=new Map();const state={valid:false};
 async function query(sql,params=[]){
  const subject=params[0];
  if(sql.includes('from auth.users'))return {rows:[{id,has_password:true}]};
  if(sql.startsWith('insert into mobile_private.login_attempts')){if(!rows.has(subject))rows.set(subject,{subject,kind:params[1],failed_count:0,reference:crypto.randomUUID(),locked_at:null});return {rows:[]};}
  if(sql.startsWith('select * from mobile_private.login_attempts'))return {rows:rows.has(subject)?[{...rows.get(subject)}]:[]};
  if(sql.startsWith('update mobile_private.login_attempts set failed_count=least')){const row=rows.get(subject);row.failed_count=Math.min(5,row.failed_count+1);if(row.failed_count===5)row.locked_at='fixture-lock';return {rows:[{...row}]};}
  if(sql.startsWith('update mobile_private.login_attempts set failed_count=0')){const row=rows.get(subject);if(row&&!row.locked_at)row.failed_count=0;return {rows:[]};}
  return {rows:[]};
 }
 const client={query,release(){}},db={query,connect:async()=>client};
 const service=create({db,active:async()=>({id}),localAuth:async()=>({}),api:'https://fixture.supabase.co',cookiePath:'/api',jwt:()=> 'public-fixture',hash:value=>crypto.createHash('sha256').update(value).digest('hex')});
 const fetch=async()=>{if(state.valid)return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh'});if(withHook){const r=rows.get('account:'+id);r.failed_count++;if(r.failed_count===5)r.locked_at='fixture-lock';}return Response.json({error_code:'invalid_credentials'},{status:400});};
 return {service,state,fetch,rows};
}
test('five failed app attempts lock an account without a paid password hook',async()=>{
 const f=fixture(),old=global.fetch;global.fetch=f.fetch;
 try{for(let i=1;i<=5;i++)await assert.rejects(f.service.password({headers:{}},{setHeader(){}},{email:'fixture@test.invalid',password:'wrong'}),e=>e.login.remaining===5-i&&e.login.locked===(i===5));}
 finally{global.fetch=old;}
});
test('when a password hook is available, failures are not counted twice',async()=>{
 const f=fixture(true),old=global.fetch;global.fetch=f.fetch;
 try{for(let i=1;i<=3;i++)await assert.rejects(f.service.password({headers:{}},{setHeader(){}},{email:'fixture@test.invalid',password:'wrong'}),e=>e.login.remaining===5-i);}
 finally{global.fetch=old;}
});
test('successful sign-in resets preceding unlocked failures',async()=>{
 const f=fixture(),old=global.fetch;global.fetch=f.fetch;
 try{await assert.rejects(f.service.password({headers:{}},{setHeader(){}},{email:'fixture@test.invalid',password:'wrong'}));f.state.valid=true;await f.service.password({headers:{}},{setHeader(){}},{email:'fixture@test.invalid',password:'valid'});assert.equal(f.rows.get('account:'+id).failed_count,0);}
 finally{global.fetch=old;}
});
