const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{Client}=require('pg');
const {assertSingleTransaction}=require('../../release/option3/sql-transaction-boundaries.cjs');

test('transaction grouping migration completely rolls back early/middle/late faults and then retries safely',async()=>{
 const url=process.env.FEE_LOCAL_DATABASE_URL||'postgresql://postgres:postgres@127.0.0.1:54322/postgres';if(!/127\.0\.0\.1:(54322|25432)\//.test(url))throw Error('Local rehearsal only');
 const control=new Client({connectionString:url}),name='qa_groups_'+crypto.randomBytes(6).toString('hex');let db,created=false;
 const sql=fs.readFileSync('supabase/migrations/20261025010004_transaction_groups.sql','utf8'),commands=assertSingleTransaction(sql),body=sql.slice(commands[0].end,commands.at(-1).start);
 try{await control.connect();await control.query('create database '+name);created=true;db=new Client({connectionString:url.replace(/\/[^/?]+(?:\?.*)?$/,'/'+name)});await db.connect();
 const original=fs.readFileSync('release/option3/forward-candidate.sql','utf8'),marker=original.indexOf('-- 20261025010004_transaction_groups.sql');assert.ok(marker>0);
 await db.query(fs.readFileSync('tests/fixtures/sql/platform-pre.sql','utf8').replace(/^\\.*$/gm,''));
 await db.query('alter table auth.users add primary key(id);alter table auth.sessions add primary key(id);alter table storage.objects add primary key(id);alter table storage.buckets add primary key(id)');
 await db.query(fs.readFileSync('tests/fixtures/sql/classic-public-schema.sql','utf8').replace(/^\\.*$/gm,''));await db.query('create publication supabase_realtime');await db.query(original.slice(0,marker)+'\ncommit;');
 const snapshot=async()=> (await db.query("select jsonb_build_object('columns',(select jsonb_agg(column_name order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='transactions'),'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mobile_private')),'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid='public.transactions'::regclass and not tgisinternal)) value")).rows[0].value;
 const before=await snapshot(),middle=body.indexOf('create function mobile_private.set_transaction_group');assert.ok(middle>0);
 for(const offset of [0,middle,body.length]){await db.query('begin');await assert.rejects(db.query(body.slice(0,offset)+'\nselect 1/0;\n'+body.slice(offset)),e=>e.code==='22012');await db.query('rollback');assert.deepEqual(await snapshot(),before);}
 await db.query(sql);assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='transactions' and column_name='transaction_group'")).rows[0].n,1);
 }finally{await db?.end();if(created)await control.query('drop database '+name);await control.end();}
});
