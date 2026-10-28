-- Run only after the reviewed backend preview and deployment are accepted.
-- Enable pg_cron + pg_net through Supabase first. Store these values in Vault:
-- loanledger_app_origin: the accepted HTTPS origin (no trailing slash)
-- loanledger_worker_secret: same value as Vercel NOTIFICATION_WORKER_SECRET
-- Optional loanledger_preview_bypass: Vercel's preview automation bypass secret
-- Never commit secrets or paste them into this file.
begin;
do $$begin
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Enable Supabase Cron and pg_net before installing the worker schedule.';
 end if;
 if not exists(select 1 from vault.decrypted_secrets where name='loanledger_app_origin' and decrypted_secret ~ '^https://[A-Za-z0-9.-]+$')
 or not exists(select 1 from vault.decrypted_secrets where name='loanledger_worker_secret' and length(decrypted_secret)>=32) then
  raise exception 'Configure the accepted app origin and worker secret in Vault first.';
 end if;
end $$;
create or replace function mobile_private.dispatch_notification_worker() returns bigint
language plpgsql security definer set search_path='' as $$
declare origin text; secret text; bypass text; headers jsonb;
begin
 select decrypted_secret into strict origin from vault.decrypted_secrets where name='loanledger_app_origin';
 select decrypted_secret into strict secret from vault.decrypted_secrets where name='loanledger_worker_secret';
 select decrypted_secret into bypass from vault.decrypted_secrets where name='loanledger_preview_bypass';
 if origin !~ '^https://[A-Za-z0-9.-]+$' or length(secret)<32 then raise exception 'Notification worker configuration is invalid.';end if;
 headers=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret);
 if bypass is not null then headers=headers||jsonb_build_object('x-vercel-protection-bypass',bypass);end if;
 return net.http_post(url:=origin||'/api/notification-worker',headers:=headers,body:='{}'::jsonb,timeout_milliseconds:=50000);
end $$;
revoke all on function mobile_private.dispatch_notification_worker() from public,anon,authenticated;
create or replace function mobile_private.wake_notification_worker() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform mobile_private.dispatch_notification_worker();return NEW;
exception when others then
 -- A failed wake must not discard a payment or support ticket. The event stays
 -- queued; the scheduled retry and admin activity view expose processing failures.
 return NEW;
end $$;
revoke all on function mobile_private.wake_notification_worker() from public,anon,authenticated;
drop trigger if exists wake_notification_worker on mobile_private.notification_events;
create trigger wake_notification_worker after insert on mobile_private.notification_events
for each statement execute function mobile_private.wake_notification_worker();
select cron.schedule('loanledger-notification-worker','* * * * *','select mobile_private.dispatch_notification_worker()');
commit;
