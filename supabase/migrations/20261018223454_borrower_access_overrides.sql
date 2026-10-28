begin;
create table mobile_private.borrower_access_events (
 id uuid primary key,
 user_id uuid not null references public.profiles(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 action text not null check(action in ('status','confirm-email','loan-category')),
 reason text not null check(length(btrim(reason)) between 10 and 2000),
 details jsonb not null,
 state text not null default 'pending' check(state in ('pending','completed')),
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
create index borrower_access_events_user on mobile_private.borrower_access_events(user_id,created_at desc);
alter table mobile_private.borrower_access_events enable row level security;
revoke all on mobile_private.borrower_access_events from public,anon,authenticated;
comment on table mobile_private.borrower_access_events is 'Server-only admin overrides. Pending email events may have reached Auth; re-read before retrying.';
-- An already-issued token must also lose data access when an account is disabled.
-- Invited accounts retain their existing onboarding flow.
create or replace function mobile_private.valid_session() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
 where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and p.status<>'disabled')
$$;
create function mobile_private.account_disabled(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_id and status='disabled')
$$;
revoke all on function mobile_private.account_disabled(uuid) from public,anon,authenticated;
grant execute on function mobile_private.account_disabled(uuid) to supabase_auth_admin;
create or replace function mobile_private.login_access_token(event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if mobile_private.account_disabled((event->>'user_id')::uuid) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','LOGIN_ACCOUNT_DISABLED'));
 end if;
 if coalesce(event->>'authentication_method','')<>'token_refresh' then
  if exists(select 1 from mobile_private.login_attempts where subject='account:'||(event->>'user_id') and locked_at is not null) then
   return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','LOGIN_ACCOUNT_LOCKED'));
  end if;
  update mobile_private.login_attempts set failed_count=0,updated_at=now()
   where subject='account:'||(event->>'user_id') and locked_at is null;
 end if;
 return jsonb_build_object('claims',event->'claims');
end $$;
revoke all on function mobile_private.login_access_token(jsonb) from public,anon,authenticated;
grant execute on function mobile_private.login_access_token(jsonb) to supabase_auth_admin;
commit;
