-- Classic and New UI must both reject an access token whose Auth session ended.
-- Keep existing ownership policies; add a restrictive boundary alongside them.
begin;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select mobile_private.valid_session() and exists (
  select 1 from public.profiles
  where id=auth.uid() and role='admin' and status='active'
 );
$$;

create or replace function public.update_my_profile(
 p_first text,p_last text,p_nickname text,p_phone text
) returns void language plpgsql security definer set search_path='' as $$
begin
 perform mobile_private.active_user();
 update public.profiles
 set first_name=btrim(p_first),last_name=btrim(p_last),
     nickname=btrim(p_nickname),phone=btrim(p_phone),
     name=coalesce(nullif(btrim(p_nickname),''),
                   nullif(btrim(btrim(p_first)||' '||btrim(p_last)),''),name)
 where id=auth.uid();
end;
$$;

create or replace function public.activate_my_account()
returns void language plpgsql security definer set search_path='' as $$
begin
 -- Invited users have a legitimate session before their profile is active.
 if not mobile_private.valid_session() then
  raise exception 'An active sign-in is required.' using errcode='42501';
 end if;
 update public.profiles set status='active'
 where id=auth.uid() and status='invited';
end;
$$;

-- Include older profile, notification, wallet and configuration tables whose
-- own-record or direct role checks predate the mobile session policies.
do $$declare target record;begin
 for target in
  select distinct p.tablename from pg_policies p
  where p.schemaname='public' and p.permissive='PERMISSIVE'
    and p.roles && array['authenticated','public']::name[]
    and not exists(select 1 from pg_policies s
      where s.schemaname=p.schemaname and s.tablename=p.tablename
        and s.permissive='RESTRICTIVE'
        and s.policyname in ('mobile_valid_session','mobile_live_session'))
 loop
  execute format('create policy mobile_live_session on public.%I as restrictive to authenticated using ((select mobile_private.valid_session())) with check ((select mobile_private.valid_session()))',target.tablename);
 end loop;
end $$;

revoke all on function public.is_admin(),public.update_my_profile(text,text,text,text),public.activate_my_account() from public,anon;
grant execute on function public.is_admin(),public.update_my_profile(text,text,text,text),public.activate_my_account() to authenticated,service_role;
notify pgrst,'reload schema';
commit;
