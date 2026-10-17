begin;
create table if not exists mobile_private.notification_rules (
 id uuid primary key default gen_random_uuid(),name text not null,
 enabled boolean not null default true,version integer not null default 1,
 graph jsonb not null,created_by uuid,updated_by uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz
);
create table if not exists mobile_private.notification_rule_versions (
 rule_id uuid not null references mobile_private.notification_rules(id),version integer not null,
 name text not null,enabled boolean not null,graph jsonb not null,actor_id uuid,created_at timestamptz not null default now(),
 primary key(rule_id,version)
);
create table if not exists mobile_private.notification_event_catalog (
 event_type text primary key,label text not null,presentation boolean not null default false
);
create table if not exists mobile_private.notification_events (
 id uuid primary key default gen_random_uuid(),event_type text not null,
 event_key text unique,actor_id uuid,source_targets uuid[] not null default '{}',source_audience text not null default 'targeted',
 payload jsonb not null default '{}',attachments jsonb not null default '[]',
 occurred_at timestamptz not null default now(),processed_at timestamptz,tries integer not null default 0,
 retry_at timestamptz not null default now(),last_error text
);
create index if not exists notification_events_pending on mobile_private.notification_events(retry_at) where processed_at is null;
create table if not exists mobile_private.notification_deliveries (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references mobile_private.notification_events(id),
 rule_id uuid not null references mobile_private.notification_rules(id),rule_version integer not null,
 node_id text not null,recipient_id uuid not null,channel text not null,
 due_at timestamptz not null default now(),status text not null default 'waiting',notification_id uuid,
 action jsonb not null,language text not null default 'English',last_error text,tries integer not null default 0,
 delivered_at timestamptz,unique(event_id,rule_id,node_id,recipient_id)
);
create index if not exists notification_deliveries_waiting on mobile_private.notification_deliveries(due_at) where status='waiting';
create table if not exists mobile_private.notification_links (
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 rule_id uuid not null references mobile_private.notification_rules(id),rule_version integer not null,node_id text not null,
 event_type text not null,payload jsonb not null,language text not null default 'English',
 provenance text not null default 'event',linked_by uuid,linked_at timestamptz not null default now()
);
create index if not exists notification_links_rule on mobile_private.notification_links(rule_id);
create table if not exists mobile_private.notification_rule_audit (
 id bigint generated always as identity primary key,actor_id uuid,operation text not null,rule_id uuid,
 notification_id uuid,detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create table if not exists mobile_private.notification_rule_state (key text primary key,value text not null);

alter table public.notifications add column if not exists rule_id uuid;
alter table public.notifications add column if not exists rule_version integer;
alter table public.notifications add column if not exists event_id uuid;
alter table public.notifications add column if not exists delivery_surface text not null default 'inbox';
alter table public.notifications add column if not exists display_duration integer not null default 10 check(display_duration between 1 and 120);
alter table public.notifications add column if not exists archived_at timestamptz;
alter table public.notifications add column if not exists edited_at timestamptz;
create index if not exists notifications_visible on public.notifications(created_at desc) where archived_at is null;
drop policy if exists notifications_not_archived on public.notifications;
create policy notifications_not_archived on public.notifications as restrictive for select to authenticated
 using(archived_at is null or public.is_admin());

create table if not exists public.notification_change_signals (
 user_id uuid primary key references public.profiles(id) on delete cascade,revision uuid not null default gen_random_uuid()
);
alter table public.notification_change_signals enable row level security;
revoke all on public.notification_change_signals from public,anon,authenticated;
grant select on public.notification_change_signals to authenticated;
drop policy if exists notification_signal_own on public.notification_change_signals;
create policy notification_signal_own on public.notification_change_signals for select to authenticated
 using(user_id=(select auth.uid()) and (select mobile_private.valid_session()));
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notification_change_signals') then
  alter publication supabase_realtime add table public.notification_change_signals;
 end if;
end $$;

create or replace function mobile_private.signal_notification_archive()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.archived_at is distinct from new.archived_at then
  insert into public.notification_change_signals(user_id)
   select p.id from public.profiles p where p.status='active' and (p.role='admin' or old.audience='all' or p.id=any(old.target_user_ids))
   on conflict(user_id) do update set revision=gen_random_uuid();
 end if;
 return new;
end $$;
revoke all on function mobile_private.signal_notification_archive() from public,anon,authenticated;
drop trigger if exists notification_archive_signal on public.notifications;
create trigger notification_archive_signal after update of archived_at on public.notifications for each row execute function mobile_private.signal_notification_archive();

-- Only scoped, trusted SQL producers set the transaction-local event context.
-- Existing manually composed notifications continue through the original table.
create or replace function mobile_private.capture_notification_draft()
returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb; event_name text; subject jsonb;
begin
 if session_user='postgres' and current_setting('app.notification_engine',true)='on' then return new;end if;
 context:=nullif(current_setting('app.notification_event',true),'')::jsonb;
 if context is null then return new;end if;
 event_name:=context->>'event_type';
 if not exists(select 1 from mobile_private.notification_event_catalog where event_type=event_name and not presentation) then
  raise exception 'Notification event is not configured.';
 end if;
 select to_jsonb(p) into subject from public.profiles p where p.role='user' and (p.id=any(new.target_user_ids) or p.id=auth.uid())
  order by case when p.id=any(new.target_user_ids) then 0 else 1 end limit 1;
 insert into mobile_private.notification_events(event_type,event_key,actor_id,source_targets,source_audience,payload,attachments,occurred_at)
 values(event_name,'draft:'||new.id::text,coalesce(auth.uid(),new.created_by),new.target_user_ids,new.audience,
  coalesce(context->'payload','{}')||case when subject is null then '{}'::jsonb else jsonb_build_object('name',coalesce(nullif(subject->>'nickname',''),nullif(subject->>'first_name',''),subject->>'name'),'email',subject->>'email','account_number',subject->>'borrower_account_number') end||jsonb_build_object('original_title',new.title,'original_body',new.body,'category',new.category),new.attachments,coalesce(new.created_at,now()));
 perform pg_notify('loanledger_notification_event','pending');
 return null;
end $$;
revoke all on function mobile_private.capture_notification_draft() from public,anon,authenticated;
drop trigger if exists notification_draft_capture on public.notifications;
create trigger notification_draft_capture before insert on public.notifications for each row execute function mobile_private.capture_notification_draft();

do $$declare t text;begin
 foreach t in array array['notification_rules','notification_rule_versions','notification_event_catalog','notification_events','notification_deliveries','notification_links','notification_rule_audit','notification_rule_state'] loop
  execute format('alter table mobile_private.%I enable row level security',t);
  execute format('revoke all on mobile_private.%I from public,anon,authenticated',t);
 end loop;
end $$;
commit;
