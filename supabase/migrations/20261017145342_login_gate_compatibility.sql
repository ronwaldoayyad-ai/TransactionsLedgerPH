-- The public Vercel sign-in gate counts failed attempts on every plan.
-- Configure this standard Custom Access Token hook in Supabase before rollout;
-- it also blocks fresh Classic/OTP sign-ins for a locked account. Refreshing an
-- existing session remains allowed, preserving unsubmitted payment work.
begin;
create or replace function mobile_private.login_access_token(event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
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
