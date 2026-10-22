const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22'),base='http://127.0.0.1:25100';
async function main(){const v=vault(folder),meta=JSON.parse(fs.readFileSync(path.join(folder,'latest-runtime.json'))),runtime=JSON.parse(v.get(meta.file.replace(/\.aesgcm$/,'')));let db;
 const read=name=>{const manifest=JSON.parse(fs.readFileSync(path.join(folder,'latest-capture.json'))),item=manifest.files.find(x=>x.name===name);if(!item)throw Error('Missing recovery item.');return v.get(item.file.replace(/\.aesgcm$/,''));};
 const api=async(path,options={})=>{const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+runtime.service,apikey:runtime.anon,...options.headers}});return response;};
 try{
  assert.match(runtime.database,/^release_runtime_[a-f0-9]{12}$/);db=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:runtime.database,max:1});
  const pilotEmail=fs.readFileSync(path.join(folder,'.pilot-signin.local'),'utf8').match(/^EMAIL=(.+)$/m)?.[1]?.trim().toLowerCase();
  assert.match(pilotEmail||'',/^[^\s@]+@[^\s@]+\.[^\s@]+$/,'Provide the named pilot email in the protected local input.');
  const pilot=(await db.query("select id,email from public.profiles where lower(email)=$1 and role='user' and status='active'",[pilotEmail])).rows[0];assert.ok(pilot);
  const password=crypto.randomBytes(24).toString('base64url')+'Aa!9';
  const changed=await api('/auth/admin/users/'+pilot.id,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({password,email_confirm:true})});assert.equal(changed.status,200,'Local cloned account password preparation must succeed.');
  const response=await api('/auth/token?grant_type=password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:pilot.email,password})});const signed=await response.json();
  if(response.status!==200){v.put('runtime-signin-error-'+Date.now(),JSON.stringify(signed));throw Error('Restored Auth sign-in did not succeed; protected diagnostic saved.');}
  assert.equal(signed.user.id,pilot.id);assert.ok(signed.access_token);
  v.put('local-browser-credentials-'+Date.now(),JSON.stringify({email:pilot.email,password}));
  const map=JSON.parse(read('storage-file-map.json')),inventory=JSON.parse(read('storage-inventory.json'));let restored=0,downloaded=0;
  for(const item of map){
   const bytes=v.get(item.file.replace(/\.aesgcm$/,'')),object=inventory.objects.find(o=>o.bucket_id===item.bucket&&o.name===item.path),pathname='/storage/object/'+encodeURIComponent(item.bucket)+'/'+item.path.split('/').map(encodeURIComponent).join('/');
   const upload=await api(pathname,{method:'POST',headers:{'content-type':object?.metadata?.mimetype||'application/octet-stream','x-upsert':'true'},body:bytes});
   if(!upload.ok){v.put('runtime-storage-error-'+Date.now(),await upload.text());throw Error('Private-file restore was rejected (HTTP '+upload.status+').');}restored++;
   const result=await api(pathname),download=Buffer.from(await result.arrayBuffer());assert.equal(result.status,200);assert.equal(crypto.createHash('sha256').update(download).digest('hex'),item.sha256);bytes.fill(0);download.fill(0);downloaded++;
  }
  const privateItem=map.find(x=>inventory.buckets.find(b=>b.id===x.bucket)?.public===false);assert.ok(privateItem);
  const privatePath='/storage/object/authenticated/'+encodeURIComponent(privateItem.bucket)+'/'+privateItem.path.split('/').map(encodeURIComponent).join('/');
  const anonymous=await api(privatePath,{headers:{Authorization:'Bearer '+runtime.anon}});assert.notEqual(anonymous.status,200);
  const forbidden=await api(privatePath,{headers:{Authorization:'Bearer '+signed.access_token}});
  const owner=(await db.query('select owner_id,owner from storage.objects where bucket_id=$1 and name=$2',[privateItem.bucket,privateItem.path])).rows[0];
  if(owner?.owner_id!==pilot.id&&owner?.owner!==pilot.id)assert.notEqual(forbidden.status,200,'Another borrower cannot read this private file.');
  const refresh=await api('/auth/token?grant_type=refresh_token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:signed.refresh_token})});assert.equal(refresh.status,200);
  const report={completedAt:new Date().toISOString(),localDatabase:runtime.database,authSignIn:true,authRefresh:true,clonedPasswordOnly:true,productionPasswordChanged:false,filesRestoredThroughStorageApi:restored,filesDownloadedWithMatchingHashes:downloaded,anonymousPrivateAccessDenied:anonymous.status!==200,crossBorrowerPrivateAccessDenied:forbidden.status!==200,images:runtime.images,limits:['Local service versions and signing keys differ from hosted managed services.','The original password hashes were restored exactly; the local pilot clone uses a temporary password for acceptance.']};
  v.put('runtime-acceptance-'+Date.now(),JSON.stringify(report));fs.writeFileSync(path.join(folder,'latest-runtime-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){v.put('runtime-acceptance-error-'+Date.now(),JSON.stringify({code:e.code,message:e.message}));console.error('Recovery runtime acceptance stopped; protected diagnostics retained.');process.exitCode=1;}finally{await db?.end();v.close();}
}
if(require.main===module)main();
