// Shared service; production dependencies are supplied by the validated runtime.
const http=require('node:http'),crypto=require('node:crypto'),supabaseHeaders=require('./supabase-headers.cjs'),publicError=require('./public-service-error.cjs');
function respondError(res,error){const result=publicError(error);res.writeHead(result.status);res.end(JSON.stringify(result.body));}
module.exports=function createFlowService({db,api,origin,jwt,hash,validator=require('./file-validator.cjs'),cookiePath='/api',backgroundWorkers=true}){
async function validateUpload(req,body){
 const user=await active(req),allowed={ 'payment-proofs':['image/jpeg','image/png','image/webp','application/pdf'],avatars:['image/jpeg','image/png','image/webp'],'mobile-attachments':['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']};
 if(!allowed[body.bucket]||String(body.path).split('/')[0]!==user.id)throw Error('File ownership mismatch.');
 const object=(await db.query('select id,metadata,updated_at::text as version from storage.objects where bucket_id=$1 and name=$2',[body.bucket,body.path])).rows[0];
 const mime=object?.metadata?.mimetype,limit=body.bucket==='avatars'?2097152:5242880;
 if(!object||!allowed[body.bucket].includes(mime)||!object.metadata.size||object.metadata.size>limit)throw Error('Choose a supported file within the size limit.');
 const token=req.headers.authorization,download=await fetch(api+'/storage/v1/object/authenticated/'+body.bucket+'/'+body.path,{headers:{apikey:jwt('anon'),Authorization:token}});
 if(!download.ok)throw Error('Unable to read the uploaded file.');const bytes=Buffer.from(await download.arrayBuffer());if(bytes.length!==Number(object.metadata.size))throw Error('File size mismatch.');
 await validator(bytes,mime);
 await db.query('insert into mobile_private.verified_uploads(object_id,owner_id,bucket,path,updated_at,sha256,mime,size) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(object_id) do update set updated_at=excluded.updated_at,sha256=excluded.sha256,mime=excluded.mime,size=excluded.size',[object.id,user.id,body.bucket,body.path,object.version,crypto.createHash('sha256').update(bytes).digest('hex'),mime,bytes.length]);
 return {valid:true};
}
async function localAuth(path,method,payload,key=jwt('service_role')){const response=await fetch(api+'/auth/v1/'+path,{method,headers:{...supabaseHeaders(jwt('anon'),jwt('service_role'),key),'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw Object.assign(Error('Authentication could not be verified.'),{status:response.status===401||response.status===403?401:503});return result;}
async function active(req,lender=false){const bearer=req.headers.authorization?.replace(/^Bearer /,'');if(!bearer)throw Object.assign(Error('Sign in first.'),{status:401});const user=await localAuth('user','GET',null,bearer);const row=(await db.query('select id,email,role,status from public.profiles where id=$1',[user.id])).rows[0];if(!row||row.status!=='active'||(lender&&row.role!=='admin'))throw Object.assign(Error('This action requires an active '+(lender?'lender':'account')+'.'),{status:403});
 let sid;try{sid=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).session_id}catch{}
 if(!/^[0-9a-f-]{36}$/i.test(sid||'')||!(await db.query('select 1 from auth.sessions where id=$1 and user_id=$2',[sid,user.id])).rowCount)throw Object.assign(Error('Sign in again.'),{status:401});return row;}
async function issue(req,body){const lender=await active(req,true),client=await db.connect();try{await client.query('begin');const borrower=(await client.query("select id from public.profiles where id=$1 and role='user' and status='active' for update",[body.userId])).rows[0];if(!borrower)throw Error('Borrower unavailable.');await client.query('update public.mobile_login_tokens set revoked_at=now() where user_id=$1 and consumed_at is null and revoked_at is null',[borrower.id]);let code,result;for(let i=0;i<10;i++){code=String(crypto.randomInt(0,1000000)).padStart(6,'0');result=await client.query("insert into public.mobile_login_tokens(user_id,issued_by,code_hash,expires_at) values($1,$2,$3,'infinity'::timestamptz) on conflict(code_hash) do nothing returning id,expires_at",[borrower.id,lender.id,hash(code)]);if(result.rowCount)break;}if(!result.rowCount)throw Error('Try issuing a code again.');await client.query('commit');return {...result.rows[0],expires_at:null,permanent:true,code};}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
async function revoke(req,body){await active(req,true);const key=body.id||body.userId;if(!/^[0-9a-f-]{36}$/i.test(key||''))throw Error('Choose a borrower or Login Code.');const field=body.id?'id':'user_id';const r=await db.query('update public.mobile_login_tokens set revoked_at=now() where '+field+'=$1 and consumed_at is null and revoked_at is null returning id',[key]);return {revoked:r.rowCount>0};}
const borrowerManagement=require('./borrower-management.cjs')({db,active,localAuth});
const loginAccess=require('./login-access.cjs')({db,active,localAuth,jwt,hash,api,cookiePath});
const server=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','application/json');try{if(req.url==='/health'&&req.method==='GET'){res.end(JSON.stringify({local:true,version:1}));return;}if(req.method!=='POST')throw Error('Unsupported request.');let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('Request is too large.');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');const result=req.url==='/issue'?await issue(req,body):req.url==='/redeem'?await loginAccess.redeem(req,res,body):req.url==='/login-password'?await loginAccess.password(req,res,body):req.url==='/login-status'?await loginAccess.status(req,res,body):req.url==='/login-locks'?await loginAccess.list(req):req.url==='/login-unlock'?await loginAccess.unlock(req,body):req.url==='/revoke'?await revoke(req,body):req.url==='/borrower-details'?await borrowerManagement.details(req,body):req.url==='/borrower-profile'?await borrowerManagement.save(req,body):req.url==='/borrower-password'?await borrowerManagement.password(req,body):null;if(!result)throw Error('Unsupported request.');res.end(JSON.stringify(result));}catch(error){respondError(res,error);}});

const baseHandler=server.listeners('request')[0];
const handler=async(req,res)=>{if(req.url!=='/validate-upload'){return baseHandler(req,res);}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}try{if(req.method!=='POST')throw Error('Unsupported request.');let data='';for await(const chunk of req){data+=chunk;if(data.length>8192)throw Error('Request too large.');}res.end(JSON.stringify(await validateUpload(req,JSON.parse(data))));}catch(error){respondError(res,error);}};

async function guestSupport(req,body){
 const {key,email,topic,description}=body;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key||'')||typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['Unable to log in','Payment proof upload','Account question','Others'].includes(topic)||typeof description!=='string'||description.trim().length<10||description.length>2000||body.userId||body.user_id)throw Error('Complete a valid email, topic and issue description.');
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({email:email.trim(),topic,description:description.trim(),file:body.file||null})).digest('hex');
 const prior=(await db.query('select ticket_number,status,created_at,guest_request_hash from public.support_tickets where guest_key=$1',[key])).rows[0];
 if(prior){if(prior.guest_request_hash!==fingerprint)throw Error('Retry key was reused for different details.');return {ticket_number:prior.ticket_number,status:prior.status,created_at:prior.created_at};}
 // Durable per-email quota; never open a second pool connection inside a transaction.
  const subject=hash('support-email:'+email.trim().toLowerCase());
  const quota=(await db.query(`insert into mobile_private.service_rate_limits(subject,window_start,attempts)
    values($1,date_trunc('minute',now()),1) on conflict(subject) do update set
    attempts=case when service_rate_limits.window_start<date_trunc('minute',now()) then 1 else service_rate_limits.attempts+1 end,
    window_start=date_trunc('minute',now()) returning attempts`,[subject])).rows[0];
  if(quota.attempts>5)throw Error('Please wait one minute before submitting another request.');
 const client=await db.connect();let uploaded;
 try{
  await client.query('begin');await client.query('select pg_advisory_xact_lock(hashtextextended($1,8))',[key]);
  const existing=(await client.query('select * from public.support_tickets where guest_key=$1',[key])).rows[0];
  if(existing){if(existing.guest_request_hash!==fingerprint)throw Error('Retry key was reused for different details.');await client.query('commit');return {ticket_number:existing.ticket_number,status:existing.status,created_at:existing.created_at};}
  let attachment=null;
  if(body.file){
   const f=body.file,match=/^data:(image\/(jpeg|png|webp|gif|bmp|avif));base64,([A-Za-z0-9+/=]+)$/.exec(f.data||'');if(!match)throw Error('Choose a supported screenshot.');
   const mime=match[1],bytes=Buffer.from(match[3],'base64');if(!bytes.length||bytes.length>5242880)throw Error('Choose a screenshot up to 5 MB.');
   await validator(bytes,mime);
   const name='guest-support/'+key+'.'+mime.split('/')[1],response=await fetch(api+'/storage/v1/object/mobile-attachments/'+name,{method:'POST',headers:{...supabaseHeaders(jwt('anon'),jwt('service_role')),'Content-Type':mime,'x-upsert':'true'},body:bytes});if(!response.ok)throw Error('Unable to save the screenshot.');uploaded=name;attachment={path:name,name:String(f.name||'screenshot').slice(0,200)};
  }
  const ticket=(await client.query("insert into public.support_tickets(user_id,guest_key,guest_request_hash,ticket_number,email,topic,description,fingerprint,attachment_path,attachment_name) values(null,$1,$2,$3,$4,$5,$6,$2,$7,$8) returning ticket_number,status,created_at,id",[key,fingerprint,'SUP-'+key.toUpperCase().replace(/-/g,''),email.trim(),topic,description.trim(),attachment?.path||null,attachment?.name||null])).rows[0];
  await client.query("insert into public.support_ticket_events(ticket_id,status,actor_id) values($1,'Submitted',null)",[ticket.id]);
  await client.query("select set_config('app.notification_event',$1,true)",[JSON.stringify({event_type:'support.submitted',payload:{topic,email,source_id:ticket.id,reference:ticket.ticket_number}})]);
  await client.query("insert into public.notifications(category,title,body,audience,target_user_ids) select 'account',$1,$2,'targeted',array_agg(id) from public.profiles where role='admin' and status='active' having count(*)>0",['Support ticket '+ticket.ticket_number,'Guest submitted a support request: '+topic]);
  await client.query('commit');return {ticket_number:ticket.ticket_number,status:ticket.status,created_at:ticket.created_at};
 }catch(error){await client.query('rollback');if(uploaded)await fetch(api+'/storage/v1/object/mobile-attachments',{method:'DELETE',headers:{...supabaseHeaders(jwt('anon'),jwt('service_role')),'Content-Type':'application/json'},body:JSON.stringify({prefixes:[uploaded]})}).catch(()=>{});throw error;}finally{client.release();}
}
const notificationRules=require('./notification-rules.cjs')({db,active,wakeEnabled:backgroundWorkers});
const notificationRulesHandler=require('./notification-rules-http.cjs')({service:notificationRules,origin});
const releaseAccessHandler=require('./release-access.cjs')({db,active,origin});
const localHandler=async(req,res)=>{
 if(req.url.startsWith('/release-access/'))return releaseAccessHandler(req,res);
 if(req.url.startsWith('/notification-rules/'))return notificationRulesHandler(req,res);
 if(req.url!=='/guest-support')return handler(req,res);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end();return;}
 try{if(req.method!=='POST')throw Error('Unsupported request.');let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>4194304)throw Error('Request too large.');chunks.push(c)}const body=JSON.parse(Buffer.concat(chunks).toString());res.end(JSON.stringify(await guestSupport(req,body)));}catch(error){respondError(res,error);}
};
return {jwt,hash,localAuth,db,server,active,handler:localHandler,startNotificationWorker:()=>notificationRules.start(),stopNotificationWorker:()=>notificationRules.stop(),runNotifications:()=>notificationRules.runOnce()};
};
