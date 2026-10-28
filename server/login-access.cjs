// Sign-in gate shared by the local and hosted runtimes. No credentials, codes or device cookie values are logged.
const crypto=require('node:crypto')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
module.exports=({db,active,localAuth,jwt,hash,api,cookiePath})=>{
 const digest=value=>hash('login-access:'+value)
 const summary=row=>({remaining:5-(row?.failed_count||0),locked:!!row?.locked_at,reference:row?.reference||null,scope:row?.kind==='device'?'device':'account'})
 function failure(row,method){return Object.assign(Error(row?.locked_at?'Sign-in is locked. Contact your lender to unlock access.':method==='code'?'This Login Code is not valid. Check it with your lender.':'The email or password you entered is incorrect.'),{status:row?.locked_at?423:401,login:summary(row),code:row?.locked_at?'LOGIN_LOCKED':'LOGIN_INVALID'})}
 async function row(subject,kind,client=db){await client.query('insert into mobile_private.login_attempts(subject,kind) values($1,$2) on conflict do nothing',[subject,kind]);return (await client.query('select * from mobile_private.login_attempts where subject=$1',[subject])).rows[0]}
 async function failed(subject,kind,client=db){await row(subject,kind,client);return (await client.query('update mobile_private.login_attempts set failed_count=least(5,failed_count+1),locked_at=case when failed_count>=4 then coalesce(locked_at,now()) else null end,updated_at=now() where subject=$1 returning *',[subject])).rows[0]}
 async function reset(subject,client=db){await client.query('update mobile_private.login_attempts set failed_count=0,updated_at=now() where subject=$1 and locked_at is null',[subject])}
 async function device(req,res){
  const cookie=(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('ll_login_device='))?.slice(16)
  let id=cookie?.split('.')[0],signature=cookie?.split('.')[1]
  const expected=id&&digest(id)
  if(!uuid.test(id||'')||!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))){
   id=crypto.randomUUID();res.setHeader('Set-Cookie','ll_login_device='+id+'.'+digest(id)+'; HttpOnly; SameSite=Strict; Path='+cookiePath+'; Max-Age=31536000'+(cookiePath==='/api'||req.headers['x-forwarded-proto']==='https'?'; Secure':''))
  }
  return row('device:'+digest(id),'device')
 }
 async function status(req,res,body={}){const dev=await device(req,res);if(dev.locked_at)return {login:summary(dev)};if(uuid.test(body.reference||'')){const lock=(await db.query('select * from mobile_private.login_attempts where reference=$1',[body.reference])).rows[0];if(lock)return {login:summary(lock)}}const email=String(body.email||'').trim().toLowerCase();if(email&&email.length<=254){const identity=(await db.query('select id from auth.users where lower(email)=$1',[email])).rows[0];const subject=identity?'account:'+identity.id:'email:'+digest(email);const account=(await db.query('select * from mobile_private.login_attempts where subject=$1',[subject])).rows[0];if(account?.locked_at)return {login:summary(account)}}return {login:summary(dev)}}
 async function password(req,res,body){
  const dev=await device(req,res);if(dev.locked_at)throw failure(dev,'password')
  const email=String(body.email||'').trim().toLowerCase()
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||typeof body.password!=='string'||!body.password||body.password.length>1024)throw Object.assign(Error('Enter a valid email address and password.'),{status:400})
  const identity=(await db.query("select id,coalesce(encrypted_password,'')<>'' as has_password from auth.users where lower(email)=$1",[email])).rows[0]
  const subject=identity?'account:'+identity.id:'email:'+digest(email),kind=identity?'account':'email'
  // Serialize each identity; the Auth hook also serializes direct Auth attempts.
  const client=await db.connect()
  try{
   await client.query('select pg_advisory_lock(hashtextextended($1,28))',[subject])
   const before=await row(subject,kind,client);if(before.locked_at)throw failure(before,'password')
   const response=await fetch(api+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:jwt('anon'),'Content-Type':'application/json'},body:JSON.stringify({email,password:body.password}),signal:AbortSignal.timeout(15000)})
   const result=await response.json()
   if(!response.ok){
    const message=String(result.msg||result.message||result.error_description||'')
    if(response.status===429||response.status>=500)throw Object.assign(Error('Sign-in is temporarily unavailable. No attempt was deducted. Please retry shortly.'),{status:503})
    const invalid=result.error_code==='invalid_credentials'||/LOGIN_(INVALID_PASSWORD|ACCOUNT_LOCKED)/.test(message)
    if(!invalid)throw Object.assign(Error('Unable to sign in. Please contact your lender if this continues.'),{status:400})
    // The Auth hook counts known users, even when the public Auth endpoint is used.
    let after=identity?await row(subject,kind,client):await failed(subject,kind,client)
    // Count failed attempts here when no password hook updated the counter. This
    // supports hosted Free/Pro plans; the standard access-token hook enforces locks.
    if(identity&&!after.locked_at&&after.failed_count===before.failed_count)after=await failed(subject,kind,client)
    throw failure(after,'password')
   }
   await reset(subject,client);await reset(dev.subject,client)
   return {session:{access_token:result.access_token,refresh_token:result.refresh_token}}
  }finally{await client.query('select pg_advisory_unlock(hashtextextended($1,28))',[subject]).catch(()=>{});client.release()}
 }
 async function redeem(req,res,body){
  const dev=await device(req,res),client=await db.connect()
  try{
   await client.query('begin');await client.query('select pg_advisory_xact_lock(hashtextextended($1,29))',[dev.subject])
   const current=await row(dev.subject,'device',client)
   if(current.locked_at){await client.query('commit');throw failure(current,'code')}
   if(!/^\d{6}$/.test(String(body.code||'')))throw Object.assign(Error('Enter the six-digit Login Code.'),{status:400})
   const token=(await client.query("select t.id,t.user_id,p.email,(t.expires_at='infinity'::timestamptz) as permanent from public.mobile_login_tokens t join public.profiles p on p.id=t.user_id where t.code_hash=$1 and t.expires_at>now() and t.consumed_at is null and t.revoked_at is null and p.status='active' and p.role='user' for update of t",[hash(body.code)])).rows[0]
   if(!token){const after=await failed(dev.subject,'device',client);await client.query('commit');throw failure(after,'code')}
   const account=await row('account:'+token.user_id,'account',client)
   if(account.locked_at){await client.query('commit');throw failure(account,'code')}
   const result=await localAuth('admin/generate_link','POST',{type:'magiclink',email:token.email})
   if(!result.hashed_token)throw Error('Unable to establish the local session.')
   if(!token.permanent)await client.query('update public.mobile_login_tokens set consumed_at=now() where id=$1',[token.id])
   await reset(dev.subject,client);await reset(account.subject,client);await client.query('commit')
   return {tokenHash:result.hashed_token}
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function lender(req){const actor=await active(req,true);let session;try{session=JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64url')).session_id}catch{}
  if(!uuid.test(session||'')||!(await db.query('select 1 from auth.sessions where id=$1 and user_id=$2',[session,actor.id])).rowCount)throw Error('Sign in again to manage access.');return actor
 }
 async function list(req){await lender(req);const {rows}=await db.query("select a.reference,a.kind,a.failed_count,a.locked_at,a.updated_at,p.id as user_id,p.name,p.email from mobile_private.login_attempts a left join public.profiles p on a.subject='account:'||p.id::text where a.locked_at is not null order by a.locked_at desc limit 200");return {locks:rows}}
 async function unlock(req,body){const actor=await lender(req);if(!uuid.test(body.reference||''))throw Error('Choose an access lock.');const client=await db.connect();try{await client.query('begin');const result=await client.query('update mobile_private.login_attempts set failed_count=0,locked_at=null,updated_at=now() where reference=$1 and locked_at is not null returning reference',[body.reference]);if(result.rowCount)await client.query('insert into mobile_private.login_unlock_events(reference,actor_id) values($1,$2)',[body.reference,actor.id]);await client.query('commit');return {unlocked:result.rowCount>0}}catch(error){await client.query('rollback');throw error}finally{client.release()}}
 return {status,password,redeem,list,unlock}
}
