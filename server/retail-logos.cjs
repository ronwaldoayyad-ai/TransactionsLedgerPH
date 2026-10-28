const crypto=require('node:crypto'),{sanitizeGroupLogoImage,MAX_REQUEST}=require('./group-logo-image.cjs'),publicError=require('./public-service-error.cjs');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,fail=(message,status=400)=>Object.assign(Error(message),{status});
function createRetailLogos({db,active}){
 async function actor(req){const user=await active(req,true);if(user.role!=='admin'||user.status!=='active')throw fail('An active lender is required.',403);return user}
 async function preview(req,body){await actor(req);return {svg:await sanitizeGroupLogoImage(body.svg)}}
 async function save(req,body){
  const lender=await actor(req),name=String(body.name||'').trim(),filename=String(body.filename||'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim();
  if(body.reviewed!==true||!uuid.test(body.key||'')||!name||name.length>120||!filename||filename.length>120||!Array.isArray(body.targets)||body.targets.length<1||body.targets.length>200)throw fail('Review a logo and between 1 and 200 retail items before saving.');
  const targets=body.targets.map(t=>{if(!['loan','transaction'].includes(t.scope)||typeof t.id!=='string'||!t.id||t.id.length>200||!uuid.test(t.expectedUserId||'')||typeof t.expectedDescription!=='string'||!('expectedVersion'in t)||(t.expectedVersion!==null&&!uuid.test(t.expectedVersion||'')))throw fail('Reload the selected retail items before saving.');return {scope:t.scope,id:t.id,expectedUserId:t.expectedUserId,expectedDescription:t.expectedDescription,expectedVersion:t.expectedVersion}});
  if(new Set(targets.map(t=>t.scope+':'+t.id)).size!==targets.length)throw fail('A retail item was selected more than once.');
  const svg=await sanitizeGroupLogoImage(body.svg),sha=crypto.createHash('sha256').update(svg).digest('hex'),digest=crypto.createHash('sha256').update(JSON.stringify({svg,name,filename,targets})).digest('hex'),client=await db.connect();
  try{
   await client.query('begin');await client.query("set local lock_timeout='3s'");await client.query("set local statement_timeout='30s'");await client.query('select pg_advisory_xact_lock(724021)');
   const previous=(await client.query('select action,payload_hash,result from mobile_private.operation_keys where actor_id=$1 and key=$2',[lender.id,body.key])).rows[0];
   if(previous){if(previous.action!=='uploaded-retail-brand'||previous.payload_hash!==digest)throw fail('Retry details changed. Reload the logo selection.',409);await client.query('commit');return previous.result}
   if(!(await client.query("select 1 from public.profiles where id=$1 and role='admin' and status='active'",[lender.id])).rowCount)throw fail('An active lender is required.',403);
   await client.query('insert into public.retail_brand_assets(svg,filename,sha256) values($1,$2,$3) on conflict(sha256) do nothing',[svg,filename,sha]);
   const asset=(await client.query('select id from public.retail_brand_assets where sha256=$1',[sha])).rows[0];
   for(const target of [...targets].sort((a,b)=>(a.scope+':'+a.id).localeCompare(b.scope+':'+b.id))){
    let current;
    if(target.scope==='loan')current=(await client.query("select l.user_id,l.label description,mobile_private.transaction_group_key('Installment',l.label,l.principal,null,null,l.loan_category) group_key from public.loans l where l.id=$1 and l.txn_type::text<>'straight' and exists(select 1 from public.transactions t where t.loan_id=l.id and t.archived_at is null)",[target.id])).rows[0];
    else current=(await client.query("select t.user_id,t.description,mobile_private.transaction_group_key(t.type,t.description,t.amount,t.fee_kind,t.transaction_group,null) group_key from public.transactions t where t.id=$1 and t.archived_at is null and not(t.type='Installment' and t.loan_id is not null)",[target.id])).rows[0];
    if(!current||!['retail_installment','straight_retail'].includes(current.group_key)||current.user_id!==target.expectedUserId||current.description!==target.expectedDescription)throw fail('A selected item changed. Refresh and review again.',409);
    const key=target.scope+':'+target.id,prior=(await client.query('select version from public.retail_brand_assignments where target_key=$1 for update',[key])).rows[0];
    if((prior?.version||null)!==target.expectedVersion)throw fail('A logo choice changed. Refresh and review again.',409);
    await client.query("insert into public.retail_brand_assignments(target_key,loan_id,transaction_id,user_id,mode,domain,name,logo_id) values($1,$2,$3,$4,'upload',null,$5,$6) on conflict(target_key) do update set user_id=excluded.user_id,mode='upload',domain=null,name=excluded.name,logo_id=excluded.logo_id,version=gen_random_uuid(),updated_at=clock_timestamp()",[key,target.scope==='loan'?target.id:null,target.scope==='transaction'?target.id:null,current.user_id,name,asset.id]);
   }
   await client.query("insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED',$2 from public.profiles where id=$1",[lender.id,'Uploaded brand logo for '+targets.length+' retail items; presentation metadata only']);
   const result={updated:targets.length,assetId:asset.id};await client.query("insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values($1,$2,'uploaded-retail-brand',$3,$4)",[lender.id,body.key,digest,JSON.stringify(result)]);await client.query('commit');return result;
  }catch(error){await client.query('rollback').catch(()=>{});throw error}finally{client.release()}
 }
 return {preview,save};
}
function createRetailLogoHandler({service,origin}){return async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end(JSON.stringify({error:'Origin is not allowed.'}));return}
 try{const action=req.url.slice('/retail-logos/'.length);if(req.method!=='POST'||!['preview','save'].includes(action))throw fail('Unsupported retail-logo action.',404);const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>MAX_REQUEST)throw fail('The logo upload is too large.',413);chunks.push(chunk)}const result=await service[action](req,JSON.parse(Buffer.concat(chunks).toString()||'{}'));res.end(JSON.stringify(result))}catch(error){const result=publicError(error,{fallback:'Uploaded logos are temporarily unavailable. Please retry.'});res.writeHead(result.status);res.end(JSON.stringify(result.body))}
}}
module.exports={createRetailLogos,createRetailLogoHandler};
