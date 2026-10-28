-- Profile edits share the existing preferences row. Publish only that row's
-- changes; clients then fetch their own profile without reloading the ledger.
begin;
do $migration$
begin
  if to_regclass('public.borrower_preferences') is not null and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'borrower_preferences'
  ) then
    alter publication supabase_realtime add table public.borrower_preferences;
  end if;
end $migration$;
commit;
