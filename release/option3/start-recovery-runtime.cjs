// Dedicated internal Docker network; services cannot send email or contact production.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
const network='loanledger-release-gates-net',prefix='loanledger-release-gates-',databaseHost=prefix+'qa';
const images={auth:'public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',storage:'public.ecr.aws/supabase/storage-api@sha256:6a32896ae2d1ae2ea2d05ecaf6ed6c8a6b091739b469a8cf860ee89b2604d28f',rest:'public.ecr.aws/supabase/postgrest@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df',mail:'public.ecr.aws/supabase/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d'};
function docker(args,input){const r=cp.spawnSync('docker',args,{input,windowsHide:true,maxBuffer:16777216});if(r.status!==0)throw Object.assign(Error('Local runtime command failed; protected diagnostics retained.'),{privateDiagnostic:Buffer.concat([r.stdout||Buffer.alloc(0),r.stderr||Buffer.alloc(0)])});return r.stdout.toString().trim();}
function jwt(payload,secret){const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({...payload,iss:'local-recovery-only',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})).toString('base64url');return header+'.'+body+'.'+crypto.createHmac('sha256',secret).update(header+'.'+body).digest('base64url');}
async function main(){
 const v=vault(folder),receipt=JSON.parse(fs.readFileSync(path.join(folder,'latest-restore.json')));if(!/^release_restore_[a-f0-9]{12}$/.test(receipt.database))throw Error('Verified restore required.');
 const database='release_runtime_'+crypto.randomBytes(6).toString('hex'),secret=crypto.randomBytes(48).toString('hex'),password=crypto.randomBytes(32).toString('hex');
 const control=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:'postgres',max:1});let db;
 const envFiles=[];
 function start(name,port,env){const file=path.join(folder,'runtime-'+name+'.env');envFiles.push(file);fs.writeFileSync(file,Object.entries(env).map(([k,x])=>k+'='+x).join('\n'),{mode:0o600});const args=['run','--rm','--detach','--name',prefix+name,'--label','codex.task=loanledger-release-gates','--network',network];if(port)args.push('--publish','127.0.0.1:'+port);args.push('--env-file',file,images[name]);docker(args);}
 try{
  docker(['network','create','--internal','--label','codex.task=loanledger-release-gates',network]);docker(['network','connect',network,databaseHost]);
  await control.query('create database '+database+' template '+receipt.database);db=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database,max:1});
  await db.query(fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8'));
  const roleSql=['supabase_auth_admin','supabase_storage_admin','authenticator'].map(role=>'alter role '+role+" password '"+password+"';").join('\n');
  docker(['exec','-i',databaseHost,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],roleSql);
  const anon=jwt({role:'anon'},secret),service=jwt({role:'service_role'},secret),dbUri=role=>'postgres://'+role+':'+password+'@'+databaseHost+':5432/'+database;
  start('mail','25025:8025',{MP_MAX_MESSAGES:100,MP_SMTP_AUTH_ACCEPT_ANY:'1',MP_SMTP_AUTH_ALLOW_INSECURE:'1'});
  start('rest','25300:3000',{PGRST_DB_URI:dbUri('authenticator'),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_MAX_ROWS:5000});
  start('auth','25999:9999',{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:9999,API_EXTERNAL_URL:'http://127.0.0.1:25999',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:dbUri('supabase_auth_admin'),GOTRUE_SITE_URL:'http://127.0.0.1:25173',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:25173/**',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:3600,GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_SMTP_HOST:prefix+'mail',GOTRUE_SMTP_PORT:1025,GOTRUE_SMTP_ADMIN_EMAIL:'recovery@test.invalid',GOTRUE_SMTP_SENDER_NAME:'Isolated recovery',GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED:'true',GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI:'pg-functions://postgres/mobile_private/login_access_token'});
  start('storage','25500:5000',{ANON_KEY:anon,SERVICE_KEY:service,POSTGREST_URL:'http://'+prefix+'rest:3000',AUTH_JWT_SECRET:secret,DATABASE_URL:dbUri('supabase_storage_admin'),FILE_SIZE_LIMIT:10485760,STORAGE_BACKEND:'file',GLOBAL_S3_BUCKET:'recovery',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',TENANT_ID:'recovery',REGION:'local',ENABLE_IMAGE_TRANSFORMATION:'false',STORAGE_PUBLIC_URL:'http://127.0.0.1:25500'});
  const credentials={database,secret,anon,service,password,images,network,ports:{auth:25999,rest:25300,storage:25500,mail:25025}};const item=v.put('local-runtime-'+Date.now(),JSON.stringify(credentials));fs.writeFileSync(path.join(folder,'latest-runtime.json'),JSON.stringify({file:item.file,database,images,network,ports:credentials.ports},null,2));
  console.log(JSON.stringify({database,network,services:Object.keys(images),productionWrites:0,outboundNetwork:false}));
 }catch(e){if(e.privateDiagnostic)v.put('runtime-error-'+Date.now(),e.privateDiagnostic);console.error(e.message);process.exitCode=1;}finally{for(const f of envFiles)if(fs.existsSync(f))fs.unlinkSync(f);await db?.end();await control.end();v.close();}
}
if(require.main===module)main();
