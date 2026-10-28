-- The session does not vary between rows in a statement. A scalar subquery
-- lets PostgreSQL check it once while preserving the restrictive policy.
begin;
do $migration$
declare p record;
begin
  for p in select schemaname,tablename,policyname,qual,with_check
           from pg_policies where policyname='mobile_valid_session'
             and schemaname in ('public','storage')
  loop
    if p.qual='mobile_private.valid_session()'
       and (p.with_check is null or p.with_check='mobile_private.valid_session()') then
      execute format('alter policy %I on %I.%I using ((select mobile_private.valid_session()))%s',
        p.policyname,p.schemaname,p.tablename,
        case when p.with_check is not null then ' with check ((select mobile_private.valid_session()))' else '' end);
    elsif p.qual not like '%SELECT mobile_private.valid_session()%' then
      raise exception 'Unexpected session policy expression on %.%',p.schemaname,p.tablename;
    end if;
  end loop;
end $migration$;
commit;
