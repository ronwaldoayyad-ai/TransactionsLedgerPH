begin;
set local lock_timeout='5s';
alter table mobile_private.telegram_settings add column message_enabled boolean not null default false;
alter table mobile_private.telegram_settings add column connection_version integer not null default 1;
alter table mobile_private.telegram_settings add constraint telegram_message_destination check(not message_enabled or (chat_id is not null and bot_id is not null));
alter table mobile_private.telegram_deliveries add column source_message_id uuid unique;
alter table mobile_private.telegram_deliveries add column connection_version integer not null default 1;
-- Preserve the old retry boundary when upgrading delivery history.
update mobile_private.telegram_deliveries d set connection_version=0
from mobile_private.telegram_settings s where s.singleton and d.settings_version<>s.version;
alter table mobile_private.telegram_deliveries drop constraint telegram_deliveries_kind_check;
alter table mobile_private.telegram_deliveries add constraint telegram_deliveries_kind_check check(kind in ('proof','message','test'));

create or replace function mobile_private.queue_telegram_proof() returns trigger
language plpgsql security definer set search_path='' as $$
declare s mobile_private.telegram_settings; borrower_name text;
begin
 if new.status::text<>'pending' or coalesce(new.file_path,'')='' then return new;end if;
 select * into s from mobile_private.telegram_settings where singleton and enabled;
 if not found then return new;end if;
 select name into borrower_name from public.profiles where id=new.user_id and role::text='user';
 if not found then return new;end if;
 insert into mobile_private.telegram_deliveries(payment_id,destination,bot_id,settings_version,connection_version,payload)
 values(new.id,s.chat_id,s.bot_id,s.version,s.connection_version,jsonb_build_object('borrower',borrower_name,'amount',new.amount,'reference',coalesce(nullif(new.receipt_number,''),new.id::text),'submittedAt',coalesce(new.submitted_at_exact,clock_timestamp())))
 on conflict(payment_id) do nothing;
 return new;
end $$;
revoke all on function mobile_private.queue_telegram_proof() from public,anon,authenticated;

create function mobile_private.queue_telegram_message() returns trigger
language plpgsql security definer set search_path='' as $$
declare s mobile_private.telegram_settings; borrower_name text; preview text;
begin
 if new.from_admin or new.sender_id is distinct from new.borrower_id then return new;end if;
 select * into s from mobile_private.telegram_settings where singleton and message_enabled;
 if not found then return new;end if;
 select name into borrower_name from public.profiles where id=new.borrower_id and role::text='user';
 if not found then return new;end if;
 preview:=btrim(regexp_replace(coalesce(new.body,''),'[[:space:][:cntrl:]]+',' ','g'));
 if preview='' then
  if coalesce(new.attachment_path,'')='' then return new;end if;
  preview:='Attachment shared';
 end if;
 if char_length(preview)>200 then preview:=left(preview,200)||'…';end if;
 insert into mobile_private.telegram_deliveries(kind,source_message_id,destination,bot_id,settings_version,connection_version,payload)
 values('message',new.id,s.chat_id,s.bot_id,s.version,s.connection_version,jsonb_build_object('borrower',borrower_name,'borrowerId',new.borrower_id,'preview',preview,'sentAt',new.created_at))
 on conflict(source_message_id) do nothing;
 return new;
end $$;
revoke all on function mobile_private.queue_telegram_message() from public,anon,authenticated;
create trigger telegram_borrower_message after insert on public.messages for each row execute function mobile_private.queue_telegram_message();
commit;
