const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function fingerprint(db){
  await db.query("set search_path='';set row_security=on");
  const schemas=['public','private','mobile_private'];
  const catalog={};
  const queries={
    schemas:"select nspname,nspacl::text from pg_namespace where nspname=any($1) order by nspname",
    relations:"select n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) and c.relkind in ('r','p','v','m','S') order by 1,2",
    columns:"select n.nspname,c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname=any($1) and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m') order by 1,2,a.attnum",
    constraints:"select n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1) order by 1,2,3",
    indexes:"select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname=any($1) order by 1,2,3",
    functions:"select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=any($1) and p.prokind in ('f','p') order by 1,2,3",
    policies:"select * from pg_policies where schemaname=any($1) order by schemaname,tablename,policyname",
    triggers:"select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname=any($1) order by 1,2,3",
    publication:"select pubname,schemaname,tablename,attnames,rowfilter from pg_publication_tables where schemaname=any($1) order by 1,2,3"
  };
  for(const [key,sql]of Object.entries(queries))catalog[key]=(await db.query(sql,[schemas])).rows;
  const data={};
  for(const table of catalog.relations.filter(r=>['r','p'].includes(r.relkind))){const name='"'+table.nspname+'"."'+table.relname+'"';data[name]=(await db.query('select count(*)::int rows,md5(coalesce(string_agg(to_jsonb(t)::text,\'|\' order by to_jsonb(t)::text),\'\')) digest from '+name+' t')).rows[0]}
  for(const name of ['auth.users','auth.sessions','storage.buckets','storage.objects'])data[name]=(await db.query('select count(*)::int rows,md5(coalesce(string_agg(to_jsonb(t)::text,\'|\' order by to_jsonb(t)::text),\'\')) digest from '+name+' t')).rows[0];
  return {catalog:hash(catalog),parts:Object.fromEntries(Object.entries(catalog).map(([key,value])=>[key,hash(value)])),data:hash(data)};
}

module.exports={fingerprint};
