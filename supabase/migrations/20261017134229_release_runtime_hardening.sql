-- Additive release preparation. No borrower enrollments or credential changes.
begin;
create schema if not exists mobile_private;
create table if not exists mobile_private.service_rate_limits (
  subject text primary key,
  window_start timestamptz not null,
  attempts integer not null check(attempts > 0)
);
alter table mobile_private.service_rate_limits enable row level security;
revoke all on mobile_private.service_rate_limits from public,anon,authenticated;

-- Preserve the Classic borrower's legitimate reply/reaction RPC while removing
-- anonymous access and requiring a live, active account. Never trust user metadata.
create or replace function public.notify_admins(p_category text,p_title text,p_body text)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  session_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  admins uuid[];
  category text := case when p_category in ('payment','document','account','general') then p_category else 'general' end;
begin
  if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.status='active')
    or not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=actor) then
    raise exception 'An active signed-in account is required.' using errcode='42501';
  end if;
  if p_body is null or length(btrim(p_body))=0 or length(p_body)>20000 or length(coalesce(p_title,''))>500 then
    raise exception 'Choose a valid notification message.' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,93));
  if (select count(*) from public.notifications n where n.created_by=actor and n.created_at>now()-interval '1 minute')>=10 then
    raise exception 'Please wait before sending another notification.' using errcode='54000';
  end if;
  select array_agg(p.id) into admins from public.profiles p where p.role='admin' and p.status='active';
  if coalesce(array_length(admins,1),0)>0 then
    insert into public.notifications(category,title,body,audience,target_user_ids,created_by)
    values(category,coalesce(p_title,''),p_body,'targeted',admins,actor);
  end if;
end;
$$;
revoke all on function public.notify_admins(text,text,text) from public,anon;
grant execute on function public.notify_admins(text,text,text) to authenticated;
commit;
