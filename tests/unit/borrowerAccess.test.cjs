const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const create=require('../../server/borrower-access.cjs')
function fixture(){
 const id=crypto.randomUUID(),admin=crypto.randomUUID(),events=new Map(),calls=[]
 const p={id,email:'synthetic@test.invalid',status:'invited'},auth={id,email:p.email,email_confirmed_at:null}
 const state={role:'admin',active:true,available:true,authFails:false,loan:{id:'synthetic-loan',user_id:id,loan_category:null}}
 async function query(sql,v=[]){
  calls.push(sql)
  if(sql.startsWith('select id,user_id,loan_category'))return {rows:state.loan?[{...state.loan}]:[]}
  if(sql.startsWith('update public.loans')){state.loan.loan_category=v[1];return {rowCount:1}}
  if(sql.startsWith('select id,email,status'))return {rows:state.available?[{...p}]:[]}
  if(sql.startsWith('select * from mobile_private.borrower_access_events'))return {rows:events.has(v[0])?[events.get(v[0])]:[]}
  if(sql.startsWith('select id,action'))return {rows:[...events.values()]}
  if(sql.startsWith('insert into mobile_private.borrower_access_events')){const category=sql.includes("'loan-category'");events.set(v[0],{id:v[0],user_id:v[1],actor_id:v[2],action:category?'loan-category':v[3],reason:v[category?3:4],details:JSON.parse(v[category?4:5]),state:sql.includes("'completed'")?'completed':'pending'});return {rowCount:1}}
  if(sql.startsWith('update public.profiles')){p.status=v[1];return {rowCount:1}}
  if(sql.startsWith('update mobile_private.borrower_access_events')){events.get(v[0]).state='completed';return {rowCount:1}}
  return {rows:[],rowCount:0}
 }
 const db={query,connect:async()=>({query,release(){}})}
 const service=create({db,active:async()=>{if(!state.active)throw Error('Sign in again');return {id:admin,role:state.role,status:'active'}},localAuth:async(path,method,body)=>{if(method==='PUT'){assert.deepEqual(body,{email_confirm:true});if(state.authFails)throw Error('Auth unavailable');auth.email_confirmed_at='2026-10-19T00:00:00Z'}return {...auth}}})
 const payload=patch=>({userId:id,key:crypto.randomUUID(),action:'status',status:'active',expectedStatus:p.status,expectedEmail:p.email,reviewed:true,reason:'Verified identity by telephone.',...patch})
 return {service,p,auth,state,events,calls,payload,id}
}
test('active lender can override status with a durable reviewed audit',async()=>{const f=fixture();const r=await f.service.save({},f.payload());assert.equal(r.status,'active');assert.equal(f.events.size,1);assert.equal([...f.events.values()][0].state,'completed');assert.ok(f.calls.includes('commit'))})
test('email override confirms Auth without activating the profile',async()=>{const f=fixture();const r=await f.service.save({},f.payload({action:'confirm-email'}));assert.ok(r.emailConfirmedAt);assert.equal(r.status,'invited');assert.equal([...f.events.values()][0].state,'completed')})
test('non-admin and expired sessions cannot access controls',async()=>{const f=fixture();f.state.role='user';await assert.rejects(f.service.details({},{userId:f.id}),/lender/);f.state.role='admin';f.state.active=false;await assert.rejects(f.service.save({},f.payload()),/Sign in/);assert.equal(f.events.size,0)})
test('status allowlist, review and reason are enforced before mutation',async()=>{for(const patch of [{status:'admin'},{reviewed:false},{reason:'short'},{key:'bad'},{action:'delete'}]){const f=fixture();await assert.rejects(f.service.save({},f.payload(patch)));assert.equal(f.events.size,0)}})
test('only borrower profiles can be targeted',async()=>{const f=fixture();f.state.available=false;await assert.rejects(f.service.save({},f.payload()),/unavailable/);assert.equal(f.events.size,0)})
test('stale status or email and pending email changes are rejected',async()=>{for(const patch of [{expectedStatus:'disabled'},{expectedEmail:'other@test.invalid'}]){const f=fixture();await assert.rejects(f.service.save({},f.payload(patch)),/changed/)}const f=fixture();f.auth.email_change='pending@test.invalid';await assert.rejects(f.service.save({},f.payload({action:'confirm-email'})),/pending email/)})
test('status retries are idempotent even after status changed',async()=>{const f=fixture(),p=f.payload();await f.service.save({},p);const r=await f.service.save({},p);assert.equal(r.status,'active');assert.equal(f.events.size,1);await assert.rejects(f.service.save({},{...p,status:'disabled'}),/reference/)})
test('Auth outage leaves durable intent and same-key retry completes it',async()=>{const f=fixture(),p=f.payload({action:'confirm-email'});f.state.authFails=true;await assert.rejects(f.service.save({},p),/Auth unavailable/);assert.equal(f.events.get(p.key).state,'pending');f.state.authFails=false;await f.service.save({},p);assert.equal(f.events.get(p.key).state,'completed');assert.equal(f.events.size,1)})
test('already confirmed email produces no misleading duplicate audit',async()=>{const f=fixture();f.auth.email_confirmed_at='2026-10-18T00:00:00Z';await f.service.save({},f.payload({action:'confirm-email'}));assert.equal(f.events.size,0)})
test('unclassified installment can be reclassified without touching any schedule amount',async()=>{const f=fixture(),p={loanId:'synthetic-loan',category:'cash_loan',expectedCategory:null,reviewed:true,key:crypto.randomUUID(),reason:'Corrected the imported loan category.'};const r=await f.service.category({},p);assert.equal(r.category,'cash_loan');assert.equal(f.events.size,1);assert.deepEqual(f.calls.filter(s=>s.startsWith('update public.')),['update public.loans set loan_category=$2 where id=$1']);await f.service.category({},p);assert.equal(f.events.size,1)})
test('category updates reject borrowers, stale categories, unsupported values and unavailable groups',async()=>{const p={loanId:'synthetic-loan',category:'retail_installment',expectedCategory:null,reviewed:true,key:crypto.randomUUID(),reason:'Correct the imported installment.'};const f=fixture();f.state.role='user';await assert.rejects(f.service.category({},p),/lender/);f.state.role='admin';await assert.rejects(f.service.category({},{...p,category:'other'}));await assert.rejects(f.service.category({},{...p,expectedCategory:'cash_loan'}),/changed/);f.state.loan=null;await assert.rejects(f.service.category({},p),/unavailable/)})
