-- Local staging bootstrap. Counters are private, durable and never client-writable.
begin;
create table if not exists mobile_private.login_attempts (
 subject text primary key,
 kind text not null check (kind in ('account','email','device')),
 reference uuid not null default gen_random_uuid() unique,
 failed_count integer not null default 0 check (failed_count between 0 and 5),
 locked_at timestamptz,
 updated_at timestamptz not null default now()
);
create table if not exists mobile_private.login_unlock_events (
 id bigint generated always as identity primary key,
 reference uuid not null,
 actor_id uuid not null,
 created_at timestamptz not null default now()
);
alter table mobile_private.login_attempts enable row level security;
alter table mobile_private.login_unlock_events enable row level security;
revoke all on mobile_private.login_attempts, mobile_private.login_unlock_events from public,anon,authenticated;
grant usage on schema mobile_private to supabase_auth_admin;
grant select,insert,update on mobile_private.login_attempts to supabase_auth_admin;
drop policy if exists login_auth_hook on mobile_private.login_attempts;
create policy login_auth_hook on mobile_private.login_attempts for all to supabase_auth_admin using (true) with check (true);

create or replace function mobile_private.login_password_verification(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare counter mobile_private.login_attempts; account_key text := 'account:' || (event->>'user_id');
begin
 insert into mobile_private.login_attempts(subject,kind) values(account_key,'account') on conflict do nothing;
 select * into counter from mobile_private.login_attempts where subject=account_key for update;
 if counter.locked_at is not null then
  return jsonb_build_object('decision','reject','message','LOGIN_ACCOUNT_LOCKED','should_logout_user',false);
 end if;
 if (event->>'valid')::boolean then
  update mobile_private.login_attempts set failed_count=0,updated_at=now() where subject=account_key;
  return jsonb_build_object('decision','continue');
 end if;
 update mobile_private.login_attempts set failed_count=least(5,failed_count+1),
  locked_at=case when failed_count>=4 then now() else null end,updated_at=now()
  where subject=account_key returning * into counter;
 return jsonb_build_object('decision','reject','message',case when counter.locked_at is not null then 'LOGIN_ACCOUNT_LOCKED' else 'LOGIN_INVALID_PASSWORD' end,'should_logout_user',false);
end $$;

-- Prevent alternate fresh sign-in methods from bypassing an account lock.
-- Existing sessions may refresh: a failed login must not evict ongoing payment work.
create or replace function mobile_private.login_access_token(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if coalesce(event->>'authentication_method','') <> 'token_refresh' and exists (
  select 1 from mobile_private.login_attempts where subject='account:'||(event->>'user_id') and locked_at is not null
 ) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','LOGIN_ACCOUNT_LOCKED'));
 end if;
 return jsonb_build_object('claims',event->'claims');
end $$;
revoke all on function mobile_private.login_password_verification(jsonb),mobile_private.login_access_token(jsonb) from public,anon,authenticated;
grant execute on function mobile_private.login_password_verification(jsonb),mobile_private.login_access_token(jsonb) to supabase_auth_admin;
commit;
