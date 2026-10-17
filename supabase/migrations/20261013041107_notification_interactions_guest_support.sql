begin;
alter table public.support_tickets alter column user_id drop not null;
alter table public.support_tickets add column guest_key uuid, add column guest_request_hash text;
alter table public.support_tickets add constraint support_guest_identity check(user_id is not null or (guest_key is not null and guest_request_hash is not null));
create unique index support_guest_retry on public.support_tickets(guest_key) where user_id is null;
alter table public.support_ticket_events alter column actor_id drop not null;
alter table public.messages add column notification_id uuid references public.notifications(id) on delete set null;
create index messages_notification on public.messages(notification_id) where notification_id is not null;
alter table public.notifications alter column created_by drop not null;
alter table public.notifications drop constraint notifications_category_check;alter table public.notifications add constraint notifications_category_check check(category in ('payment','document','account','general','promo','feature'));

create table public.notification_reactions(notification_id uuid not null references public.notifications(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')),updated_at timestamptz not null default now(),primary key(notification_id,user_id));
create index notification_reactions_user on public.notification_reactions(user_id,notification_id);
alter table public.notification_reactions enable row level security;
revoke all on public.notification_reactions from anon,authenticated;
grant select on public.notification_reactions to authenticated;
create policy own_notification_reactions on public.notification_reactions for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy notification_reactions_active on public.notification_reactions as restrictive to authenticated using((select mobile_private.valid_session()) and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')); 
do $migration$
declare definition text;
begin
definition:=pg_get_functiondef('mobile_private.action(text,jsonb)'::regprocedure);
definition:=replace(definition,' when ''message-send'' then',$branches$
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
 when 'message-send' then$branches$);
if definition not like '%notification-react%' then raise exception 'Mobile action extension failed.';end if;
-- Guest tickets remain visible to lenders but have no verified borrower owner.
definition:=replace(definition,'insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values(''account'',''Support ticket updated''','if v_ticket.user_id is not null then insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values(''account'',''Support ticket updated''');
definition:=replace(definition,'''targeted'',array[v_ticket.user_id],u);v_result:=to_jsonb(v_ticket);','''targeted'',array[v_ticket.user_id],u);end if;v_result:=to_jsonb(v_ticket);');
execute definition;
end $migration$;
alter publication supabase_realtime add table public.notification_reactions;
notify pgrst,'reload schema';
commit;
