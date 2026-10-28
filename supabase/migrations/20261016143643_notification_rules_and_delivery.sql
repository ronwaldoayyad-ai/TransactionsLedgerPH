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

begin;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.proof_submitted','Proof submitted · borrower',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.proof_submitted_admin','Proof submitted · lender',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.proof_approved','Proof approved',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.proof_rejected','Proof rejected',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.proof_pending','Proof reopened',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.recorded','Payment recorded',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('payment.due','Payment due / past due',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('loan.submitted','Loan request submitted',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('loan.status_changed','Loan request status changed',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('invoice.assigned','Statement assigned',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('disbursement.assigned','Disbursement ready',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('disbursement.accepted','Disbursement accepted · lender',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('disbursement.accepted_copy','Accepted document · borrower',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('support.submitted','Support submitted · lender',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('support.updated','Support status updated',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('notification.reply','Borrower replied',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('notification.reaction','Borrower reacted',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('notification.lender_reply','Lender replied',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('notification.lender_reaction','Lender reacted',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('system.admin_notice','Other lender alert',false) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('paw.welcome','Pawcheebels welcome',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('paw.reminder','Pawcheebels idle reminder',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.payment_submitted','Payment submission confirmation',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.support_submitted','Support confirmation',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.login_code_invalid','Invalid Login Code',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.password_invalid','Invalid email or password',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.login_locked','Sign-in locked',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('popup.login_error','Sign-in service error',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_event_catalog(event_type,label,presentation) values('ui.notice','Other app feedback',true) on conflict(event_type) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('031c76fb-d781-4ae5-b8cb-a5942aa30709','Support confirmation',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.support_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your support team can now review your request.","title":"Support Request Submitted!","channel":"popup","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('031c76fb-d781-4ae5-b8cb-a5942aa30709',1,'Support confirmation',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.support_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your support team can now review your request.","title":"Support Request Submitted!","channel":"popup","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('0535021d-e3b2-4f3b-b526-737c15bbd271','Pawcheebels welcome',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Hi! I’m Pawcheebels. Need help finding your way around?","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('0535021d-e3b2-4f3b-b526-737c15bbd271',1,'Pawcheebels welcome',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Hi! I’m Pawcheebels. Need help finding your way around?","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('0a66c688-3f4b-44d7-83b0-44a95f6928c7','Proof rejected',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_rejected"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof needs correction","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('0a66c688-3f4b-44d7-83b0-44a95f6928c7',1,'Proof rejected',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_rejected"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof needs correction","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('0c696447-8982-403a-9784-5b639647eb9f','Pawcheebels welcome',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Hi there! You can ask me about the app or just say hello.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('0c696447-8982-403a-9784-5b639647eb9f',1,'Pawcheebels welcome',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Hi there! You can ask me about the app or just say hello.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('13e99703-8afa-4525-8ce8-b740b395bd2c','Sign-in service error',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_error"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Unable to Sign In","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('13e99703-8afa-4525-8ce8-b740b395bd2c',1,'Sign-in service error',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_error"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Unable to Sign In","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('258e0cb5-d5b8-4ce9-a42d-c89454eafe2f','Pawcheebels idle reminder',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Need help submitting payment proof? Tap me and I’ll guide you through the steps.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('258e0cb5-d5b8-4ce9-a42d-c89454eafe2f',1,'Pawcheebels idle reminder',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Need help submitting payment proof? Tap me and I’ll guide you through the steps.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('2c364ad7-be7a-4935-8aa5-33c0a2c44ad7','Disbursement accepted · lender',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.accepted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Accepted","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('2c364ad7-be7a-4935-8aa5-33c0a2c44ad7',1,'Disbursement accepted · lender',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.accepted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Accepted","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('2f21f46d-dded-43fb-89e2-d53f8d61c4a5','Pawcheebels idle reminder',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Questions about installment schedules? I can help you understand where to find them.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('2f21f46d-dded-43fb-89e2-d53f8d61c4a5',1,'Pawcheebels idle reminder',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Questions about installment schedules? I can help you understand where to find them.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('30e92064-be31-4cd4-b4aa-8172957b45cf','Proof approved',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_approved"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof verified","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('30e92064-be31-4cd4-b4aa-8172957b45cf',1,'Proof approved',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_approved"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof verified","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('3689d17c-1f1a-497b-a44b-4bf05303c0e6','Borrower replied',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.reply"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('3689d17c-1f1a-497b-a44b-4bf05303c0e6',1,'Borrower replied',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.reply"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('370325e2-03d1-4ed8-958b-4fda72c573a9','Pawcheebels idle reminder',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"You can chat with me anytime. For account-specific concerns, I’ll point you to your lender.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('370325e2-03d1-4ed8-958b-4fda72c573a9',1,'Pawcheebels idle reminder',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"You can chat with me anytime. For account-specific concerns, I’ll point you to your lender.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('38c05247-90eb-4d62-85db-143a49ec9ebb','Invalid Login Code',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_code_invalid"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Invalid Login Code","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('38c05247-90eb-4d62-85db-143a49ec9ebb',1,'Invalid Login Code',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_code_invalid"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Invalid Login Code","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('3ab87562-d7c1-461d-9b4e-ab423f587886','Proof reopened',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_pending"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof reopened","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('3ab87562-d7c1-461d-9b4e-ab423f587886',1,'Proof reopened',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_pending"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof reopened","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('42ea944c-8672-4d30-a4d3-81605a74bb09','Statement assigned',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"invoice.assigned"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Statement Ready","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('42ea944c-8672-4d30-a4d3-81605a74bb09',1,'Statement assigned',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"invoice.assigned"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Statement Ready","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('51bfb701-2bcf-4005-873b-dd34595af932','Pawcheebels welcome',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Your app guide is here! Tap me for questions about payments, schedules, or using LoanLedger PH.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('51bfb701-2bcf-4005-873b-dd34595af932',1,'Pawcheebels welcome',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Your app guide is here! Tap me for questions about payments, schedules, or using LoanLedger PH.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('73b54267-01a4-43c1-a945-0f344394325e','Payment recorded',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.recorded"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('73b54267-01a4-43c1-a945-0f344394325e',1,'Payment recorded',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.recorded"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('7be53cbf-0f50-47fe-931b-584b6d0615a6','Sign-in locked',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_locked"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Sign-in Locked","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('7be53cbf-0f50-47fe-931b-584b6d0615a6',1,'Sign-in locked',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.login_locked"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Sign-in Locked","channel":"popup","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('9171018d-837f-4ef3-99fd-c75e48fc7070','Pawcheebels idle reminder',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"I’m here if you need help with LoanLedger PH. What would you like to know?","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('9171018d-837f-4ef3-99fd-c75e48fc7070',1,'Pawcheebels idle reminder',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.reminder"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":120},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"I’m here if you need help with LoanLedger PH. What would you like to know?","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('934ef10f-0b4b-43cb-aa62-052b3d99b43b','Loan request submitted',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"loan.submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"We have received your loan request for PHP {{amount}}. Your lender will review it and update you.","title":"Loan Request Received","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('934ef10f-0b4b-43cb-aa62-052b3d99b43b',1,'Loan request submitted',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"loan.submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"We have received your loan request for PHP {{amount}}. Your lender will review it and update you.","title":"Loan Request Received","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('98b226a0-2062-4cf8-9d57-0bf2fdf15c74','Pawcheebels welcome',true,1,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Need a hand? I can explain app features and guide you through payment-proof submission.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('98b226a0-2062-4cf8-9d57-0bf2fdf15c74',1,'Pawcheebels welcome',true,'{"edges":[{"to":"delay-1","from":"when-1","port":"next"},{"to":"send-1","from":"delay-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"paw.welcome"},"type":"when"},{"x":340,"y":70,"id":"delay-1","data":{"seconds":2},"type":"delay"},{"x":650,"y":70,"id":"send-1","data":{"body":"Need a hand? I can explain app features and guide you through payment-proof submission.","title":"Pawcheebels","channel":"paw","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('9c1eb7e7-3391-42c2-aced-098bd1342630','Invalid email or password',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.password_invalid"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Invalid Email or Password","channel":"popup","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('9c1eb7e7-3391-42c2-aced-098bd1342630',1,'Invalid email or password',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.password_invalid"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Invalid Email or Password","channel":"popup","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('aeeb5ef5-12dc-4e81-8c93-d761be4c6cf4','Proof submitted · borrower',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your proof of payment for PHP {{amount}} has been submitted for review.","title":"Proof of Payment Submitted","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('aeeb5ef5-12dc-4e81-8c93-d761be4c6cf4',1,'Proof submitted · borrower',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your proof of payment for PHP {{amount}} has been submitted for review.","title":"Proof of Payment Submitted","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('b1a76144-f0ea-4158-93be-9fa197d15072','Support submitted · lender',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"support.submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('b1a76144-f0ea-4158-93be-9fa197d15072',1,'Support submitted · lender',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"support.submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('ba3c3984-5129-47f2-b622-9b09feff8cc3','Disbursement ready',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.assigned"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Ready","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('ba3c3984-5129-47f2-b622-9b09feff8cc3',1,'Disbursement ready',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.assigned"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Ready","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('c16855df-223d-4d0d-8adf-fbf0c2b74699','Support status updated',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"support.updated"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Support ticket updated","channel":"inbox","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('c16855df-223d-4d0d-8adf-fbf0c2b74699',1,'Support status updated',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"support.updated"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Support ticket updated","channel":"inbox","userIds":[],"category":"account","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('c3aa9884-5ffd-4be3-98a6-3ad7261cb3eb','Proof submitted · lender',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_submitted_admin"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof submitted","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('c3aa9884-5ffd-4be3-98a6-3ad7261cb3eb',1,'Proof submitted · lender',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.proof_submitted_admin"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Payment proof submitted","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('c42be9fc-af40-4b89-b554-b6c0b224b2d0','Borrower reacted',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.reaction"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('c42be9fc-af40-4b89-b554-b6c0b224b2d0',1,'Borrower reacted',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.reaction"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('c5bafb4f-ea66-4764-ae30-bdd2a2687e61','Lender replied',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.lender_reply"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('c5bafb4f-ea66-4764-ae30-bdd2a2687e61',1,'Lender replied',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.lender_reply"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('c851ada7-9547-446c-9545-117c1b1852d4','Loan request status changed',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"loan.status_changed"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('c851ada7-9547-446c-9545-117c1b1852d4',1,'Loan request status changed',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"loan.status_changed"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('cd686fca-f17d-41a9-b448-b3ec9b103f20','Accepted document · borrower',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.accepted_copy"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Accepted","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('cd686fca-f17d-41a9-b448-b3ec9b103f20',1,'Accepted document · borrower',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"disbursement.accepted_copy"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"Loan Disbursement Accepted","channel":"inbox","userIds":[],"category":"document","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('d11ec1cf-67bb-416b-8dfd-efa6a191553b','Payment due tomorrow · enable when ready',false,1,'{"edges":[{"to":"if-1","from":"when-1","port":"next"},{"to":"send-1","from":"if-1","port":"yes"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.due"},"type":"when"},{"x":650,"y":70,"id":"send-1","data":{"body":"Your payment of PHP {{amount}} is due on {{due_date}}. Please review your payment schedule.","title":"Payment Due Reminder","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"Bukas na ang takdang bayad na PHP {{amount}}. Suriin ang iyong iskedyul ng pagbabayad.","filipinoTitle":"Paalala sa takdang bayad"},"type":"send"},{"x":340,"y":70,"id":"if-1","data":{"condition":{"kind":"group","mode":"all","children":[{"kind":"condition","field":"days_until_due","value":"1","operator":"equals"}]}},"type":"if"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('d11ec1cf-67bb-416b-8dfd-efa6a191553b',1,'Payment due tomorrow · enable when ready',false,'{"edges":[{"to":"if-1","from":"when-1","port":"next"},{"to":"send-1","from":"if-1","port":"yes"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"payment.due"},"type":"when"},{"x":650,"y":70,"id":"send-1","data":{"body":"Your payment of PHP {{amount}} is due on {{due_date}}. Please review your payment schedule.","title":"Payment Due Reminder","channel":"inbox","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"Bukas na ang takdang bayad na PHP {{amount}}. Suriin ang iyong iskedyul ng pagbabayad.","filipinoTitle":"Paalala sa takdang bayad"},"type":"send"},{"x":340,"y":70,"id":"if-1","data":{"condition":{"kind":"group","mode":"all","children":[{"kind":"condition","field":"days_until_due","value":"1","operator":"equals"}]}},"type":"if"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('d15732a5-048a-4078-b25f-897af36ab8a5','Payment submission confirmation',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.payment_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your submission is being verified.","title":"Proof of Payment Submitted!","channel":"popup","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('d15732a5-048a-4078-b25f-897af36ab8a5',1,'Payment submission confirmation',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"popup.payment_submitted"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"Your submission is being verified.","title":"Proof of Payment Submitted!","channel":"popup","userIds":[],"category":"payment","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('ddbb6e89-1943-45d6-bba5-5463d28b6687','Other lender alert',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"system.admin_notice"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('ddbb6e89-1943-45d6-bba5-5463d28b6687',1,'Other lender alert',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"system.admin_notice"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('e4f4aef3-d59e-4dc6-b587-904f5562fb5f','Other app feedback',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"ui.notice"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{message}}","title":"Notice","channel":"banner","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('e4f4aef3-d59e-4dc6-b587-904f5562fb5f',1,'Other app feedback',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"ui.notice"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{message}}","title":"Notice","channel":"banner","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rules(id,name,enabled,version,graph) values('fc8fc341-d5b2-49a7-b5d7-d658091bc696','Lender reacted',true,1,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.lender_reaction"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(id) do nothing;
insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values('fc8fc341-d5b2-49a7-b5d7-d658091bc696',1,'Lender reacted',true,'{"edges":[{"to":"send-1","from":"when-1","port":"next"}],"nodes":[{"x":40,"y":70,"id":"when-1","data":{"at":"09:00","event":"notification.lender_reaction"},"type":"when"},{"x":380,"y":70,"id":"send-1","data":{"body":"{{original_body}}","title":"{{original_title}}","channel":"inbox","userIds":[],"category":"general","duration":10,"language":"all","recipients":"source","filipinoBody":"","filipinoTitle":""},"type":"send"}]}'::jsonb) on conflict(rule_id,version) do nothing;
insert into mobile_private.notification_rule_state(key,value) values('defaults-v1','installed') on conflict(key) do nothing;commit;
-- Generated from the audited local staging function definitions.
-- Only notification event context is added; existing transaction decisions are preserved.
begin;
CREATE OR REPLACE FUNCTION mobile_private.action(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=mobile_private.active_user();k uuid:=(p_payload->>'key')::uuid;v_hash text:=md5(p_payload::text);v_old mobile_private.operation_keys;
 v_result jsonb;v_pay public.payments;v_loan public.loan_requests;v_ticket public.support_tickets;v_msg public.messages;
 v_alloc jsonb;v_ids text[];v_first text;v_reference text;v_date date;v_amount numeric;v_path text;v_id uuid;v_topic text;v_description text;v_fingerprint text;v_name text;v_is_admin boolean;
begin
 perform set_config('app.notification_event',(jsonb_build_object('event_type',case p_action when 'payment-submit' then 'payment.proof_submitted_admin' when 'support-submit' then 'support.submitted' when 'support-status' then 'support.updated' when 'notification-react' then 'notification.reaction' when 'notification-reply' then 'notification.reply' else 'system.admin_notice' end,'payload',jsonb_build_object('amount',p_payload->'amount','status',p_payload->>'status','method',p_payload->>'method','reference',p_payload->>'reference','topic',p_payload->>'topic','source_id',p_payload->>'id')))::text,true);
 if k is null then raise exception 'A retry key is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into v_old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then
  if v_old.action<>p_action or v_old.payload_hash<>v_hash then raise exception 'Retry key was reused for different details.';end if;
  return v_old.result;
 end if;
 select role='admin',name into v_is_admin,v_name from public.profiles where id=u;
 case p_action
 when 'profile' then
  if length(btrim(coalesce(p_payload->>'fullName',''))) not between 2 and 120 or coalesce(p_payload->>'phone','')!~'^\+63[0-9]{10}$' then raise exception 'Enter a name and a valid +63 mobile number.';end if;
  if coalesce(p_payload->>'email','')<>(select email from public.profiles where id=u) then raise exception 'Contact your lender to change the login email.';end if;
  v_date:=nullif(p_payload->>'birthDate','')::date;
  if v_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Birth date cannot be in the future.';end if;
  if length(coalesce(p_payload->>'address',''))>500 or length(coalesce(p_payload->>'occupation',''))>150 or length(coalesce(p_payload->>'nickname',''))>80 then raise exception 'Profile text is too long.';end if;
  update public.profiles set name=btrim(p_payload->>'fullName'),first_name=split_part(btrim(p_payload->>'fullName'),' ',1),last_name=substr(btrim(p_payload->>'fullName'),length(split_part(btrim(p_payload->>'fullName'),' ',1))+2),nickname=btrim(coalesce(p_payload->>'nickname','')),phone=p_payload->>'phone' where id=u;
  insert into public.borrower_preferences(user_id,birth_date,address,occupation) values(u,v_date,btrim(coalesce(p_payload->>'address','')),btrim(coalesce(p_payload->>'occupation',''))) on conflict(user_id) do update set birth_date=excluded.birth_date,address=excluded.address,occupation=excluded.occupation,updated_at=now();
  v_result:=jsonb_build_object('saved',true);
 when 'preferences' then
  if jsonb_typeof(p_payload->'options')<>'object' or length((p_payload->'options')::text)>3000 then raise exception 'Invalid preferences.';end if;
  insert into public.borrower_preferences(user_id,ui_options) values(u,p_payload->'options') on conflict(user_id) do update set ui_options=excluded.ui_options,updated_at=now();v_result:=jsonb_build_object('saved',true);
 when 'avatar-upload' then
  perform mobile_private.check_file('avatars',p_payload->>'path',array['image/jpeg','image/png','image/webp'],2097152);
  update public.profiles set avatar_path=p_payload->>'path' where id=u;
  insert into public.borrower_preferences(user_id,avatar_id,use_profile_photo) values(u,null,true) on conflict(user_id) do update set avatar_id=null,use_profile_photo=true,updated_at=now();v_result:=jsonb_build_object('saved',true);
 when 'payment-submit' then
  if v_is_admin then raise exception 'Use a borrower account for proof submissions.';end if;
  v_amount:=(p_payload->>'amount')::numeric;v_date:=(p_payload->>'paidDate')::date;v_reference:=btrim(p_payload->>'reference');v_path:=p_payload->>'path';
  if v_amount is null or v_amount<=0 or v_amount>9999999999 or v_amount<>round(v_amount,2) or v_date is null or v_date>(now() at time zone 'Asia/Manila')::date or length(coalesce(v_reference,'')) not between 1 and 120 then raise exception 'Check the amount, payment date and reference.';end if;
  if coalesce(p_payload->>'method','') not in ('bank_transfer','gcash','maya','cash') then raise exception 'Choose a payment method.';end if;
  v_alloc:=p_payload->'allocations';
  if jsonb_typeof(v_alloc)<>'array' or jsonb_array_length(v_alloc) not between 1 and 500 then raise exception 'Select payable items.';end if;
  select array_agg(item->>'id'),min(item->>'id') into v_ids,v_first from jsonb_array_elements(v_alloc) item;
  if (select count(distinct x) from unnest(v_ids) x)<>cardinality(v_ids) or (select count(*) from public.transactions t where t.id=any(v_ids) and t.user_id=u and t.archived_at is null and t.status in ('unpaid','past_due') and t.amount>0)<>cardinality(v_ids) then raise exception 'Selected items must be your unpaid transactions.';end if;
  -- Preserve requested values from authoritative rows, never a client amount/title.
  select jsonb_agg(jsonb_build_object('id',id,'loanId',loan_id,'title',description,'amount',amount,'dueDate',due_date,'transactionDate',txn_date) order by id),min(loan_id) into v_alloc,v_first from public.transactions where id=any(v_ids);
  if v_first is null then raise exception 'Selected transactions have no loan reference.';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||lower(regexp_replace(v_reference,'\s','','g')),1));
  if exists(select 1 from public.payments where user_id=u and retracted_at is null and status in ('pending','approved') and lower(regexp_replace(reference,'\s','','g'))=lower(regexp_replace(v_reference,'\s','','g'))) then raise exception 'This reference already has a pending or approved proof.';end if;
  v_id:=nullif(p_payload->>'correctionOf','')::uuid;
  if v_id is not null and (not exists(select 1 from public.payments where id=v_id and user_id=u and status='rejected') or length(btrim(coalesce(p_payload->>'correctionNote','')))<10) then raise exception 'A rejected proof and correction note are required.';end if;
  if v_id is null and exists(select 1 from public.payments where user_id=u and status='rejected' and lower(regexp_replace(reference,'\s','','g'))=lower(regexp_replace(v_reference,'\s','','g'))) then raise exception 'Use Retry on the rejected proof and explain the correction.';end if;
  perform mobile_private.check_file('payment-proofs',v_path,array['image/jpeg','image/png','image/webp','application/pdf'],10485760);
  insert into public.payments(user_id,loan_id,amount,method,reference,file_name,file_type,file_path,paid_date,requested_allocations,submission_key,correction_of,correction_note,receipt_number,submission_notes)
   values(u,v_first,v_amount,(case p_payload->>'method' when 'gcash' then 'GCash' when 'maya' then 'Maya' when 'bank_transfer' then 'Bank Transfer' when 'cash' then 'Cash Deposit' end)::public.payment_method,v_reference,p_payload->>'fileName',case when p_payload->>'mime'='application/pdf' then 'pdf' else 'image' end,v_path,v_date,v_alloc,k,v_id,p_payload->>'correctionNote','AR-'||k::text,left(coalesce(p_payload->>'notes',''),2000)) returning * into v_pay;
  perform mobile_private.notify_admins('payment','Payment proof submitted','A borrower submitted proof '||v_pay.receipt_number||' for review. Requested allocations are attached; the ledger is unchanged.');
  v_result:=to_jsonb(v_pay);
 when 'payment-retract' then
  update public.payments set retracted_at=now() where id=(p_payload->>'id')::uuid and user_id=u and status='pending' and retracted_at is null returning * into v_pay;
  if not found then raise exception 'Only your pending proof can be withdrawn.';end if;v_result:=to_jsonb(v_pay);
 when 'support-submit' then
  v_topic:=btrim(coalesce(p_payload->>'topic',''));v_description:=btrim(coalesce(p_payload->>'description',''));
  if length(v_topic) not between 1 and 100 or length(v_description) not between 10 and 5000 or coalesce(p_payload->>'email','')!~'^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'Complete the topic, email and issue description.';end if;
  v_fingerprint:=md5(lower(regexp_replace(v_topic,'\s+',' ','g'))||'|'||lower(regexp_replace(v_description,'\s+',' ','g')));
  perform pg_advisory_xact_lock(hashtextextended(u::text||v_fingerprint,2));
  if exists(select 1 from public.support_tickets where user_id=u and fingerprint=v_fingerprint) then raise exception 'This issue already has a support ticket. Open the existing ticket.';end if;
  v_path:=nullif(p_payload->>'path','');if v_path is not null then perform mobile_private.check_file('mobile-attachments',v_path,array['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif'],5242880);end if;
  insert into public.support_tickets(user_id,ticket_number,email,topic,description,fingerprint,attachment_path,attachment_name) values(u,'SUP-'||upper(replace(k::text,'-','')),p_payload->>'email',v_topic,v_description,v_fingerprint,v_path,p_payload->>'fileName') returning * into v_ticket;
  insert into public.support_ticket_events(ticket_id,status,actor_id) values(v_ticket.id,'Submitted',u);
  perform mobile_private.notify_admins('account','Support ticket '||v_ticket.ticket_number,v_name||' submitted a support request: '||v_topic);v_result:=to_jsonb(v_ticket);
 when 'support-status' then
  if not v_is_admin or coalesce(p_payload->>'status','') not in ('Seen by lender','In progress','Resolved') then raise exception 'A lender must choose a supported ticket status.' using errcode='42501';end if;
  select * into v_ticket from public.support_tickets where id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Ticket not found.';end if;
  update public.support_tickets set status=p_payload->>'status',status_note=left(coalesce(p_payload->>'note',''),2000),updated_at=now() where id=v_ticket.id returning * into v_ticket;
  insert into public.support_ticket_events(ticket_id,status,note,actor_id) values(v_ticket.id,v_ticket.status,v_ticket.status_note,u);
  if v_ticket.user_id is not null then insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('account','Support ticket updated',v_ticket.ticket_number||': '||v_ticket.status,'targeted',array[v_ticket.user_id],u);end if;v_result:=to_jsonb(v_ticket);

 when 'notification-reply','notification-react' then
  if v_is_admin then raise exception 'Use the lender notification controls.';end if;
  v_id:=(p_payload->>'id')::uuid;
  if not exists(select 1 from public.notifications where id=v_id and (audience='all' or u=any(target_user_ids))) then raise exception 'Notification unavailable.' using errcode='42501';end if;
  if p_action='notification-react' then
   v_topic:=p_payload->>'emoji';
   if v_topic is null or v_topic not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'Choose a supported reaction.';end if;
   perform pg_advisory_xact_lock(hashtextextended(u::text||v_id::text,6));
   if exists(select 1 from public.notification_reactions where notification_id=v_id and user_id=u and emoji=v_topic) then
    delete from public.notification_reactions where notification_id=v_id and user_id=u;v_topic:=null;
   else
    insert into public.notification_reactions(notification_id,user_id,emoji) values(v_id,u,v_topic) on conflict(notification_id,user_id) do update set emoji=excluded.emoji,updated_at=now();
    perform mobile_private.notify_admins('account','Reaction to notification',v_name||' reacted '||v_topic||' to '||(select title from public.notifications where id=v_id));
   end if;
   v_result:=jsonb_build_object('notificationId',v_id,'emoji',v_topic);
  else
   v_description:=btrim(coalesce(p_payload->>'body',''));
   if length(v_description) not between 1 and 2000 then raise exception 'Write a reply of up to 2000 characters.';end if;
   select '↳ Reply to notification · '||title||E'\n> '||left(body,2500)||E'\n\n'||v_description into v_description from public.notifications where id=v_id;
   insert into public.messages(borrower_id,sender_id,from_admin,body,notification_id,client_key) values(u,u,false,v_description,v_id,k) returning * into v_msg;
   perform mobile_private.notify_admins('account','Reply: '||(select title from public.notifications where id=v_id),v_name||E'\n'||v_description);
   v_result:=to_jsonb(v_msg);
  end if;
 when 'message-send' then
  v_id:=coalesce(nullif(p_payload->>'borrowerId','')::uuid,u);if not v_is_admin and v_id<>u then raise exception 'Conversation ownership mismatch.' using errcode='42501';end if;
  if not exists(select 1 from public.profiles where id=v_id and role='user' and status='active') then raise exception 'Conversation unavailable.';end if;
  if length(coalesce(p_payload->>'body',''))>5000 then raise exception 'Message is too long.';end if;
  if nullif(p_payload->>'replyTo','') is not null and not exists(select 1 from public.messages where id=(p_payload->>'replyTo')::uuid and borrower_id=v_id) then raise exception 'Reply must belong to this conversation.';end if;
  v_path:=nullif(p_payload->>'path','');if v_path is not null then perform mobile_private.check_file('mobile-attachments',v_path,array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],5242880);end if;
  insert into public.messages(borrower_id,sender_id,from_admin,body,reply_to_id,attachment_path,attachment_name,attachment_type,attachment_size,client_key) values(v_id,u,v_is_admin,btrim(coalesce(p_payload->>'body','')),nullif(p_payload->>'replyTo','')::uuid,v_path,p_payload->>'fileName',p_payload->>'mime',nullif(p_payload->>'size','')::integer,k) returning * into v_msg;v_result:=to_jsonb(v_msg);
 when 'message-react' then
  select * into v_msg from public.messages where id=(p_payload->>'id')::uuid and (borrower_id=u or v_is_admin) for update;
  if not found or coalesce(p_payload->>'emoji','') not in ('👍','❤️','😊','🙏','✅','🎉','😮','😢','😂') then raise exception 'Message or reaction unavailable.';end if;
  v_topic:=case when v_is_admin then 'admin' else 'borrower' end;
  update public.messages set reactions=case when reactions->>v_topic=p_payload->>'emoji' then reactions-v_topic else jsonb_set(reactions,array[v_topic],to_jsonb(p_payload->>'emoji')) end where id=v_msg.id returning * into v_msg;v_result:=to_jsonb(v_msg);
 when 'message-hide','message-restore' then
  if not exists(select 1 from public.messages where id=(p_payload->>'id')::uuid and (borrower_id=u or v_is_admin)) then raise exception 'Message unavailable.';end if;
  if p_action='message-hide' then insert into public.message_hidden(user_id,message_id) values(u,(p_payload->>'id')::uuid) on conflict do nothing;else delete from public.message_hidden where user_id=u and message_id=(p_payload->>'id')::uuid;end if;v_result:=jsonb_build_object('saved',true);
 when 'message-read' then
  update public.messages set read_at=coalesce(read_at,now()) where borrower_id=coalesce(nullif(p_payload->>'borrowerId','')::uuid,u) and (borrower_id=u or v_is_admin) and from_admin<>v_is_admin;v_result:=jsonb_build_object('saved',true);
 when 'loan-submit' then
  v_amount:=(p_payload->>'amount')::numeric;
  if v_amount not between 5000 and 500000 or v_amount<>round(v_amount,2) or coalesce(p_payload->>'accountNumber','')!~'^[0-9]{4,34}$' or length(btrim(coalesce(p_payload->>'accountName',''))) not between 2 and 120 or length(btrim(coalesce(p_payload->>'bank',''))) not between 2 and 120 or coalesce(p_payload->>'accountConfirmed','')<>'true' or coalesce(p_payload->>'termsAccepted','')<>'true' then raise exception 'Check the loan amount, bank details and confirmations.';end if;
  select * into v_loan from public.submit_loan_request(v_amount,(p_payload->>'term')::integer,p_payload->>'bank',p_payload->>'accountNumber',p_payload->>'accountName');
  update public.loan_requests set purpose=left(coalesce(p_payload->>'purpose',''),500),consent_at=now(),account_confirmed=true,terms_version='4.12.24' where id=v_loan.id returning * into v_loan;v_result:=to_jsonb(v_loan);
 when 'loan-cancel' then select * into v_loan from public.cancel_my_loan_request((p_payload->>'id')::uuid,coalesce(p_payload->>'note',''));v_result:=to_jsonb(v_loan);
 when 'loan-bank' then
  if coalesce(p_payload->>'accountNumber','')!~'^[0-9]{4,34}$' or length(btrim(coalesce(p_payload->>'bank','')))<2 or length(btrim(coalesce(p_payload->>'accountName','')))<2 then raise exception 'Check the bank details.';end if;
  select * into v_loan from public.update_my_loan_request_bank((p_payload->>'id')::uuid,p_payload->>'bank',p_payload->>'accountNumber',p_payload->>'accountName');v_result:=to_jsonb(v_loan);
 when 'disbursement-accept' then v_result:=to_jsonb(public.acknowledge_loan_disbursement((p_payload->>'id')::uuid));
 else raise exception 'Unsupported action.';
 end case;
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,p_action,v_hash,v_result);
 return v_result;
end $function$
;

CREATE OR REPLACE FUNCTION mobile_private.notify_admins(p_category text, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admins uuid[];
  v_cat    text := coalesce(p_category, 'general');
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Notification body is required.';
  end if;
  if v_cat not in ('payment', 'document', 'account', 'general') then
    v_cat := 'general';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    if nullif(current_setting('app.notification_event',true),'') is null then perform set_config('app.notification_event',jsonb_build_object('event_type','system.admin_notice')::text,true);end if;
 insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (v_cat, coalesce(p_title, ''), p_body, 'targeted', v_admins, auth.uid());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_admins(p_category text, p_title text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admins uuid[];
  v_cat    text := coalesce(p_category, 'general');
begin
  if not public.is_admin() then raise exception 'A lender account is required.' using errcode='42501';end if;
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Notification body is required.';
  end if;
  if v_cat not in ('payment', 'document', 'account', 'general') then
    v_cat := 'general';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    if nullif(current_setting('app.notification_event',true),'') is null then perform set_config('app.notification_event',jsonb_build_object('event_type','system.admin_notice')::text,true);end if;
 insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (v_cat, coalesce(p_title, ''), p_body, 'targeted', v_admins, auth.uid());
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.acknowledge_loan_disbursement(p_id uuid)
 RETURNS loan_disbursements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row     public.loan_disbursements;
  v_name    text;
  v_admins  uuid[];
begin
  perform mobile_private.active_user();
  perform mobile_private.active_user();
  select * into v_row from public.loan_disbursements
   where id = p_id and user_id = auth.uid() for update;
  if v_row.id is null then
    raise exception 'Disbursement not found.';
  end if;
  if v_row.status <> 'assigned' then
    raise exception 'This disbursement cannot be acknowledged.';
  end if;
  if v_row.acknowledged_at is not null then
    -- Already acknowledged: return as-is (idempotent, no duplicate notification).
    return v_row;
  end if;

  update public.loan_disbursements
     set acknowledged_at = now(), acknowledged_by = auth.uid(), updated_at = now()
   where id = p_id
   returning * into v_row;

  select coalesce(name, 'The borrower') into v_name from public.profiles where id = auth.uid();

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    perform set_config('app.notification_event',(jsonb_build_object('event_type','disbursement.accepted','payload',jsonb_build_object('source_id',p_id,'reference',v_row.disbursement_number,'amount',v_row.net_proceeds)))::text,true);
 insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (
      'general',
      '✅ Disbursement Accepted',
      v_name || ' has accepted loan disbursement ' || v_row.disbursement_number
        || ' (net ₱' || to_char(v_row.net_proceeds, 'FM999,999,990.00') || ').',
      'targeted',
      v_admins,
      auth.uid()
    );
  end if;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_loan_request_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare nr_previous text:=current_setting('app.notification_event',true);
begin
 perform set_config('app.notification_event',(jsonb_build_object('event_type','loan.submitted','payload',jsonb_build_object('amount',new.amount,'source_id',new.id,'status',to_jsonb(new)->>'status','method',to_jsonb(new)->>'method','reference',to_jsonb(new)->>'reference','date',coalesce(to_jsonb(new)->>'paid_date',to_jsonb(new)->>'submitted_at',to_jsonb(new)->>'created_at'))))::text,true);
  insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
  values (
    'general',
    '📝 Loan Request Received',
    'Your loan request for ₱'
      || to_char(new.amount, 'FM999,999,999,999,990.00')
      || ' has been received. You can track the real-time status of your application at any time under your My Loan Requests tab.',
    'targeted',
    array[new.user_id],
    new.user_id
  );
  perform set_config('app.notification_event',coalesce(nr_previous,''),true);return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_payment_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare nr_previous text:=current_setting('app.notification_event',true);
begin
 perform set_config('app.notification_event',(jsonb_build_object('event_type','payment.proof_submitted','payload',jsonb_build_object('amount',new.amount,'source_id',new.id,'status',to_jsonb(new)->>'status','method',to_jsonb(new)->>'method','reference',to_jsonb(new)->>'reference','date',coalesce(to_jsonb(new)->>'paid_date',to_jsonb(new)->>'submitted_at',to_jsonb(new)->>'created_at'))))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('payment','Payment proof submitted','Your proof of ₱'||to_char(new.amount,'FM999,999,999,990.00')||' was submitted for review. Your ledger balance is unchanged.','targeted',array[new.user_id],new.user_id);perform set_config('app.notification_event',coalesce(nr_previous,''),true);return new;end $function$
;

CREATE OR REPLACE FUNCTION mobile_private.review_proof(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=mobile_private.active_user();k uuid:=(p_payload->>'key')::uuid;p public.payments;old mobile_private.operation_keys;v_status text:=p_payload->>'status';v_note text:=btrim(coalesce(p_payload->>'note',''));
begin
 if not public.is_admin() then raise exception 'Only a lender can review proofs.' using errcode='42501';end if;
 if k is null or coalesce(v_status,'') not in ('pending','approved','rejected') then raise exception 'Choose a supported review status.';end if;
 if v_status='rejected' and length(v_note)<10 then raise exception 'Explain the rejection in at least 10 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then if old.action<>'payment-review' or old.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return old.result;end if;
 select * into p from public.payments where id=(p_payload->>'id')::uuid for update;
 if not found or p.retracted_at is not null then raise exception 'This proof is missing or withdrawn.';end if;
 update public.payments set status=v_status::public.payment_status,note=left(v_note,2000),reviewed_at=now() where id=p.id returning * into p;
 perform set_config('app.notification_event',(jsonb_build_object('event_type','payment.proof_'||v_status,'payload',jsonb_build_object('amount',p.amount,'status',v_status,'note',v_note,'source_id',p.id,'reference',to_jsonb(p)->>'reference','method',to_jsonb(p)->>'method')))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by)
 values('payment',case v_status when 'approved' then 'Payment proof verified' when 'rejected' then 'Payment proof needs correction' else 'Payment proof reopened' end,
 case v_status when 'approved' then 'Your submitted proof was verified. Ledger allocations are managed separately by your lender.' when 'rejected' then v_note else 'Your submitted proof is pending review again.' end,'targeted',array[p.user_id],u);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'payment-review',md5(p_payload::text),to_jsonb(p));return to_jsonb(p);
end $function$
;
commit;
