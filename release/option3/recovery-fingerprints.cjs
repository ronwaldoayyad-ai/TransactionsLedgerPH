const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
async function tableFingerprints(db){
  const tables=(await db.query("select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%' order by n.nspname,c.relname")).rows;
  const result=[];
  for(const table of tables){
    const row=(await db.query("select count(*)::bigint rows,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text),''),'UTF8')),'hex') sha256 from "+quote(table.schema)+'.'+quote(table.name)+' t')).rows[0];
    result.push({...table,...row});
  }
  return result;
}
module.exports={tableFingerprints,quote};
