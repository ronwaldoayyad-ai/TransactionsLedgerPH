const fs=require('node:fs'),path=require('node:path'),tls=require('node:tls'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs'),{fingerprint}=require('./database-fingerprint.cjs'),{readConnection}=require('./capture-production-recovery.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
async function security(db){await db.query("set search_path='';set time zone 'UTC'");return {
 owners:(await db.query("select n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,c.relreplident from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind in ('r','p','v','m','S') order by 1,2,3")).rows,
 publicRpcs:(await db.query("select p.oid::regprocedure::text name,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig,p.proacl::text,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1")).rows,
 defaultGrants:(await db.query("select pg_get_userbyid(d.defaclrole) role,n.nspname,d.defaclobjtype,d.defaclacl::text from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where n.nspname in ('public','auth','storage') or d.defaclnamespace=0 order by 1,2,3")).rows,
 schemas:(await db.query("select nspname,pg_get_userbyid(nspowner) owner,nspacl::text from pg_namespace where nspname in ('public','auth','storage') order by 1")).rows
};}
async function main(){const v=vault(folder),receipt=JSON.parse(fs.readFileSync(path.join(folder,'latest-restore.json')));let source,local;
 try{const url=readConnection();url.searchParams.delete('sslmode');url.searchParams.delete('sslrootcert');source=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:15000,ssl:{rejectUnauthorized:true,ca:[...tls.rootCertificates,fs.readFileSync(path.join(root,'.release/supabase-ca.crt'),'utf8')].join('\n')}});await source.query("set default_transaction_read_only=on;begin read only");assert.equal((await source.query('show transaction_read_only')).rows[0].transaction_read_only,'on');
 if(!/^release_restore_[a-f0-9]{12}$/.test(receipt.database))throw Error('Verified isolated restore required.');local=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:receipt.database,max:1});
 const remote=await fingerprint(source),restored=await fingerprint(local),remoteSecurity=await security(source),localSecurity=await security(local);
 const comparison={at:new Date().toISOString(),productionReadOnly:true,catalogParts:Object.fromEntries(Object.keys(remote.parts).map(key=>[key,remote.parts[key]===restored.parts[key]])),securityParts:Object.fromEntries(Object.keys(remoteSecurity).map(key=>[key,JSON.stringify(remoteSecurity[key])===JSON.stringify(localSecurity[key])]))};
 v.put('security-comparison-'+Date.now(),JSON.stringify({comparison,source:remoteSecurity,restored:localSecurity}));fs.writeFileSync(path.join(folder,'latest-security-comparison.json'),JSON.stringify(comparison,null,2));console.log(JSON.stringify(comparison));await source.query('commit');
 }catch(e){v.put('security-comparison-error-'+Date.now(),JSON.stringify({code:e.code,message:e.message}));console.error('Read-only security comparison stopped; protected diagnostics retained.');process.exitCode=1;}finally{await source?.end();await local?.end();v.close();}
}
if(require.main===module)main();
