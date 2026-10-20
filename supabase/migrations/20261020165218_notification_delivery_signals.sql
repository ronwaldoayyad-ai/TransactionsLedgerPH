begin;
-- Publish only a recipient's revision. Inbox content continues through RLS;
-- archived/retargeted rows need not remain visible to deliver removal signals.
create or replace function mobile_private.signal_notification_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 old_targets uuid[] := '{}'; new_targets uuid[] := '{}';
 old_shared boolean := false; new_shared boolean := false;
begin
 if tg_op <> 'INSERT' then old_targets := old.target_user_ids; old_shared := old.audience='all'; end if;
 if tg_op <> 'DELETE' then new_targets := new.target_user_ids; new_shared := new.audience='all'; end if;
 insert into public.notification_change_signals(user_id)
 select p.id from public.profiles p where p.status='active'
  and (p.role='admin' or old_shared or new_shared or p.id=any(old_targets) or p.id=any(new_targets))
 on conflict(user_id) do update set revision=gen_random_uuid();
 return null;
end $$;
revoke all on function mobile_private.signal_notification_change() from public,anon,authenticated;
drop trigger if exists notification_archive_signal on public.notifications;
drop trigger if exists notification_change_signal on public.notifications;
create trigger notification_change_signal after insert or update or delete on public.notifications
 for each row execute function mobile_private.signal_notification_change();

create or replace function mobile_private.signal_notification_read_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_reader uuid; new_reader uuid;
begin
 if tg_op <> 'INSERT' then old_reader := old.user_id; end if;
 if tg_op <> 'DELETE' then new_reader := new.user_id; end if;
 insert into public.notification_change_signals(user_id)
 select p.id from public.profiles p where p.status='active'
  and (p.role='admin' or p.id=old_reader or p.id=new_reader)
 on conflict(user_id) do update set revision=gen_random_uuid();
 return null;
end $$;
revoke all on function mobile_private.signal_notification_read_change() from public,anon,authenticated;
drop trigger if exists notification_read_change_signal on public.notification_reads;
create trigger notification_read_change_signal after insert or update or delete on public.notification_reads
 for each row execute function mobile_private.signal_notification_read_change();
commit;
