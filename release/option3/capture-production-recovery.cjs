// Source access is read-only. This tool never links, migrates, restores or deploys production.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),tls=require('node:tls');
const {Pool}=require('pg');
const {vault}=require('./recovery-vault.cjs');
const {tableFingerprints}=require('./recovery-fingerprints.cjs');
const PROJECT='ckbpdrucyogsjatnmvvu',CONTAINER='loanledger-release-gates-qa';
const root=path.resolve(__dirname,'../..');
const folder=path.join(root,'.release/recovery-2026-10-22');
const CLI=process.env.RECOVERY_SUPABASE_CLI||'C:/Users/ronay/loanledger-staging/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
function readConnection(){
  const source=path.join(folder,'.env.production-recovery.local');let text;
  if(fs.existsSync(source))text=fs.readFileSync(source,'utf8');
  else{const v=vault(folder);try{const m=JSON.parse(fs.readFileSync(path.join(folder,'latest-capture.json'))),item=m.configurationFiles?.find(x=>x.name==='production-database-connection.env');if(!item)throw Error('Protected connection is unavailable.');const bytes=v.get(item.file.replace(/\.aesgcm$/,''));text=bytes.toString('utf8');bytes.fill(0);}finally{v.close();}}
  const value=text.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/,'$2');
  if(!value||value.includes('[YOUR-PASSWORD]'))throw Error('Fill the protected production database connection file first.');
  const url=new URL(value),user=decodeURIComponent(url.username);
  const direct=url.hostname==='db.'+PROJECT+'.supabase.co'&&user==='postgres';
  const pooler=/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)&&user==='postgres.'+PROJECT;
  if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooler)||(url.port&&url.port!=='5432')||url.pathname!=='/postgres')throw Error('Only the named production project on a direct/session-pooler connection is allowed.');
  if(/[\r\n]/.test(decodeURIComponent(url.password)))throw Error('Unsupported database password encoding.');
  return url;
}
function execute(file,args,{input,limit=268435456}={}){
  return new Promise((resolve,reject)=>{
    const proc=cp.spawn(file,args,{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});let output=[],errors=[],size=0;
    proc.stdout.on('data',chunk=>{size+=chunk.length;if(size>limit){proc.kill();reject(Error('Recovery command exceeded its bounded output size.'));}else output.push(chunk)});
    proc.stderr.on('data',chunk=>{if(Buffer.concat(errors).length<1048576)errors.push(chunk)});
    proc.on('error',()=>reject(Error('Recovery command could not start.')));
    proc.on('close',code=>{if(code===0)resolve(Buffer.concat(output));else reject(Object.assign(Error('Recovery command failed; private diagnostics were not printed.'),{privateDiagnostic:Buffer.concat(errors)}))});
    proc.stdin.on('error',()=>{});proc.stdin.end(input);
  });
}
async function dump(url,caPath,roles=false,snapshot){
  const args=['exec','-i','-e','PGHOST='+url.hostname,'-e','PGPORT=5432','-e','PGDATABASE=postgres','-e','PGUSER='+decodeURIComponent(url.username),'-e','PGSSLMODE=verify-full','-e','PGSSLROOTCERT=/tmp/recovery-trust.pem','-e','PGOPTIONS=-c default_transaction_read_only=on',CONTAINER,'sh','-c'];
  if(snapshot&&!/^[0-9a-f-]+$/i.test(snapshot))throw Error('Invalid exported database snapshot.');
  args.push("IFS= read -r PGPASSWORD; export PGPASSWORD; exec "+(roles?'pg_dumpall --roles-only --no-role-passwords':'pg_dump --format=custom --no-owner --verbose'+(snapshot?' --snapshot='+snapshot:'')));
  await execute('docker',['cp',caPath,CONTAINER+':/tmp/recovery-trust.pem']);
  return execute('docker',args,{input:decodeURIComponent(url.password)+'\n'});
}
const READ_CHECKS=`select jsonb_build_object(
 'profiles',(select count(*) from public.profiles),'auth_users',(select count(*) from auth.users),
 'loans',(select count(*) from public.loans),'transactions',(select count(*) from public.transactions),
 'proofs',(select count(*) from public.payments),'logs',(select count(*) from public.payment_logs),
 'objects',(select count(*) from storage.objects),
 'storage_fingerprint',(select md5(coalesce(string_agg(to_jsonb(o)::text,'|' order by o.id),'')) from storage.objects o)) snapshot`;
async function capture(){
  const url=readConnection(),v=vault(folder),stamp=new Date().toISOString().replace(/[:.]/g,'-');let db;
  const receipt={startedAt:new Date().toISOString(),project:PROJECT,productionReadOnly:true,files:[],keyScope:v.keyScope};
  const put=(name,bytes)=>{const item=v.put(stamp+'-'+name,bytes);receipt.files.push({name,...item});return item;};
  try{
    const customCA=fs.readFileSync(path.join(root,'.release/supabase-ca.crt'),'utf8');
    const trust=[...tls.rootCertificates,customCA].join('\n');
    const caPath=path.join(folder,'database-trust.pem');fs.writeFileSync(caPath,trust,{mode:0o600});
    const cleanUrl=new URL(url);cleanUrl.searchParams.delete('sslmode');cleanUrl.searchParams.delete('sslrootcert');
    db=new Pool({connectionString:cleanUrl.href,max:1,ssl:{rejectUnauthorized:true,ca:trust},options:'-c default_transaction_read_only=on -c statement_timeout=60000',connectionTimeoutMillis:15000});
    // Supavisor can ignore startup GUCs. Enforce this on the actual session/transaction.
    await db.query('set default_transaction_read_only=on');
    await db.query('begin isolation level repeatable read read only');
    await db.query("set local time zone 'UTC'");
    if((await db.query('show transaction_read_only')).rows[0].transaction_read_only!=='on')throw Error('Read-only source transaction is required.');
    const snapshot=(await db.query('select pg_export_snapshot() snapshot')).rows[0].snapshot;
    receipt.before=(await db.query(READ_CHECKS)).rows[0].snapshot;
    const fingerprints=await tableFingerprints(db);
    put('source-table-fingerprints.json',JSON.stringify(fingerprints));
    const archive=await dump(url,caPath,false,snapshot);put('database.dump',archive);archive.fill(0);
    const roles=await dump(url,caPath,true);put('roles.sql',roles);roles.fill(0);
    const objects=(await db.query('select bucket_id,name,metadata,updated_at from storage.objects order by bucket_id,name')).rows;
    const buckets=(await db.query('select * from storage.buckets order by id')).rows;
    put('storage-inventory.json',JSON.stringify({buckets,objects}));
    await db.query('commit');
    const keysRaw=await execute(CLI,['projects','api-keys','--project-ref',PROJECT,'--reveal','--output-format','json']);
    const parsed=JSON.parse(keysRaw.toString()),keys=Array.isArray(parsed)?parsed:parsed.api_keys||parsed.keys||parsed.data;
    const key=keys?.find(k=>k.name==='service_role')?.api_key||keys?.find(k=>k.type==='secret')?.api_key;
    if(!key)throw Error('An authorized server key is required to read private Storage files.');
    put('project-api-keys.json',keysRaw);keysRaw.fill(0);
    const objectFiles=[];
    for(const [index,object]of objects.entries()){
      const objectPath=object.name.split('/').map(encodeURIComponent).join('/');
      const response=await fetch('https://'+PROJECT+'.supabase.co/storage/v1/object/authenticated/'+encodeURIComponent(object.bucket_id)+'/'+objectPath,{headers:{apikey:key,Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error('A private Storage file could not be captured (HTTP '+response.status+').');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(object.metadata?.size!=null&&bytes.length!==Number(object.metadata.size))throw Error('A Storage file changed or its recorded size does not match.');
      const item=put('object-'+String(index+1).padStart(4,'0'),bytes);bytes.fill(0);
      objectFiles.push({bucket:object.bucket_id,path:object.name,...item});
    }
    put('storage-file-map.json',JSON.stringify(objectFiles));
    receipt.after=(await db.query(READ_CHECKS)).rows[0].snapshot;
    if(receipt.before.storage_fingerprint!==receipt.after.storage_fingerprint)throw Error('Storage changed during capture; repeat from a stable source window.');
    receipt.finishedAt=new Date().toISOString();receipt.storageFiles=objectFiles.length;
    receipt.status='database-and-storage-captured; configuration-and-restore-still-required';
    put('capture-manifest.json',JSON.stringify(receipt));
    fs.writeFileSync(path.join(folder,'latest-capture.json'),JSON.stringify(receipt,null,2),{mode:0o600});
    console.log(JSON.stringify({project:PROJECT,status:receipt.status,files:receipt.files.length,storageFiles:receipt.storageFiles,sourceCounts:receipt.after}));
  }catch(error){
    if(error.privateDiagnostic)put('private-error.log',error.privateDiagnostic);
    console.error(error.code?'Recovery capture stopped ('+error.code+'). No credentials or record contents were printed.':error.message);
    process.exitCode=1;
  }finally{await db?.end();v.close();}
}
if(require.main===module)capture();
module.exports={readConnection,READ_CHECKS};
