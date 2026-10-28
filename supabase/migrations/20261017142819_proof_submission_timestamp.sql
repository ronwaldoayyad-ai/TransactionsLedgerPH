-- Preserve the legacy date column and its Classic readers. Do not invent times
-- for historical submissions; only future inserts receive a server timestamp.
begin;
alter table public.payments add column submitted_at_exact timestamptz;
create function public.set_payment_submitted_time() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then NEW.submitted_at_exact=clock_timestamp();
  else NEW.submitted_at_exact=OLD.submitted_at_exact;
  end if;
  return NEW;
end $$;
revoke all on function public.set_payment_submitted_time() from public,anon,authenticated;
create trigger payment_submission_time before insert or update on public.payments
for each row execute function public.set_payment_submitted_time();
notify pgrst,'reload schema';
commit;
