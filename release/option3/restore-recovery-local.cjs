// The only writable database allowed by this tool is a fresh database on localhost:25432.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs'),{tableFingerprints,quote}=require('./recovery-fingerprints.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
const container='loanledger-release-gates-qa';
function restoreCommand(args,input){return new Promise((resolve,reject)=>{const p=cp.spawn('docker',['exec','-i',container,...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});let error=[];p.stderr.on('data',c=>error.push(c));p.stdout.resume();p.on('error',()=>reject(Error('Local restore command could not start.')));p.on('close',code=>code===0?resolve():reject(Object.assign(Error('Local restore failed; private diagnostics retained.'),{privateDiagnostic:Buffer.concat(error)})));p.stdin.on('error',()=>{});p.stdin.end(input)})}
async function main(){
  const v=vault(folder),manifest=JSON.parse(fs.readFileSync(path.join(folder,'latest-capture.json'),'utf8'));
  if(manifest.project!=='ckbpdrucyogsjatnmvvu'||manifest.productionReadOnly!==true)throw Error('Unexpected recovery source.');
  const read=name=>{const item=manifest.files.find(f=>f.name===name);if(!item)throw Error('Recovery set is missing '+name);const b=v.get(item.file.replace(/\.aesgcm$/,''));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),item.sha256,'Recovery content hash differs.');return b;};
  const database='release_restore_'+crypto.randomBytes(6).toString('hex');
  const control=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:'postgres',max:1});let db;
  try{
    // Reuse platform roles already supplied by the dedicated image. New source role
    // names are created without logins; source role passwords are never imported.
    const roles=read('roles.sql').toString();
    for(const m of roles.matchAll(/^CREATE ROLE ("(?:[^"]|"")*"|[a-zA-Z_][a-zA-Z_0-9$]*);/gm)){
      const name=m[1].startsWith('"')?m[1].slice(1,-1).replaceAll('""','"'):m[1];
      if(!(await control.query('select 1 from pg_roles where rolname=$1',[name])).rowCount)await restoreCommand(['psql','--username','supabase_admin','--dbname','postgres','--set','ON_ERROR_STOP=1'],Buffer.from('create role '+quote(name)+' nologin;'));
    }
    if(!/^release_restore_[a-f0-9]{12}$/.test(database))throw Error('Invalid local restore name.');
    await control.query('create database '+database+' template template0');
    // The source's managed event trigger references a postgres-owned function.
    // PostgreSQL checks both owners during CREATE EVENT TRIGGER. Temporarily
    // elevate this dedicated container's local role, preserving dump ownership.
    const archive=read('database.dump');
    await restoreCommand(['psql','--username','supabase_admin','--dbname','postgres','--set','ON_ERROR_STOP=1'],Buffer.from('alter role postgres superuser;'));
    try{await restoreCommand(['pg_restore','--username','postgres','--dbname',database,'--exit-on-error','--single-transaction'],archive);}
    finally{archive.fill(0);await restoreCommand(['psql','--username','supabase_admin','--dbname','postgres','--set','ON_ERROR_STOP=1'],Buffer.from('alter role postgres nosuperuser;'));}
    db=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database,max:1});
    await db.query("set time zone 'UTC';set row_security=on");
    const expected=JSON.parse(read('source-table-fingerprints.json'));
    const actual=await tableFingerprints(db);
    assert.deepEqual(actual,expected,'Restored table counts/content must match the captured production snapshot.');
    const objectMap=JSON.parse(read('storage-file-map.json'));let verifiedObjects=0;
    for(const item of objectMap){const bytes=v.get(item.file.replace(/\.aesgcm$/,''));assert.equal(bytes.length,item.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);bytes.fill(0);verifiedObjects++;}
    const receipt={restoredAt:new Date().toISOString(),sourceProject:manifest.project,database,host:'127.0.0.1',port:25432,tablesVerified:actual.length,storageFilesDecryptedAndVerified:verifiedObjects,authUsers:(await db.query('select count(*)::int n from auth.users')).rows[0].n,status:'database-restore-verified; storage-service-and-auth-runtime-acceptance-pending',adaptations:['No source role passwords imported; existing isolated platform roles retained.','No hosted production integration configured or contacted from the restored database.']};
    fs.writeFileSync(path.join(folder,'latest-restore.json'),JSON.stringify(receipt,null,2),{mode:0o600});
    console.log(JSON.stringify(receipt));
  }catch(error){
    if(error.privateDiagnostic)v.put('restore-error-'+Date.now(),error.privateDiagnostic);
    console.error(error.message);process.exitCode=1;
  }finally{await db?.end();await control.end();v.close();}
}
if(require.main===module)main();
