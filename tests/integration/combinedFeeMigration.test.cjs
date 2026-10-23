const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{Client}=require('pg');
const {assertSingleTransaction}=require('../../release/option3/sql-transaction-boundaries.cjs');
test('combined fee migration rolls back early/middle/late failures and retries safely',{skip:process.env.RUN_FEE_SQL_TESTS!=='1'},async()=>{
 const control=new Client({connectionString:process.env.FEE_LOCAL_DATABASE_URL||'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
 const name='qa_combined_fee_'+crypto.randomBytes(6).toString('hex');let db,created=false;
 const sql=fs.readFileSync('supabase/migrations/20261023182733_combined_fee_assessment.sql','utf8'),commands=assertSingleTransaction(sql),body=sql.slice(commands[0].end,commands.at(-1).start);
 try{
  await control.connect();await control.query('create database '+name+' template template0');created=true;
  db=new Client({connectionString:(process.env.FEE_LOCAL_DATABASE_URL||'postgresql://postgres:postgres@127.0.0.1:54322/postgres').replace(/\/[^/?]+(?:\?.*)?$/,'/'+name)});await db.connect();
  await db.query("create schema mobile_private;create table public.profiles(id uuid primary key);create table public.transactions(id text primary key);create table mobile_private.operation_keys(actor_id uuid,key uuid,action text,payload_hash text,result jsonb);create function mobile_private.active_user() returns uuid language sql as 'select null::uuid';create function public.is_admin() returns boolean language sql as 'select false';");
  const original=fs.readFileSync('release/option3/forward-candidate.sql','utf8');const start=original.indexOf('create table public.fee_assessments('),end=original.indexOf('create index fee_assessments_user_created',start);
  await db.query(original.slice(start,end));
  await db.query("insert into public.profiles values('00000000-0000-4000-8000-000000000001');insert into public.fee_assessments(id,user_id,actor_id,operation_key,source_due_date,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_rows) values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','2026-10-10','2026-10-01','2026-10-20',true,3,true,1000,30,1500,1530,'[]')");
  async function snapshot(){return (await db.query("select jsonb_build_object('row',(select to_jsonb(t) from public.fee_assessments t),'columns',(select jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'default',pg_get_expr(d.adbin,d.adrelid)) order by attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.fee_assessments'::regclass and attnum>0 and not attisdropped),'indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='public' and tablename='fee_assessments'),'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','mobile_private')),'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid='public.fee_assessments'::regclass)) data")).rows[0].data}
  const baseline=await snapshot(),middle=body.indexOf('create function mobile_private.combined_fee_context');
  assert.ok(middle>0);
  for(const offset of [0,middle,body.length]){
   await db.query('begin');await assert.rejects(db.query(body.slice(0,offset)+'\nselect 1/0;\n'+body.slice(offset)),e=>e.code==='22012');await db.query('rollback');assert.deepEqual(await snapshot(),baseline);
  }
  await db.query(sql);
  const row=(await db.query("select to_jsonb(t)-array['assessment_mode','source_due_dates','prior_assessment_count','repeat_confirmed','repeat_review_token'] row from public.fee_assessments t")).rows[0].row;
  assert.deepEqual(row,baseline.row);assert.equal((await db.query("select assessment_mode from public.fee_assessments")).rows[0].assessment_mode,'single_date');
 }finally{await db?.end();if(created){assert.match(name,/^qa_combined_fee_[a-f0-9]{12}$/);await control.query('drop database '+name)}await control.end()}
});
