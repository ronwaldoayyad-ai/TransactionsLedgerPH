// Never connects to a hosted database. Every mutation is in a disposable local clone.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs'),{fingerprint}=require('./database-fingerprint.cjs');
const {assertSingleTransaction}=require('./sql-transaction-boundaries.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
const config={host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',max:1,statement_timeout:60000};
async function run(){
 const v=vault(folder),control=new Pool({...config,database:'postgres'}),receipt=JSON.parse(fs.readFileSync(path.join(folder,'latest-restore.json')));
 const source=receipt.database;if(!/^release_restore_[a-f0-9]{12}$/.test(source))throw Error('A verified local restore is required.');
 const candidate=fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8'),commands=assertSingleTransaction(candidate),results=[];
 let columns,baseline,baselineAccounting;
 async function legacyValues(db){const rows=[];for(const table of columns){const projection=table.columns.map(c=>'"'+c.name.replaceAll('"','""')+'"::'+c.type+' as "'+c.name.replaceAll('"','""')+'"').join(',');const result=(await db.query("select count(*)::int rows,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),'')) digest from (select "+projection+' from "'+table.name.replaceAll('"','""')+'"."'+table.table.replaceAll('"','""')+'") t')).rows[0];rows.push({...table,...result});}return rows;}
 try{
  const original=new Pool({...config,database:source});try{await original.query("set time zone 'UTC';set search_path=''");columns=(await original.query("select n.nspname name,c.relname as table,jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum) columns from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where n.nspname in ('public','auth') and c.relkind in ('r','p') group by n.nspname,c.relname order by 1,2")).rows;baseline=await legacyValues(original);baselineAccounting=(await original.query("select (select count(*)::int from public.payments where status='approved') approved_proofs,(select count(*)::int from public.transactions where amount<0) negative_rows")).rows[0];}finally{await original.end();}
  for(const [stage,fraction]of [['early',0.1],['middle',0.5],['late',1]]){
   const name='release_rehearsal_'+crypto.randomBytes(6).toString('hex');let db;
   try{
    await control.query('create database '+name+' template '+source);db=new Pool({...config,database:name});
    await db.query("set time zone 'UTC'");const before=await fingerprint(db);
    const index=fraction===1?commands.length-2:Math.max(3,Math.floor(commands.length*fraction)),offset=commands[index].end;
    const broken=candidate.slice(0,offset)+'\nselect 1/0;\n'+candidate.slice(offset);
    await assert.rejects(db.query(broken),e=>e.code==='22012');await db.query('rollback');assert.deepEqual(await fingerprint(db),before);
    await db.query(candidate);
    const afterLegacy=await legacyValues(db),differences=afterLegacy.filter((t,i)=>t.digest!==baseline[i].digest||t.rows!==baseline[i].rows);
    if(differences.length)console.log(JSON.stringify({preservationDifferences:differences.map(t=>({schema:t.name,table:t.table,rows:t.rows}))}));
    assert.deepEqual(afterLegacy,baseline,'Every original column value must survive; timestamp additions are compared using their original date type.');
    const rollout=(await db.query('select rollout_enabled,default_interface from mobile_private.release_settings')).rows[0];
    assert.deepEqual(rollout,{rollout_enabled:false,default_interface:'classic'});
    const checks=(await db.query("select (select count(*)::int from public.payments where status='approved') approved_proofs,(select count(*)::int from public.payment_postings) new_postings,(select count(*)::int from public.payment_allocations) new_allocations,(select count(*)::int from public.transactions where amount<0) negative_rows")).rows[0];
    assert.equal(checks.approved_proofs,baselineAccounting.approved_proofs);assert.equal(checks.negative_rows,baselineAccounting.negative_rows);assert.equal(checks.new_postings,0);assert.equal(checks.new_allocations,0);
    const completed=await fingerprint(db);await assert.rejects(db.query(candidate),e=>['42710','42P07'].includes(e.code));await db.query('rollback');assert.deepEqual(await fingerprint(db),completed);
    results.push({stage,completeRollback:true,retry:true,repeatedApplyUnchanged:true,originalTablesPreserved:columns.length,rollout,...checks});console.log(JSON.stringify(results.at(-1)));
   }finally{await db?.end();await control.query('drop database if exists '+name);}
  }
  const report={completedAt:new Date().toISOString(),productionMutations:0,candidateSha256:crypto.createHash('sha256').update(candidate).digest('hex'),sourceDatabase:source,results};
  v.put('restored-data-rehearsal-'+Date.now(),JSON.stringify(report));
  fs.writeFileSync(path.join(folder,'latest-rehearsal.json'),JSON.stringify(report,null,2));
 }catch(e){v.put('rehearsal-error-'+Date.now(),JSON.stringify({code:e.code,message:e.message,detail:e.detail}));console.error('Restored-data rehearsal stopped; protected diagnostics retained.');process.exitCode=1;}
 finally{await control.end();v.close();}
}
if(require.main===module)run();
