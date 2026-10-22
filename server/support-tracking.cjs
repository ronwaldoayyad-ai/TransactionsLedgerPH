const crypto=require('node:crypto');
const uuid=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x||'');
const denied=()=>Object.assign(Error('The code is invalid or expired. Request a new code.'),{status:401});
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
module.exports=function({db,hash,sendVerification,origin,cookiePath='/api'}){
 const cookieName='ll_support_tracking';
 const cookie=(res,value,age)=>res.setHeader('Set-Cookie',cookieName+'='+value+'; Path='+cookiePath+'; HttpOnly; SameSite=Strict; Max-Age='+age+(origin.startsWith('https:')?'; Secure':''));
 const token=req=>{const raw=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(raw||'')?raw:null;};
 async function quota(subject,limit){const result=(await db.query(`insert into mobile_private.service_rate_limits(subject,window_start,attempts) values($1,date_trunc('hour',now()),1) on conflict(subject) do update set attempts=case when service_rate_limits.window_start<date_trunc('hour',now()) then 1 else service_rate_limits.attempts+1 end,window_start=date_trunc('hour',now()) returning attempts`,[hash('support-tracking-rate:'+subject)])).rows[0];if(result.attempts>limit)throw Object.assign(Error('Too many requests. Please try again later.'),{status:429});}
 async function request(req,body){
  if(!sendVerification)throw Object.assign(Error('Email verification is temporarily unavailable. Please contact your lender.'),{status:503});
  const email=String(body.email||'').trim().toLowerCase(),reference=String(body.reference||'').trim().toUpperCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^SUP-[A-F0-9]{8,32}$/.test(reference))throw Error('Enter your ticket reference and the email used to submit it.');
  await quota('ip:'+String(req.socket?.remoteAddress||'anonymous'),20);await quota('email:'+email,5);
  const ticket=(await db.query('select id from public.support_tickets where ticket_number=$1 and lower(email)=$2',[reference,email])).rows[0];
  const id=crypto.randomUUID(),code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
  await db.query("insert into mobile_private.support_verification_challenges(id,ticket_id,code_hash,expires_at) values($1,$2,$3,now()+interval '10 minutes')",[id,ticket?.id||null,hash('support-code:'+id+':'+code)]);
  // Delivery and response shape do not reveal whether a reference/email pair exists.
  // An unmatched challenge can never issue a tracking session, even with its code.
  try{await sendVerification({to:email,code,reference});}catch{await db.query('delete from mobile_private.support_verification_challenges where id=$1',[id]);throw Object.assign(Error('Email verification is temporarily unavailable. Please try again later.'),{status:503});}
  await db.query("delete from mobile_private.support_verification_challenges where expires_at<now()-interval '1 day'");
  await db.query('delete from mobile_private.support_tracking_sessions where expires_at<now()');
  return {challenge:id,message:'If those details match a ticket, a verification code has been sent. It expires in 10 minutes.'};
 }
 async function verify(req,res,body){
  if(!uuid(body.challenge)||!/^\d{6}$/.test(String(body.code||'')))throw denied();
  await quota('verify-ip:'+String(req.socket?.remoteAddress||'anonymous'),60);
  const client=await db.connect();let credential;
  try{await client.query('begin');const row=(await client.query('select *,expires_at>now() valid from mobile_private.support_verification_challenges where id=$1 for update',[body.challenge])).rows[0];
   if(row&&row.valid&&!row.consumed_at&&row.attempts<5){await client.query('update mobile_private.support_verification_challenges set attempts=attempts+1 where id=$1',[row.id]);
    if(row.ticket_id&&same(row.code_hash,hash('support-code:'+row.id+':'+body.code))){credential=crypto.randomBytes(32).toString('hex');await client.query('update mobile_private.support_verification_challenges set consumed_at=now() where id=$1',[row.id]);await client.query("insert into mobile_private.support_tracking_sessions(token_hash,ticket_id,expires_at) values($1,$2,now()+interval '15 minutes')",[hash('support-session:'+credential),row.ticket_id]);}
   }await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  if(!credential)throw denied();cookie(res,credential,900);return {verified:true};
 }
 async function read(req){const raw=token(req);if(!raw)throw Object.assign(Error('Verify your email to view this ticket.'),{status:401});
  const ticket=(await db.query(`select t.id,t.ticket_number,t.topic,t.description,t.status,t.status_note,t.created_at,t.updated_at from public.support_tickets t join mobile_private.support_tracking_sessions s on s.ticket_id=t.id where s.token_hash=$1 and s.expires_at>now()`,[hash('support-session:'+raw)])).rows[0];
  if(!ticket)throw Object.assign(Error('Your verification expired. Request a new code.'),{status:401});
  const events=(await db.query('select status,note,created_at from public.support_ticket_events where ticket_id=$1 order by created_at,id',[ticket.id])).rows;delete ticket.id;return {ticket,events};
 }
 return {request,verify,read,capabilities(){return {emailTracking:typeof sendVerification==='function'}},end(req,res){cookie(res,'',0);const raw=token(req);return raw?db.query('delete from mobile_private.support_tracking_sessions where token_hash=$1',[hash('support-session:'+raw)]).then(()=>({ended:true})):Promise.resolve({ended:true});}};
};
