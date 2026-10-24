begin;
set local lock_timeout='5s';
-- Access flags only; existing RLS continues to scope borrowers to their own row.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loan_request_access') then
  alter publication supabase_realtime add table public.loan_request_access;
 end if;
end
$$;
commit;
