const crypto=require('node:crypto'),{sanitizeGroupLogo}=require('./group-logo-svg.cjs'),publicError=require('./public-service-error.cjs');
const groups=new Set(['cash_loan','fees','adjustments']),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
function createGroupLogos({db,active}){
 async function actor(req){const user=await active(req,true);if(user.role!=='admin'||user.status!=='active')throw fail('An active lender is required.',403);return user}
 async function preview(req,body){await actor(req);if(!groups.has(body.group))throw fail('Choose Cash Loan, Fees or Adjustments.');return {svg:sanitizeGroupLogo(body.svg)}}
 async function save(req,body){
  const lender=await actor(req);if(!groups.has(body.group)||!uuid.test(body.key||'')||!uuid.test(body.expectedVersion||'')||body.reviewed!==true)throw fail('Reload and review the shared group-logo change before saving.');
  const svg=body.svg===null?null:sanitizeGroupLogo(body.svg),filename=svg?String(body.filename||'group-logo.svg').replace(/[\u0000-\u001f\u007f<>]/g,'').slice(0,120):null;
  const digest=crypto.createHash('sha256').update(JSON.stringify({group:body.group,svg,filename,expectedVersion:body.expectedVersion})).digest('hex'),client=await db.connect();
  try{
   await client.query('begin');await client.query('select pg_advisory_xact_lock(724022)');
   const previous=(await client.query('select action,payload_hash,result from mobile_private.operation_keys where actor_id=$1 and key=$2',[lender.id,body.key])).rows[0];
   if(previous){if(previous.action!=='group-logo'||previous.payload_hash!==digest)throw fail('Retry details changed. Reload group logos before retrying.',409);await client.query('commit');return previous.result}
   const row=(await client.query('select group_key,version from public.transaction_group_logos where group_key=$1 for update',[body.group])).rows[0];
   if(!row||row.version!==body.expectedVersion)throw fail('This group logo changed. Reload and review the latest version before saving.',409);
   if(!(await client.query("select 1 from public.profiles where id=$1 and role='admin' and status='active'",[lender.id])).rowCount)throw fail('An active lender is required.',403);
   const result=(await client.query('update public.transaction_group_logos set svg=$2,filename=$3,version=gen_random_uuid(),updated_at=clock_timestamp() where group_key=$1 returning group_key,svg,filename,version,updated_at',[body.group,svg,filename])).rows[0];
   await client.query("insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED',$2 from public.profiles where id=$1",[lender.id,'Shared '+body.group+' logo '+(svg?'updated':'removed')+'; presentation metadata only']);
   await client.query("insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values($1,$2,'group-logo',$3,$4)",[lender.id,body.key,digest,JSON.stringify(result)]);
   await client.query('commit');return result;
  }catch(error){await client.query('rollback').catch(()=>{});throw error}finally{client.release()}
 }
 return {preview,save};
}
function createGroupLogoHandler({service,origin}){return async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end(JSON.stringify({error:'Origin is not allowed.'}));return}
 try{const action=req.url.slice('/group-logos/'.length);if(req.method!=='POST'||!['preview','save'].includes(action))throw fail('Unsupported group-logo action.',404);const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>262144)throw fail('The SVG upload is too large.',413);chunks.push(chunk)}const result=await service[action](req,JSON.parse(Buffer.concat(chunks).toString()||'{}'));res.end(JSON.stringify(result))}catch(error){const result=publicError(error,{fallback:'Group logos are temporarily unavailable. Please retry.'});res.writeHead(result.status);res.end(JSON.stringify(result.body))}
}}
module.exports={createGroupLogos,createGroupLogoHandler};
