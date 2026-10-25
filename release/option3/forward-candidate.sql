-- GENERATED REHEARSAL CANDIDATE. NOT APPROVED FOR PRODUCTION.
begin;
set local lock_timeout='5s';
-- Option 3 additive foundation. Requires a verified existing production baseline.
-- local-mobile-enhancements.sql
-- Run only against the copied local Supabase database.

alter table public.loans add column if not exists loan_category text;
alter table public.loans add constraint loans_category_valid check (loan_category is null or loan_category in ('cash_loan','retail_installment'));
-- Existing cash advances are explicitly labelled; the remaining installment
-- labels describe financed purchases, bookings or services. Straight rows stay null.

comment on column public.loans.loan_category is 'Local mobile category. Initial backfill uses copied labels; lender can correct categories. Null means unclassified; required on future installment creation.';

create table if not exists public.borrower_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 avatar_id text check (avatar_id is null or avatar_id in ('rosie-cat','sunny-fox','bamboo-panda','astro-bot','cloud-bunny','ocean-owl','honey-bear','little-penguin')),
 use_profile_photo boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.borrower_preferences enable row level security;
revoke all on public.borrower_preferences from anon;
grant select,insert,update,delete on public.borrower_preferences to authenticated;
create policy "preferences: read own" on public.borrower_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy "preferences: insert own" on public.borrower_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy "preferences: update own" on public.borrower_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "preferences: delete own" on public.borrower_preferences for delete to authenticated using ((select auth.uid())=user_id);
alter table public.payments add column if not exists paid_date date;
-- Legacy submissions do not record the date paid separately. Keep it null,
-- rather than treating upload date as payment date.
notify pgrst,'reload schema';


-- local-full-flow.sql

create schema if not exists mobile_private;
revoke all on schema mobile_private from public,anon;
grant usage on schema mobile_private to authenticated;
create table mobile_private.operation_keys(actor_id uuid not null,key uuid not null,action text not null,payload_hash text not null,result jsonb not null,created_at timestamptz not null default now(),primary key(actor_id,key));
revoke all on mobile_private.operation_keys from public,anon,authenticated;
alter table public.borrower_preferences add column birth_date date,add column address text not null default '',add column occupation text not null default '',add column ui_options jsonb not null default '{}';
alter table public.payments add column requested_allocations jsonb,add column submission_key uuid,add column correction_of uuid references public.payments(id),add column correction_note text,add column retracted_at timestamptz,add column receipt_number text;
create unique index payments_submission_key on public.payments(user_id,submission_key) where submission_key is not null;
create view public.mobile_payment_submissions with(security_invoker=true) as select * from public.payments where submission_key is not null;
grant select on public.mobile_payment_submissions to authenticated;
revoke all on public.mobile_payment_submissions from anon;
create table public.support_tickets(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),ticket_number text not null unique,
 email text not null,topic text not null,description text not null,fingerprint text not null,status text not null default 'Submitted' check(status in ('Submitted','Seen by lender','In progress','Resolved')),
 attachment_path text,attachment_name text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),status_note text not null default '',
 unique(user_id,fingerprint),check(length(btrim(description)) between 10 and 5000));
create table public.support_ticket_events(id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.support_tickets(id),status text not null,note text not null default '',actor_id uuid not null references public.profiles(id),created_at timestamptz not null default now());
alter table public.support_tickets enable row level security;
alter table public.support_ticket_events enable row level security;
grant select on public.support_tickets,public.support_ticket_events to authenticated;
revoke insert,update,delete on public.support_tickets,public.support_ticket_events from authenticated;
revoke all on public.support_tickets,public.support_ticket_events from anon;
create policy own_tickets on public.support_tickets for select to authenticated using(user_id=(select auth.uid()) or public.is_admin());
create policy own_ticket_events on public.support_ticket_events for select to authenticated using(exists(select 1 from public.support_tickets t where t.id=ticket_id));
create index support_tickets_user_created on public.support_tickets(user_id,created_at desc);
create index support_ticket_events_ticket on public.support_ticket_events(ticket_id,created_at);
alter table public.messages add column reply_to_id uuid references public.messages(id) on delete set null,add column attachment_path text,add column attachment_name text,add column attachment_type text,add column attachment_size integer,add column client_key uuid;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check(length(btrim(body))>0 or attachment_path is not null);
create unique index messages_client_key on public.messages(sender_id,client_key) where client_key is not null;
create table public.message_hidden(user_id uuid not null references public.profiles(id),message_id uuid not null references public.messages(id) on delete cascade,primary key(user_id,message_id));
alter table public.message_hidden enable row level security;
grant select on public.message_hidden to authenticated;
revoke insert,update,delete on public.message_hidden from authenticated;
revoke all on public.message_hidden from anon;
create policy own_hidden_messages on public.message_hidden for select to authenticated using(user_id=(select auth.uid()));
alter table public.loan_requests add column purpose text,add column consent_at timestamptz,add column account_confirmed boolean,add column terms_version text;
-- Only hashes of temporary login codes are stored. These are never client-writable.
create table public.mobile_login_tokens(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),code_hash text not null unique,issued_by uuid not null references public.profiles(id),expires_at timestamptz not null,consumed_at timestamptz,revoked_at timestamptz,created_at timestamptz not null default now());
alter table public.mobile_login_tokens enable row level security;
revoke all on public.mobile_login_tokens from anon,authenticated;
grant select(id,user_id,issued_by,expires_at,consumed_at,revoked_at,created_at) on public.mobile_login_tokens to authenticated;
create policy lender_token_history on public.mobile_login_tokens for select to authenticated using(public.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mobile-attachments','mobile-attachments',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy mobile_attachment_read on storage.objects for select to authenticated using(bucket_id='mobile-attachments' and ((storage.foldername(name))[1]=(select auth.uid())::text or public.is_admin()));
create policy mobile_attachment_insert on storage.objects for insert to authenticated with check(bucket_id='mobile-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(select 1 from public.profiles where id=auth.uid() and status='active'));
create policy mobile_attachment_delete on storage.objects for delete to authenticated using(bucket_id='mobile-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function mobile_private.active_user() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'An active account is required.' using errcode='42501';end if;
 return auth.uid();
end $$;
revoke all on function mobile_private.active_user() from public,anon;
grant execute on function mobile_private.active_user() to authenticated;

create function mobile_private.check_file(p_bucket text,p_path text,p_mimes text[],p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=mobile_private.active_user();v_meta jsonb;
begin
 if p_path is null or split_part(p_path,'/',1)<>v_uid::text then raise exception 'File ownership mismatch.';end if;
 select metadata into v_meta from storage.objects where bucket_id=p_bucket and name=p_path;
 if v_meta is null or not coalesce(v_meta->>'mimetype','')=any(p_mimes) or coalesce((v_meta->>'size')::bigint,0)<=0 or (v_meta->>'size')::bigint>p_limit then raise exception 'Upload a supported file within the size limit.';end if;
end $$;
revoke all on function mobile_private.check_file(text,text,text[],integer) from public,anon,authenticated;

create function mobile_private.action(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=mobile_private.active_user();k uuid:=(p_payload->>'key')::uuid;v_hash text:=md5(p_payload::text);v_old mobile_private.operation_keys;
 v_result jsonb;v_pay public.payments;v_loan public.loan_requests;v_ticket public.support_tickets;v_msg public.messages;
 v_alloc jsonb;v_ids text[];v_first text;v_reference text;v_date date;v_amount numeric;v_path text;v_id uuid;v_topic text;v_description text;v_fingerprint text;v_name text;v_is_admin boolean;
begin
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
  if v_amount<=0 or v_amount>9999999999 or v_amount<>round(v_amount,2) or v_date is null or v_date>(now() at time zone 'Asia/Manila')::date or length(coalesce(v_reference,'')) not between 1 and 120 then raise exception 'Check the amount, payment date and reference.';end if;
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
  insert into public.payments(user_id,loan_id,amount,method,reference,file_name,file_type,file_path,paid_date,requested_allocations,submission_key,correction_of,correction_note,receipt_number)
   values(u,v_first,v_amount,(p_payload->>'method')::public.payment_method,v_reference,p_payload->>'fileName',case when p_payload->>'mime'='application/pdf' then 'pdf' else 'image' end,v_path,v_date,v_alloc,k,v_id,p_payload->>'correctionNote','AR-'||k::text) returning * into v_pay;
  perform public.notify_admins('payment','Payment proof submitted','A borrower submitted proof '||v_pay.receipt_number||' for review. Requested allocations are attached; the ledger is unchanged.');
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
  v_path:=nullif(p_payload->>'path','');if v_path is not null then perform mobile_private.check_file('mobile-attachments',v_path,array['image/jpeg','image/png','image/webp'],5242880);end if;
  insert into public.support_tickets(user_id,ticket_number,email,topic,description,fingerprint,attachment_path,attachment_name) values(u,'SUP-'||upper(substr(k::text,1,8)),p_payload->>'email',v_topic,v_description,v_fingerprint,v_path,p_payload->>'fileName') returning * into v_ticket;
  insert into public.support_ticket_events(ticket_id,status,actor_id) values(v_ticket.id,'Submitted',u);
  perform public.notify_admins('account','Support ticket '||v_ticket.ticket_number,v_name||' submitted a support request: '||v_topic);v_result:=to_jsonb(v_ticket);
 when 'support-status' then
  if not v_is_admin or coalesce(p_payload->>'status','') not in ('Seen by lender','In progress','Resolved') then raise exception 'A lender must choose a supported ticket status.' using errcode='42501';end if;
  select * into v_ticket from public.support_tickets where id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Ticket not found.';end if;
  update public.support_tickets set status=p_payload->>'status',status_note=left(coalesce(p_payload->>'note',''),2000),updated_at=now() where id=v_ticket.id returning * into v_ticket;
  insert into public.support_ticket_events(ticket_id,status,note,actor_id) values(v_ticket.id,v_ticket.status,v_ticket.status_note,u);
  insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('account','Support ticket updated',v_ticket.ticket_number||': '||v_ticket.status,'targeted',array[v_ticket.user_id],u);v_result:=to_jsonb(v_ticket);
 when 'message-send' then
  v_id:=coalesce(nullif(p_payload->>'borrowerId','')::uuid,u);if not v_is_admin and v_id<>u then raise exception 'Conversation ownership mismatch.' using errcode='42501';end if;
  if not exists(select 1 from public.profiles where id=v_id and role='user' and status='active') then raise exception 'Conversation unavailable.';end if;
  if length(coalesce(p_payload->>'body',''))>5000 then raise exception 'Message is too long.';end if;
  if nullif(p_payload->>'replyTo','') is not null and not exists(select 1 from public.messages where id=(p_payload->>'replyTo')::uuid and borrower_id=v_id) then raise exception 'Reply must belong to this conversation.';end if;
  v_path:=nullif(p_payload->>'path','');if v_path is not null then perform mobile_private.check_file('mobile-attachments',v_path,array['image/jpeg','image/png','image/webp','application/pdf'],5242880);end if;
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
  if v_amount not between 5000 and 500000 or v_amount<>round(v_amount,2) or coalesce(p_payload->>'accountNumber','')!~'^[0-9]{4,34}$' or length(btrim(coalesce(p_payload->>'accountName',''))) not between 2 and 120 or length(btrim(coalesce(p_payload->>'bank',''))) not between 2 and 120 or p_payload->>'accountConfirmed'<>'true' or p_payload->>'termsAccepted'<>'true' then raise exception 'Check the loan amount, bank details and confirmations.';end if;
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
end $$;
revoke all on function mobile_private.action(text,jsonb) from public,anon;
grant execute on function mobile_private.action(text,jsonb) to authenticated;
create function public.mobile_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select mobile_private.action(p_action,p_payload)$$;
revoke all on function public.mobile_action(text,jsonb) from public,anon;
grant execute on function public.mobile_action(text,jsonb) to authenticated;
-- A proof notification describes a submitted proof, not ledger settlement.
create or replace function public.notify_payment_received() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('payment','Payment proof submitted','Your proof of ₱'||to_char(new.amount,'FM999,999,999,990.00')||' was submitted for review. Your ledger balance is unchanged.','targeted',array[new.user_id],new.user_id);return new;end $$;
-- Borrower writes go through the validated atomic RPC. Existing lender updates remain.

create policy "payments: admin insert" on public.payments for insert to authenticated with check(public.is_admin());




-- Guard inactive users on all financial/private-message reads, even outside the UI.
do $$declare t text;begin foreach t in array array['loans','transactions','payments','payment_logs','loan_requests','loan_request_events','invoices','loan_disbursements','messages','support_tickets','support_ticket_events','borrower_preferences'] loop
 execute format('create policy mobile_active_account on public.%I as restrictive to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid()) and status=''active'')) with check (exists(select 1 from public.profiles where id=(select auth.uid()) and status=''active''))',t);end loop;end $$;
notify pgrst,'reload schema';


-- local-statements.sql

create table public.borrower_statements(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),statement_number text unique not null,due_date date not null,status_filter text not null,rows jsonb not null,total_due numeric(14,2) not null,created_at timestamptz not null default now());
alter table public.borrower_statements enable row level security;
grant select on public.borrower_statements to authenticated;
revoke insert,update,delete on public.borrower_statements from authenticated;
revoke all on public.borrower_statements from anon;
create policy own_statements on public.borrower_statements for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles where id=auth.uid() and status='active'));
create index borrower_statements_user_date on public.borrower_statements(user_id,created_at desc);
create function mobile_private.statement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mobile_private.active_user();k uuid:=(p_payload->>'key')::uuid;v_row public.borrower_statements;v_rows jsonb;v_total numeric;v_old mobile_private.operation_keys;
begin
 if k is null then raise exception 'A retry key is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into v_old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then if v_old.action<>'statement-create' or v_old.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return v_old.result;end if;
 if coalesce(p_payload->>'status','') not in ('All','Upcoming','Past Due','Paid','Cancelled','Refunded') then raise exception 'Unsupported statement filter.';end if;
 select jsonb_agg(jsonb_build_object('id',id,'description',description,'transactionDate',txn_date,'amount',amount,'status',case when status='unpaid' and due_date<(now() at time zone 'Asia/Manila')::date then 'Past Due' when status='unpaid' then 'Upcoming' when status='past_due' then 'Past Due' else initcap(status::text) end,'paidDate',date_paid,'dueDate',due_date) order by id),coalesce(sum(case when status in ('paid','cancelled','refunded') then 0 else amount end),0) into v_rows,v_total
 from public.transactions where user_id=u and archived_at is null and due_date=(p_payload->>'dueDate')::date and (p_payload->>'status'='All' or p_payload->>'status'=case when status='unpaid' and due_date<(now() at time zone 'Asia/Manila')::date then 'Past Due' when status='unpaid' then 'Upcoming' when status='past_due' then 'Past Due' else initcap(status::text) end);
 if v_rows is null then raise exception 'No matching statement items.';end if;
 insert into public.borrower_statements(user_id,statement_number,due_date,status_filter,rows,total_due) values(u,'BST-'||upper(substr(k::text,1,8)),(p_payload->>'dueDate')::date,p_payload->>'status',v_rows,v_total) returning * into v_row;
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'statement-create',md5(p_payload::text),to_jsonb(v_row));return to_jsonb(v_row);
end $$;
revoke all on function mobile_private.statement(jsonb) from public,anon;
grant execute on function mobile_private.statement(jsonb) to authenticated;
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select case when p_action='statement-create' then mobile_private.statement(p_payload) else mobile_private.action(p_action,p_payload) end$$;
drop policy "payment_due_overrides: read for authenticated" on public.payment_due_overrides;
create policy "payment_due_overrides: own or lender" on public.payment_due_overrides for select to authenticated using(borrower_id=(select auth.uid()) or public.is_admin());
-- Enable realtime for new durable contracts.
alter publication supabase_realtime add table public.support_tickets,public.support_ticket_events,public.message_hidden,public.borrower_statements;
notify pgrst,'reload schema';


-- local-flow-fixes.sql

-- Keep the existing production enum values; normalize only the local RPC input.
do $$declare v text;begin
 select pg_get_functiondef('mobile_private.action(text,jsonb)'::regprocedure) into v;
 v:=replace(v,'(p_payload->>''method'')::public.payment_method','(case p_payload->>''method'' when ''gcash'' then ''GCash'' when ''maya'' then ''Maya'' when ''bank_transfer'' then ''Bank Transfer'' when ''cash'' then ''Cash Deposit'' end)::public.payment_method');
 v:=replace(v,'if v_amount<=0','if v_amount is null or v_amount<=0');
 v:=replace(v,'or p_payload->>''accountConfirmed''<>''true'' or p_payload->>''termsAccepted''<>''true''','or coalesce(p_payload->>''accountConfirmed'','''')<>''true'' or coalesce(p_payload->>''termsAccepted'','''')<>''true''');
 execute v;
end $$;
alter table public.borrower_statements add column scope_filter text not null default 'all';
create or replace function mobile_private.statement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mobile_private.active_user();k uuid:=(p_payload->>'key')::uuid;v_row public.borrower_statements;v_rows jsonb;v_total numeric;v_old mobile_private.operation_keys;v_status text:=p_payload->>'status';v_scope text:=coalesce(p_payload->>'scope','all');
begin
 if k is null then raise exception 'A retry key is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into v_old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then if v_old.action<>'statement-create' or v_old.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return v_old.result;end if;
 if coalesce(v_status,'') not in ('All','Unpaid','Upcoming','Past Due','Paid','Cancelled','Refunded') or v_scope not in ('all','excludePaid','excludeCancelled','excludeRefunded') then raise exception 'Unsupported statement filter.';end if;
 select jsonb_agg(jsonb_build_object('id',id,'description',description,'transactionDate',txn_date,'amount',amount,'status',display_status,'paidDate',date_paid,'dueDate',due_date) order by id),coalesce(sum(case when status in ('paid','cancelled','refunded') then 0 else amount end),0) into v_rows,v_total from (
 select t.*,case when status in ('unpaid','past_due') then 'Unpaid' else initcap(status::text) end display_status from public.transactions t where user_id=u and archived_at is null and due_date=(p_payload->>'dueDate')::date
 ) t where (v_status='All' or v_status=display_status or v_status='Upcoming' and status='unpaid' and due_date>=(now() at time zone 'Asia/Manila')::date or v_status='Past Due' and (status='past_due' or status='unpaid' and due_date<(now() at time zone 'Asia/Manila')::date)) and not(v_scope='excludePaid' and status='paid' or v_scope='excludeCancelled' and status='cancelled' or v_scope='excludeRefunded' and status='refunded');
 if v_rows is null then raise exception 'No matching statement items.';end if;
 insert into public.borrower_statements(user_id,statement_number,due_date,status_filter,scope_filter,rows,total_due) values(u,'BST-'||upper(replace(k::text,'-','')),(p_payload->>'dueDate')::date,v_status,v_scope,v_rows,v_total) returning * into v_row;
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'statement-create',md5(p_payload::text),to_jsonb(v_row));return to_jsonb(v_row);
end $$;
-- Serialize acknowledgement and state changes before invoking existing logic.
do $$declare n text;v text;begin foreach n in array array['acknowledge_loan_disbursement','cancel_my_loan_request','update_my_loan_request_bank'] loop
 select pg_get_functiondef(oid) into v from pg_proc where pronamespace='public'::regnamespace and proname=n;
 if v is not null then v:=replace(v,'where id = p_id and user_id = auth.uid();','where id = p_id and user_id = auth.uid() for update;');v:=replace(v,'begin'||chr(10),'begin'||chr(10)||'  perform mobile_private.active_user();'||chr(10));execute v;end if;
end loop;end $$;
revoke execute on function public.submit_loan_request(numeric,integer,text,text,text) from public,anon,authenticated;
revoke execute on function public.cancel_my_loan_request(uuid,text) from public,anon,authenticated;
revoke execute on function public.update_my_loan_request_bank(uuid,text,text,text) from public,anon,authenticated;
revoke execute on function public.notify_admins(text,text,text) from public,anon,authenticated;
notify pgrst,'reload schema';


-- local-upload-validation.sql

create table mobile_private.verified_uploads(object_id uuid primary key references storage.objects(id) on delete cascade,owner_id uuid not null,bucket text not null,path text not null,updated_at timestamptz not null,sha256 text not null,mime text not null,size bigint not null);
alter table mobile_private.verified_uploads enable row level security;
alter table mobile_private.operation_keys enable row level security;
revoke all on mobile_private.verified_uploads from public,anon,authenticated;
create or replace function mobile_private.check_file(p_bucket text,p_path text,p_mimes text[],p_limit integer) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=mobile_private.active_user();v_meta jsonb;
begin
 if p_path is null or split_part(p_path,'/',1)<>v_uid::text then raise exception 'File ownership mismatch.';end if;
 select metadata into v_meta from storage.objects o join mobile_private.verified_uploads v on v.object_id=o.id and v.owner_id=v_uid and v.updated_at=o.updated_at and v.mime=o.metadata->>'mimetype' and v.size=(o.metadata->>'size')::bigint where o.bucket_id=p_bucket and o.name=p_path;
 if v_meta is null or not coalesce(v_meta->>'mimetype','')=any(p_mimes) or coalesce((v_meta->>'size')::bigint,0)<=0 or (v_meta->>'size')::bigint>p_limit then raise exception 'Upload and validate a supported file within the size limit.';end if;
end $$;
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id='mobile-attachments';
do $$declare v text;begin select pg_get_functiondef('mobile_private.action(text,jsonb)'::regprocedure) into v;
 v:=replace(v,'array[''image/jpeg'',''image/png'',''image/webp''],5242880','array[''image/jpeg'',''image/png'',''image/webp'',''image/gif'',''image/bmp'',''image/avif''],5242880');
 v:=replace(v,'array[''image/jpeg'',''image/png'',''image/webp'',''application/pdf''],5242880','array[''image/jpeg'',''image/png'',''image/webp'',''application/pdf'',''application/msword'',''application/vnd.openxmlformats-officedocument.wordprocessingml.document''],5242880');
 execute v;
end $$;
notify pgrst,'reload schema';

-- local-flow-guards.sql

create function mobile_private.valid_session() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid())$$;
revoke all on function mobile_private.valid_session() from public,anon;
grant execute on function mobile_private.valid_session() to authenticated;
create or replace function mobile_private.active_user() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not mobile_private.valid_session() or not exists(select 1 from public.profiles where id=auth.uid() and status='active') then raise exception 'An active sign-in is required.' using errcode='42501';end if;return auth.uid();
end $$;
do $$declare t text;begin foreach t in array array['loans','transactions','payments','payment_logs','loan_requests','loan_request_events','invoices','loan_disbursements','messages','support_tickets','support_ticket_events','borrower_preferences','borrower_statements','message_hidden'] loop execute format('create policy mobile_valid_session on public.%I as restrictive to authenticated using(mobile_private.valid_session()) with check(mobile_private.valid_session())',t);end loop;end $$;
alter table public.payments add column submission_notes text not null default '';
do $$declare v text;begin
 select pg_get_functiondef('public.notify_admins(text,text,text)'::regprocedure) into v;
 execute replace(v,'public.notify_admins','mobile_private.notify_admins');
 execute replace(v,'begin'||chr(10),'begin'||chr(10)||'  if not public.is_admin() then raise exception ''A lender account is required.'' using errcode=''42501'';end if;'||chr(10));
end $$;
revoke all on function mobile_private.notify_admins(text,text,text) from public,anon,authenticated;
grant execute on function public.notify_admins(text,text,text) to authenticated;
do $$declare v text;begin
 select pg_get_functiondef('mobile_private.action(text,jsonb)'::regprocedure) into v;
 v:=replace(v,'perform public.notify_admins','perform mobile_private.notify_admins');
 v:=replace(v,'receipt_number)','receipt_number,submission_notes)');
 v:=replace(v,'''AR-''||k::text) returning','''AR-''||k::text,left(coalesce(p_payload->>''notes'',''''),2000)) returning');
 v:=replace(v,'''SUP-''||upper(substr(k::text,1,8))','''SUP-''||upper(replace(k::text,''-'',''''))');
 execute v;
end $$;
do $$declare n text;v text;begin foreach n in array array['update_my_profile','set_my_avatar','acknowledge_loan_disbursement'] loop
 select pg_get_functiondef(oid) into v from pg_proc where pronamespace='public'::regnamespace and proname=n;
 if v is not null then v:=replace(v,'begin'||chr(10),'begin'||chr(10)||'  perform mobile_private.active_user();'||chr(10));execute v;end if;
end loop;end $$;
-- Internal trigger functions do not need client execution privileges.
do $$declare r record;begin for r in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and prorettype in ('trigger'::regtype,'event_trigger'::regtype) loop execute format('revoke execute on function %s from public,anon,authenticated',r.sig);end loop;end $$;
notify pgrst,'reload schema';

-- local-storage-guards.sql

create policy mobile_storage_active on storage.objects as restrictive to authenticated using(bucket_id not in ('avatars','payment-proofs','mobile-attachments') or (mobile_private.valid_session() and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active'))) with check(bucket_id not in ('avatars','payment-proofs','mobile-attachments') or (mobile_private.valid_session() and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')));
create policy mobile_keep_proof_history on storage.objects as restrictive for delete to authenticated using(bucket_id<>'payment-proofs' or public.is_admin() or not exists(select 1 from public.payments where file_path=storage.objects.name));
create or replace function public.set_my_avatar(p_path text) returns void language plpgsql security definer set search_path='' as $$begin
 perform mobile_private.active_user();
 if p_path is not null then
  if split_part(p_path,'/',1)<>auth.uid()::text then raise exception 'File ownership mismatch.';end if;
  if not public.is_admin() then perform mobile_private.check_file('avatars',p_path,array['image/jpeg','image/png','image/webp'],2097152);end if;
 end if;
 update public.profiles set avatar_path=p_path where id=auth.uid();
end $$;
revoke execute on function public.set_my_avatar(text) from public,anon;
alter function public.set_loan_request_reference() set search_path=pg_catalog,public;
alter function public.set_transaction_id() set search_path=pg_catalog,public;
drop policy "audit: authenticated append" on public.audit_log;
create policy "audit: lender append" on public.audit_log for insert to authenticated with check(public.is_admin() and mobile_private.valid_session());
notify pgrst,'reload schema';

-- local-proof-review.sql

create function mobile_private.review_proof(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by)
 values('payment',case v_status when 'approved' then 'Payment proof verified' when 'rejected' then 'Payment proof needs correction' else 'Payment proof reopened' end,
 case v_status when 'approved' then 'Your submitted proof was verified. Ledger allocations are managed separately by your lender.' when 'rejected' then v_note else 'Your submitted proof is pending review again.' end,'targeted',array[p.user_id],u);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'payment-review',md5(p_payload::text),to_jsonb(p));return to_jsonb(p);
end $$;
revoke all on function mobile_private.review_proof(jsonb) from public,anon;
grant execute on function mobile_private.review_proof(jsonb) to authenticated;
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select case when p_action='statement-create' then mobile_private.statement(p_payload) when p_action='payment-review' then mobile_private.review_proof(p_payload) else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';


-- 20261013041107_notification_interactions_guest_support.sql

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


-- 20261013061101_borrower_invoice_deletion.sql

alter table public.borrower_statements add column deleted_at timestamptz;
create policy visible_borrower_statements on public.borrower_statements as restrictive for select to authenticated using(deleted_at is null);
-- Retain the immutable snapshot for audit. Only its authenticated owner can hide it.
create function mobile_private.delete_statement(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=mobile_private.active_user(); k uuid:=(p_payload->>'key')::uuid; v_id uuid:=(p_payload->>'id')::uuid; v_old mobile_private.operation_keys; v_result jsonb;
begin
 if k is null or v_id is null then raise exception 'An invoice and retry key are required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||k::text,0));
 select * into v_old from mobile_private.operation_keys where actor_id=u and key=k;
 if found then if v_old.action<>'statement-delete' or v_old.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return v_old.result;end if;
 update public.borrower_statements set deleted_at=coalesce(deleted_at,now()) where id=v_id and user_id=u;
 if not found then raise exception 'Generated invoice unavailable.' using errcode='42501';end if;
 v_result:=jsonb_build_object('id',v_id,'deleted',true);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(u,k,'statement-delete',md5(p_payload::text),v_result);
 return v_result;
end $$;
revoke all on function mobile_private.delete_statement(jsonb) from public,anon;
grant execute on function mobile_private.delete_statement(jsonb) to authenticated;
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select case when p_action='statement-create' then mobile_private.statement(p_payload) when p_action='statement-delete' then mobile_private.delete_statement(p_payload) when p_action='payment-review' then mobile_private.review_proof(p_payload) else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';


-- 20261014033328_borrower_account_numbers.sql
-- Public-facing account numbers are permanent references, separate from UUID keys.

create schema if not exists private;
create table if not exists private.borrower_number_counters (
  name_prefix text primary key check (name_prefix ~ '^[0-9]{10}$'),
  last_suffix bigint not null check (last_suffix > 0)
);
alter table private.borrower_number_counters enable row level security;
revoke all on private.borrower_number_counters from public, anon, authenticated;

alter table public.profiles add column if not exists borrower_account_number text;
alter table public.profiles add constraint profiles_borrower_account_number_format
  check (borrower_account_number is null or borrower_account_number ~ '^[0-9]{13,}$');
create unique index profiles_borrower_account_number_unique
  on public.profiles (borrower_account_number) where borrower_account_number is not null;

create or replace function private.borrower_number_prefix(given_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare normalized text; encoded text := ''; letter text;
begin
  normalized := left(regexp_replace(translate(upper(coalesce(given_name,'')),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ', 'AAAAAAEEEEIIIIOOOOOUUUUNC'), '[^A-Z]', '', 'g'), 5);
  for i in 1..length(normalized) loop
    letter := substr(normalized,i,1);
    encoded := encoded || lpad((ascii(letter)-64)::text,2,'0');
  end loop;
  return rpad(encoded,10,'0');
end $$;
revoke all on function private.borrower_number_prefix(text) from public, anon, authenticated;

create or replace function private.assign_borrower_account_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prefix text; suffix bigint;
begin
  -- This function is reachable only through the profile trigger. Existing
  -- profile policies govern callers; no direct API execution is granted.
  if TG_OP = 'UPDATE' and OLD.borrower_account_number is not null then
    if NEW.borrower_account_number is distinct from OLD.borrower_account_number then
      raise exception 'Borrower account numbers cannot be changed.' using errcode='42501';
    end if;
    return NEW;
  end if;
  if NEW.role::text <> 'user' then NEW.borrower_account_number := null; return NEW; end if;
  prefix := private.borrower_number_prefix(coalesce(nullif(btrim(NEW.first_name),''),split_part(btrim(NEW.name),' ',1)));
  -- ON CONFLICT locks one prefix row and increments atomically. Suffixes are
  -- never reused after a profile is deleted; values above 999 grow naturally.
  insert into private.borrower_number_counters(name_prefix,last_suffix) values(prefix,1)
    on conflict(name_prefix) do update
      set last_suffix = private.borrower_number_counters.last_suffix + 1
    returning last_suffix into suffix;
  NEW.borrower_account_number := prefix || lpad(suffix::text,greatest(3,length(suffix::text)),'0');
  return NEW;
end $$;
revoke all on function private.assign_borrower_account_number() from public, anon, authenticated;
create trigger assign_borrower_account_number before insert or update of role,borrower_account_number
  on public.profiles for each row execute function private.assign_borrower_account_number();

-- Backfill only this new display field in deterministic profile order.
do $$ declare row_id uuid; begin
  for row_id in select id from public.profiles where role::text='user' and borrower_account_number is null order by created_at,id loop
    update public.profiles set borrower_account_number=null where id=row_id;
  end loop;
end $$;
comment on column public.profiles.borrower_account_number is 'Permanent numeric borrower reference: encoded first five given-name letters, zero-padded to 10 digits, followed by a unique prefix suffix of at least three digits.';
notify pgrst, 'reload schema';


-- 20261016090000_borrower_profile_updates.sql
-- Profile edits share the existing preferences row. Publish only that row's
-- changes; clients then fetch their own profile without reloading the ledger.

do $migration$
begin
  if to_regclass('public.borrower_preferences') is not null and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'borrower_preferences'
  ) then
    alter publication supabase_realtime add table public.borrower_preferences;
  end if;
end $migration$;


-- 20261016091000_session_check_initplan.sql
-- The session does not vary between rows in a statement. A scalar subquery
-- lets PostgreSQL check it once while preserving the restrictive policy.

do $migration$
declare p record;
begin
  for p in select schemaname,tablename,policyname,qual,with_check
           from pg_policies where policyname='mobile_valid_session'
             and schemaname in ('public','storage')
  loop
    if p.qual='mobile_private.valid_session()'
       and (p.with_check is null or p.with_check='mobile_private.valid_session()') then
      execute format('alter policy %I on %I.%I using ((select mobile_private.valid_session()))%s',
        p.policyname,p.schemaname,p.tablename,
        case when p.with_check is not null then ' with check ((select mobile_private.valid_session()))' else '' end);
    elsif p.qual not like '%SELECT mobile_private.valid_session()%' then
      raise exception 'Unexpected session policy expression on %.%',p.schemaname,p.tablename;
    end if;
  end loop;
end $migration$;


-- 20261016133725_login_access_lockout.sql
-- Local staging bootstrap. Counters are private, durable and never client-writable.

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


-- 20261016143643_notification_rules_and_delivery.sql

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
insert into mobile_private.notification_rule_state(key,value) values('defaults-v1','installed') on conflict(key) do nothing;
-- Generated from the audited local staging function definitions.
-- Only notification event context is added; existing transaction decisions are preserved.

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
 RETURNS public.loan_disbursements
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


-- 20261016205239_release_access.sql
-- Server-owned release assignments. No changes to Auth, roles or financial data.

create table mobile_private.release_settings (
  id smallint primary key default 1 check (id=1),
  rollout_enabled boolean not null default false,
  default_interface text not null default 'classic' check (default_interface in ('classic','new')),
  version integer not null default 1 check (version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table mobile_private.release_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interface text not null check (interface in ('classic','new')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table mobile_private.release_history (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('settings','assign')),
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table mobile_private.release_settings enable row level security;
alter table mobile_private.release_assignments enable row level security;
alter table mobile_private.release_history enable row level security;
revoke all on mobile_private.release_settings,mobile_private.release_assignments,mobile_private.release_history from public,anon,authenticated;
revoke all on sequence mobile_private.release_history_id_seq from public,anon,authenticated;
-- A production migration starts paused. Local bootstrap is intentionally separate.
insert into mobile_private.release_settings(id) values(1);


-- 20261016230322_notification_categories.sql

create table public.notification_categories (
 value text primary key check(value ~ '^[a-z][a-z0-9-]{1,39}$'),
 label text not null check(length(trim(label)) between 2 and 60),
 filipino_label text not null default '' check(length(filipino_label)<=60),
 icon text not null default 'bell' check(icon in ('bell','wallet','file','users','alert','mail','check','clock')),
 color text not null default 'slate' check(color in ('slate','blue','emerald','violet','amber','rose')),
 version integer not null default 1,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null
);
insert into public.notification_categories(value,label,filipino_label,icon,color) values
 ('payment','Payment','Bayad','wallet','emerald'),('document','Document','Dokumento','file','blue'),
 ('account','Account','Account','users','violet'),('general','General','Pangkalahatan','alert','slate'),
 ('promo','Promotion','Alok','bell','amber'),('feature','Feature update','Bagong feature','bell','blue');
alter table public.notification_categories enable row level security;
revoke all on public.notification_categories from public,anon,authenticated;
grant select on public.notification_categories to authenticated;
create policy notification_category_read on public.notification_categories for select to authenticated using(true);
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notification_templates drop constraint if exists notification_templates_category_check;
alter table public.notifications add constraint notifications_category_reference foreign key(category) references public.notification_categories(value);
alter table public.notification_templates add constraint notification_templates_category_reference foreign key(category) references public.notification_categories(value);
-- Soft deletion preserves references, old labels, read state and existing rules.
create index if not exists notifications_category_idx on public.notifications(category);
create index if not exists notification_templates_category_idx on public.notification_templates(category);


-- 20261017002202_optimize_portfolio_read_policies.sql

-- These identity checks are constant for a statement. InitPlans evaluate them
-- once, preserving every existing owner/admin condition and restrictive guard.
alter policy "profiles: read own or admin" on public.profiles
 using (id=(select auth.uid()) or (select public.is_admin()));
alter policy "loans: read own or admin" on public.loans
 using (user_id=(select auth.uid()) or (select public.is_admin()));
alter policy "loans: admin write" on public.loans
 using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "transactions: read own active or admin" on public.transactions
 using ((user_id=(select auth.uid()) and archived_at is null) or (select public.is_admin()));
alter policy "transactions: admin write" on public.transactions
 using ((select public.is_admin())) with check ((select public.is_admin()));


-- 20261017134229_release_runtime_hardening.sql
-- Additive release preparation. No borrower enrollments or credential changes.

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


-- 20261017142819_proof_submission_timestamp.sql
-- Preserve the legacy date column and its Classic readers. Do not invent times
-- for historical submissions; only future inserts receive a server timestamp.

alter table public.payments add column submitted_at_exact timestamptz;
create function public.set_payment_submitted_time() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then NEW.submitted_at_exact=clock_timestamp();
  else NEW.submitted_at_exact=OLD.submitted_at_exact;
  end if;
  return NEW;
end $$;
revoke all on function public.set_payment_submitted_time() from public,anon,authenticated;
create trigger payment_submission_time before insert or update on public.payments
for each row execute function public.set_payment_submitted_time();
notify pgrst,'reload schema';


-- 20261017145342_login_gate_compatibility.sql
-- The public Vercel sign-in gate counts failed attempts on every plan.
-- Configure this standard Custom Access Token hook in Supabase before rollout;
-- it also blocks fresh Classic/OTP sign-ins for a locked account. Refreshing an
-- existing session remains allowed, preserving unsubmitted payment work.

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


-- 20261017215448_restrict_classic_anonymous_rpcs.sql
-- These Classic RPCs are used after sign-in. Their authenticated and service
-- access is retained; anonymous callers must not execute privileged functions.

do $$declare routine record;begin
 for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('acknowledge_loan_disbursement','activate_my_account','create_invoice','create_loan_disbursement','is_admin','update_loan_request_status','update_my_profile') loop
  execute format('revoke execute on function %s from public,anon',routine.signature);
  execute format('grant execute on function %s to authenticated,service_role',routine.signature);
 end loop;
end $$;
notify pgrst,'reload schema';


-- 20261018023949_reviewed_payment_posting.sql
-- Additive accounting. Historical proofs/logs are never inferred or backfilled.
-- Rollback keeps posted records and uses a compatible Classic reader; do not
-- remove these columns/tables after any real posting has been committed.

alter type public.audit_action add value if not exists 'PAYMENT_REVERSED';
alter table public.transactions add column amount_applied numeric(12,2) not null default 0
 check(amount_applied>=0 and(amount_applied=0 or amount_applied<=amount));
alter table public.profiles add column credit_balance numeric(12,2) not null default 0 check(credit_balance>=0);
alter table public.payments add column posted_at timestamptz;
alter table public.payments add column posted_allocations jsonb;

create table public.payment_postings(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete restrict,
 payment_id uuid unique references public.payments(id) on delete restrict,
 reversal_of uuid unique references public.payment_postings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 operation_key uuid not null,
 cash_amount numeric(12,2) not null check(cash_amount>=0),
 credit_used numeric(12,2) not null check(credit_used>=0),
 credit_added numeric(12,2) not null check(credit_added>=0),
 allocated_amount numeric(12,2) not null check(allocated_amount>=0),
 effective_date date not null,
 note text not null default '',
 log_id uuid not null unique references public.payment_logs(id) deferrable initially deferred,
 created_at timestamptz not null default clock_timestamp(),
 check(cash_amount+credit_used>0),
 check(cash_amount+credit_used=allocated_amount+credit_added),
 check(not(credit_used>0 and credit_added>0)),
 unique(actor_id,operation_key)
);
create index payment_postings_user on public.payment_postings(user_id,created_at);
create table public.payment_allocations(
 posting_id uuid not null references public.payment_postings(id) on delete restrict,
 transaction_id text not null references public.transactions(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),
 before_balance numeric(12,2) not null check(before_balance>=amount),
 primary key(posting_id,transaction_id)
);
create index payment_allocations_transaction on public.payment_allocations(transaction_id);
alter table public.payment_logs add column source_posting_id uuid unique references public.payment_postings(id) on delete restrict;

alter table public.payment_postings enable row level security;
alter table public.payment_allocations enable row level security;
revoke all on public.payment_postings,public.payment_allocations from public,anon,authenticated;
grant select on public.payment_postings,public.payment_allocations to authenticated;
create policy own_postings on public.payment_postings for select to authenticated using(
 mobile_private.valid_session() and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')
 and(user_id=(select auth.uid()) or public.is_admin())
);
create policy own_allocations on public.payment_allocations for select to authenticated using(
 mobile_private.valid_session() and exists(select 1 from public.profiles where id=(select auth.uid()) and status='active')
 and(user_id=(select auth.uid()) or public.is_admin())
);

create function mobile_private.money_value(value text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
begin
 if value is null or value!~'^[0-9]{1,10}(\.[0-9]{1,2})?$' or value::numeric>9999999999.99 then
  raise exception 'Use a valid amount with at most two decimal centavo places.';
 end if;return value::numeric;
end $$;
revoke all on function mobile_private.money_value(text) from public,anon,authenticated;

create function mobile_private.protect_accounting_record() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Posted accounting records are immutable. Use a reviewed reversal.';end $$;
revoke all on function mobile_private.protect_accounting_record() from public,anon,authenticated;
create trigger immutable_payment_posting before update or delete on public.payment_postings for each row execute function mobile_private.protect_accounting_record();
create trigger immutable_payment_allocation before update or delete on public.payment_allocations for each row execute function mobile_private.protect_accounting_record();

create function mobile_private.protect_accounting_fields() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('postgres','supabase_admin') then
  if TG_OP='DELETE' then return OLD;end if;return NEW;
 end if;
 if TG_TABLE_NAME='transactions' then
  if TG_OP='INSERT' and NEW.amount_applied<>0 then raise exception 'Applied funds are managed by reviewed postings.';end if;
  if TG_OP='UPDATE' and(NEW.amount_applied<>OLD.amount_applied or(OLD.amount_applied>0 and(NEW.amount<>OLD.amount or NEW.status<>OLD.status or NEW.user_id<>OLD.user_id or NEW.loan_id<>OLD.loan_id or NEW.date_paid is distinct from OLD.date_paid or(OLD.status in ('unpaid','past_due') and NEW.archived_at is not null)))) then
   raise exception 'Allocated dues require a reviewed reversal before changing their financial details.';
  end if;
 elsif TG_TABLE_NAME='profiles' then
  if TG_OP='INSERT' and NEW.credit_balance<>0 or TG_OP='UPDATE' and NEW.credit_balance<>OLD.credit_balance then raise exception 'Account credit is managed by reviewed postings.';end if;
 elsif TG_TABLE_NAME='payments' then
  if TG_OP='DELETE' then
   if OLD.posted_at is not null then raise exception 'Posted proofs cannot be deleted.';end if;return OLD;
  end if;
  if NEW.status='approved' and(TG_OP='INSERT' or OLD.status<>'approved') then raise exception 'Review the allocation and post this payment before approving it.';end if;
  if TG_OP='UPDATE' and OLD.posted_at is not null then raise exception 'A posted proof requires a reviewed reversal.';end if;
  if NEW.posted_at is not null or NEW.posted_allocations is not null then raise exception 'Posting details are managed by the server.';end if;
 elsif TG_TABLE_NAME='payment_logs' then
  if TG_OP='DELETE' and OLD.source_posting_id is not null then raise exception 'Posted payment history cannot be deleted.';end if;
  if TG_OP='UPDATE' and(OLD.source_posting_id is not null or NEW.source_posting_id is not null) or TG_OP='INSERT' and NEW.source_posting_id is not null then raise exception 'Posted payment history is managed by reviewed postings.';end if;
 end if;
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end $$;
revoke all on function mobile_private.protect_accounting_fields() from public,anon,authenticated;
create trigger protect_applied_funds before insert or update on public.transactions for each row execute function mobile_private.protect_accounting_fields();
create trigger protect_credit_balance before insert or update on public.profiles for each row execute function mobile_private.protect_accounting_fields();
create trigger protect_posted_proof before insert or update or delete on public.payments for each row execute function mobile_private.protect_accounting_fields();
create trigger protect_posted_history before insert or update or delete on public.payment_logs for each row execute function mobile_private.protect_accounting_fields();

create function mobile_private.post_reviewed_payment(p_payload jsonb,p_credit_only boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 proof public.payments;borrower uuid;credit_before numeric;cash numeric;used numeric;expected_credit numeric;added numeric;
 total numeric:=0;selected_due numeric:=0;balance numeric;value numeric;expected numeric;
 items jsonb:=p_payload->'allocations';item jsonb;ids text[];due public.transactions;
 posting uuid:=gen_random_uuid();log_key uuid:=gen_random_uuid();effective date;method public.pay_log_method;result jsonb;
 action_name text:=case when p_credit_only then 'credit-apply' else 'payment-review' end;
begin
 if not public.is_admin() then raise exception 'Only an active lender can post payments.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb then raise exception 'Review and confirm the allocation before posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>action_name or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;
  return prior.result;
 end if;
 if p_credit_only then
  borrower:=(p_payload->>'userId')::uuid;cash:=0;effective:=(p_payload->>'paidDate')::date;method:='Manual Credit';
 else
  select * into proof from public.payments where id=(p_payload->>'id')::uuid;
  if not found then raise exception 'Payment proof unavailable.';end if;
  borrower:=proof.user_id;cash:=proof.amount;effective:=proof.paid_date;
  method:=(case proof.method::text when 'Cash Deposit' then 'Cash' else proof.method::text end)::public.pay_log_method;
 end if;
 if effective is null or effective>(now() at time zone 'Asia/Manila')::date then raise exception 'Choose a valid payment date that is not in the future.';end if;
 perform pg_advisory_xact_lock(hashtextextended(borrower::text,53));
 select credit_balance into credit_before from public.profiles where id=borrower and role='user' for update;
 if not found then raise exception 'Choose a borrower account.';end if;
 if not p_credit_only then
  select * into proof from public.payments where id=proof.id for update;
  if proof.user_id<>borrower or proof.status<>'pending' or proof.retracted_at is not null or proof.posted_at is not null or exists(select 1 from public.payment_postings where payment_id=proof.id) then
   raise exception 'This proof changed, is withdrawn, or has already been reviewed. Refresh before retrying.';
  end if;
 end if;
 used:=mobile_private.money_value(p_payload->>'creditUsed');expected_credit:=mobile_private.money_value(p_payload->>'expectedCredit');
 if expected_credit<>credit_before then raise exception 'Available credit changed. Refresh and review the allocation again.';end if;
 if used>credit_before then raise exception 'The available credit is insufficient.';end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>100 then raise exception 'Choose up to 100 allocation items.';end if;
 select array_agg(x->>'id') into ids from jsonb_array_elements(items) x;
 if exists(select 1 from jsonb_array_elements(items) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate allocation items are not allowed.';end if;
 perform 1 from public.transactions where id=any(ids) order by id for update;
 for item in select * from jsonb_array_elements(items) loop
  select * into due from public.transactions where id=item->>'id';
  if not found or due.user_id<>borrower or due.archived_at is not null or due.status not in ('unpaid','past_due') then raise exception 'An allocation refers to an unavailable borrower due.';end if;
  value:=mobile_private.money_value(item->>'amount');expected:=mobile_private.money_value(item->>'expectedBalance');balance:=due.amount-due.amount_applied;
  if expected<>balance then raise exception 'An outstanding due changed. Refresh and review the allocation again.';end if;
  if value<=0 or value>balance then raise exception 'Each allocation must be positive and within its outstanding due.';end if;
  total:=total+value;selected_due:=selected_due+balance;
 end loop;
 if cash+used<=0 or used<>greatest(total-cash,0) then raise exception 'Explicitly choose only the prior credit needed to fund these allocations.';end if;
 added:=greatest(cash-total,0);
 if credit_before-used+added>9999999999.99 then raise exception 'The resulting credit exceeds the supported amount limit.';end if;
 insert into public.payment_postings(id,user_id,payment_id,actor_id,operation_key,cash_amount,credit_used,credit_added,allocated_amount,effective_date,note,log_id)
 values(posting,borrower,case when p_credit_only then null else proof.id end,actor,op,cash,used,added,total,effective,left(coalesce(p_payload->>'note',''),2000),log_key);
 for item in select * from jsonb_array_elements(items) loop
  select * into due from public.transactions where id=item->>'id';value:=mobile_private.money_value(item->>'amount');
  insert into public.payment_allocations(posting_id,transaction_id,user_id,amount,before_balance) values(posting,due.id,borrower,value,due.amount-due.amount_applied);
  update public.transactions set amount_applied=amount_applied+value,
   status=case when amount_applied+value=amount then 'paid'::public.txn_status else status end,
   date_paid=case when amount_applied+value=amount then (select max(p.effective_date) from public.payment_allocations a join public.payment_postings p on p.id=a.posting_id where a.transaction_id=due.id and p.reversal_of is null and not exists(select 1 from public.payment_postings r where r.reversal_of=p.id)) else null end
   where id=due.id;
 end loop;
 update public.profiles set credit_balance=credit_before-used+added where id=borrower;
 insert into public.payment_logs(id,user_id,kind,txn_date,reference,subject,amount_owed,method,funds_applied,remaining_balance,alloc_status,carry_applied,note,source_posting_id)
 values(log_key,borrower,'payment',effective,case when p_credit_only then 'CREDIT-'||posting::text else proof.reference end,
  case when p_credit_only then 'Available account credit applied' else 'Reviewed payment posted' end,selected_due,method,cash+used,added-(selected_due-total),
  (case when selected_due>total then 'Underpayment' when added>0 then 'Overpayment' when p_credit_only then 'Credited' else 'Settled' end)::public.pay_log_alloc,
  used,left(coalesce(p_payload->>'note',''),2000),posting);
 if not p_credit_only then
  update public.payments set status='approved',note=left(coalesce(p_payload->>'note',''),2000),reviewed_at=(now() at time zone 'Asia/Manila')::date,posted_at=clock_timestamp(),
   posted_allocations=(select coalesce(jsonb_agg(jsonb_build_object('id',a.transaction_id,'description',t.description,'dueDate',t.due_date,'amount',a.amount,'remainingAmount',t.amount-t.amount_applied) order by t.due_date,t.id),'[]'::jsonb) from public.payment_allocations a join public.transactions t on t.id=a.transaction_id where a.posting_id=posting)
   where id=proof.id returning * into proof;
 end if;
 perform set_config('app.notification_event',jsonb_build_object('event_type',case when p_credit_only then 'payment.recorded' else 'payment.proof_approved' end,'payload',jsonb_build_object('amount',cash,'funds_applied',total,'remaining_balance',selected_due-total,'status','approved','source_id',coalesce(proof.id,posting),'reference',proof.reference))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by)
 values('payment',case when p_credit_only then 'Account credit applied' else 'Payment approved and posted' end,
  'Applied PHP '||to_char(total,'FM9999999990.00')||' to reviewed dues. Remaining on these dues: PHP '||to_char(selected_due-total,'FM9999999990.00')||'. Available credit: PHP '||to_char(credit_before-used+added,'FM9999999990.00')||'.','targeted',array[borrower],actor);
 insert into public.audit_log(actor,action,detail) select name,'PAYMENT_APPROVED','Reviewed posting '||posting::text||': allocated PHP '||total::text||'; credit change PHP '||(added-used)::text from public.profiles where id=actor;
 result:=case when p_credit_only then jsonb_build_object('saved',true) else to_jsonb(proof) end||jsonb_build_object('posting_id',posting,'allocated_amount',total,'credit_used',used,'credit_added',added,'credit_balance',credit_before-used+added);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,action_name,md5(p_payload::text),result);
 return result;
end $$;
revoke all on function mobile_private.post_reviewed_payment(jsonb,boolean) from public,anon;
grant execute on function mobile_private.post_reviewed_payment(jsonb,boolean) to authenticated;

alter function mobile_private.review_proof(jsonb) rename to review_proof_before_posting;
revoke all on function mobile_private.review_proof_before_posting(jsonb) from public,anon,authenticated;
create function mobile_private.review_proof(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_payload->>'status'='approved' then return mobile_private.post_reviewed_payment(p_payload,false);end if;
 if exists(select 1 from public.payment_postings where payment_id=(p_payload->>'id')::uuid) then raise exception 'Posted proofs require a reviewed reversal.';end if;
 return mobile_private.review_proof_before_posting(p_payload);
end $$;
revoke all on function mobile_private.review_proof(jsonb) from public,anon;
grant execute on function mobile_private.review_proof(jsonb) to authenticated;

-- Reversal is an appended counter-entry. It is not a refund or a deletion.
create function mobile_private.reverse_reviewed_payment(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 original public.payment_postings;credit_before numeric;credit_after numeric;expected numeric;
 entry uuid:=gen_random_uuid();log_key uuid:=gen_random_uuid();item record;reason text:=btrim(coalesce(p_payload->>'reason',''));
 result jsonb;today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if not public.is_admin() then raise exception 'Only an active lender can reverse payments.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Review the reversal and enter a reason of 10 to 2000 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'payment-reverse' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 select * into original from public.payment_postings where id=(p_payload->>'id')::uuid and reversal_of is null;
 if not found then raise exception 'Choose an original payment posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(original.user_id::text,53));
 select credit_balance into credit_before from public.profiles where id=original.user_id for update;
 if exists(select 1 from public.payment_postings where reversal_of=original.id) then raise exception 'This posting has already been reversed.';end if;
 expected:=mobile_private.money_value(p_payload->>'expectedCredit');
 if expected<>credit_before then raise exception 'Available credit changed. Refresh and review the reversal again.';end if;
 if credit_before<original.credit_added then raise exception 'The surplus credit was already used. Reverse its later credit applications first.';end if;
 credit_after:=credit_before+original.credit_used-original.credit_added;
 if credit_after>9999999999.99 then raise exception 'The resulting credit exceeds the supported amount limit.';end if;
 perform 1 from public.transactions where id in(select transaction_id from public.payment_allocations where posting_id=original.id) order by id for update;
 insert into public.payment_postings(id,user_id,reversal_of,actor_id,operation_key,cash_amount,credit_used,credit_added,allocated_amount,effective_date,note,log_id)
 values(entry,original.user_id,original.id,actor,op,original.cash_amount,original.credit_used,original.credit_added,original.allocated_amount,today,reason,log_key);
 for item in select a.transaction_id,a.amount allocation_amount,t.amount original_amount,t.amount_applied from public.payment_allocations a join public.transactions t on t.id=a.transaction_id where a.posting_id=original.id loop
  if item.amount_applied<item.allocation_amount then raise exception 'An allocated due changed. Review the accounting history before reversing.';end if;
  insert into public.payment_allocations(posting_id,transaction_id,user_id,amount,before_balance) values(entry,item.transaction_id,original.user_id,item.allocation_amount,item.original_amount-item.amount_applied+item.allocation_amount);
  update public.transactions set amount_applied=amount_applied-item.allocation_amount,
   status=case when due_date<today then 'past_due'::public.txn_status else 'unpaid'::public.txn_status end,date_paid=null where id=item.transaction_id;
 end loop;
 update public.profiles set credit_balance=credit_after where id=original.user_id;
 insert into public.payment_logs(id,user_id,kind,txn_date,reference,subject,amount_owed,method,funds_applied,remaining_balance,alloc_status,carry_applied,note,source_posting_id)
 values(log_key,original.user_id,'payment',today,'REV-'||original.id::text,'Payment posting reversed',0,'Manual Credit',-(original.cash_amount+original.credit_used),0,'Credited',-original.credit_used,reason,entry);
 if original.payment_id is not null then update public.payments set status='rejected',note='Posting reversed: '||reason,reviewed_at=today where id=original.payment_id;end if;
 perform set_config('app.notification_event',jsonb_build_object('event_type','payment.proof_rejected','payload',jsonb_build_object('source_id',coalesce(original.payment_id,original.id),'status','reversed','reason',reason,'amount',original.cash_amount))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('payment','Payment posting reversed','A lender reversed the posting. Reason: '||reason||'. Dues and account credit have been updated.','targeted',array[original.user_id],actor);
 insert into public.audit_log(actor,action,detail) select name,'PAYMENT_REVERSED','Reversal '||entry::text||' of '||original.id::text||': '||reason from public.profiles where id=actor;
 result:=jsonb_build_object('saved',true,'posting_id',entry,'reversal_of',original.id,'credit_balance',credit_after);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'payment-reverse',md5(p_payload::text),result);return result;
end $$;
revoke all on function mobile_private.reverse_reviewed_payment(jsonb) from public,anon;
grant execute on function mobile_private.reverse_reviewed_payment(jsonb) to authenticated;
create policy keep_posted_proof_file on storage.objects as restrictive for delete to authenticated using(
 bucket_id<>'payment-proofs' or not exists(select 1 from public.payments p where p.file_path=storage.objects.name and p.posted_at is not null)
);
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select case
 when p_action='statement-create' then mobile_private.statement(p_payload)
 when p_action='statement-delete' then mobile_private.delete_statement(p_payload)
 when p_action='payment-review' then mobile_private.review_proof(p_payload)
 when p_action='credit-apply' then mobile_private.post_reviewed_payment(p_payload,true)
 when p_action='payment-reverse' then mobile_private.reverse_reviewed_payment(p_payload)
 else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';


-- 20261018120945_accounting_lookup_index.sql
-- New accounting table: ownership reads and FK checks share this index.

create index payment_allocations_user on public.payment_allocations(user_id,posting_id);


-- 20261018131233_legacy_session_boundaries.sql
-- Classic and New UI must both reject an access token whose Auth session ended.
-- Keep existing ownership policies; add a restrictive boundary alongside them.


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


-- 20261018184226_payment_proof_five_mb.sql
-- Limit future uploads and submissions; existing proof downloads are unchanged.
update storage.buckets set file_size_limit=5242880 where id='payment-proofs';

create or replace function mobile_private.check_file(p_bucket text,p_path text,p_mimes text[],p_limit integer)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=mobile_private.active_user();v_meta jsonb;
begin
 if p_bucket='payment-proofs' then p_limit:=least(coalesce(p_limit,5242880),5242880);end if;
 if p_path is null or split_part(p_path,'/',1)<>v_uid::text then raise exception 'File ownership mismatch.';end if;
 select metadata into v_meta from storage.objects o
 join mobile_private.verified_uploads v on v.object_id=o.id and v.owner_id=v_uid and v.updated_at=o.updated_at
 and v.mime=o.metadata->>'mimetype' and v.size=(o.metadata->>'size')::bigint
 where o.bucket_id=p_bucket and o.name=p_path;
 if v_meta is null or not coalesce(v_meta->>'mimetype','')=any(p_mimes)
 or coalesce((v_meta->>'size')::bigint,0)<=0 or (v_meta->>'size')::bigint>p_limit then
  if p_bucket='payment-proofs' then raise exception 'Upload and validate a supported proof within 5 MB.';end if;
  raise exception 'Upload and validate a supported file within the size limit.';
 end if;
end $$;

-- 20261018201527_monthly_fee_assessment.sql
-- Reviewed monthly assessments: positive borrower dues, not cash collections.
create table public.fee_assessments(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 operation_key uuid not null,
 source_due_date date not null,
 assessment_month date not null check(extract(day from assessment_month)=1),
 charge_due_date date not null check(charge_due_date>=source_due_date),
 finance_enabled boolean not null,
 finance_rate numeric(5,2) not null check(finance_rate between 0 and 100),
 late_enabled boolean not null,
 base_amount numeric(12,2) not null check(base_amount>0),
 finance_amount numeric(12,2) not null check(finance_amount>=0),
 late_amount numeric(12,2) not null check(late_amount>=0),
 total_amount numeric(12,2) not null check(total_amount>0 and total_amount=finance_amount+late_amount),
 source_rows jsonb not null check(jsonb_typeof(source_rows)='array'),
 source_count integer generated always as (jsonb_array_length(source_rows)) stored,
 created_at timestamptz not null default clock_timestamp(),
 voided_at timestamptz,
 voided_by uuid references public.profiles(id) on delete restrict,
 void_reason text,
 check((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(trim(void_reason)) between 10 and 2000)),
 unique(actor_id,operation_key)
);
create unique index fee_assessment_monthly_once on public.fee_assessments(user_id,source_due_date,assessment_month) where voided_at is null;
create index fee_assessments_user_created on public.fee_assessments(user_id,created_at desc);
alter table public.transactions add column fee_assessment_id uuid references public.fee_assessments(id) on delete restrict;
alter table public.transactions add column fee_kind text check(fee_kind in ('finance_charge','late_fee'));
alter table public.transactions add constraint assessed_fee_pair check((fee_assessment_id is null)=(fee_kind is null));
create unique index assessed_fee_kind on public.transactions(fee_assessment_id,fee_kind) where fee_assessment_id is not null;
create index transactions_fee_assessment_owner on public.transactions(user_id,fee_assessment_id) where fee_assessment_id is not null;
create index fee_eligible_dues on public.transactions(user_id,due_date,id) where status in ('unpaid','past_due') and archived_at is null and amount>0;
alter table public.fee_assessments enable row level security;
revoke all on public.fee_assessments from public,anon,authenticated;
grant select on public.fee_assessments to authenticated;
create policy fee_assessment_read on public.fee_assessments for select to authenticated using(
 exists(select 1 from public.profiles where id=(select auth.uid()) and status='active') and (user_id=(select auth.uid()) or public.is_admin()));
create policy mobile_live_session on public.fee_assessments as restrictive for all to authenticated using(mobile_private.valid_session()) with check(mobile_private.valid_session());

create function mobile_private.protect_fee_assessment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_TABLE_NAME='fee_assessments' then
  if TG_OP='UPDATE' and current_user in ('postgres','supabase_admin') and OLD.voided_at is null and NEW.voided_at is not null
   and (to_jsonb(NEW)-array['voided_at','voided_by','void_reason','source_count'])=(to_jsonb(OLD)-array['voided_at','voided_by','void_reason','source_count']) then return NEW;end if;
  raise exception 'Fee assessments retain their history. Void an unpaid assessment with a reason.';
 end if;
 if TG_OP='INSERT' then
  if NEW.fee_assessment_id is not null and current_user not in ('postgres','supabase_admin') then raise exception 'Use the reviewed fee calculator to post assessed fees.';end if;
  return NEW;
 end if;
 if OLD.fee_assessment_id is null and (TG_OP='DELETE' or NEW.fee_assessment_id is null) then
  if TG_OP='DELETE' then return OLD;end if;return NEW;
 end if;
 if TG_OP='DELETE' then raise exception 'Assessed fees retain their history. Use the fee manager to void an unpaid assessment.';end if;
 if current_user not in ('postgres','supabase_admin') then raise exception 'Use payment review to settle assessed fees or the fee manager to void them.';end if;
 return NEW;
end $$;
revoke all on function mobile_private.protect_fee_assessment() from public,anon,authenticated;
create trigger protect_fee_assessment before update or delete on public.fee_assessments for each row execute function mobile_private.protect_fee_assessment();
create trigger protect_fee_transaction before insert or update or delete on public.transactions for each row execute function mobile_private.protect_fee_assessment();

create function mobile_private.assess_fees(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 borrower uuid:=(p_payload->>'borrowerId')::uuid;source_date date;charge_date date;
 today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;cycle date;rate numeric:=0;late numeric:=0;finance numeric:=0;base numeric:=0;
 finance_on boolean;late_on boolean;items jsonb:=p_payload->'selections';item jsonb;ids text[];due public.transactions;balance numeric;snapshots jsonb:='[]';
 assessment uuid:=gen_random_uuid();result jsonb;entry text;source_label text;rate_label text;borrower_role text;
begin
 if not public.is_admin() then raise exception 'Only an active lender can assess fees.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb then raise exception 'Review and confirm the charges before posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'fee-assess' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 if coalesce(p_payload->>'sourceDueDate','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(p_payload->>'chargeDueDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose valid source and new charge due dates.';end if;
 source_date:=(p_payload->>'sourceDueDate')::date;charge_date:=(p_payload->>'chargeDueDate')::date;
 if charge_date<source_date then raise exception 'The new charge due date cannot be before its source due date.';end if;
 cycle:=date_trunc('month',today)::date;
 if p_payload->>'assessmentMonth' is distinct from to_char(cycle,'YYYY-MM-DD') then raise exception 'The assessment month changed. Refresh and review the charges again.';end if;
 if p_payload->'financeEnabled' not in ('true'::jsonb,'false'::jsonb) or p_payload->'lateEnabled' not in ('true'::jsonb,'false'::jsonb)
  or p_payload->'financeEnabled' is null or p_payload->'lateEnabled' is null then raise exception 'Choose which fee components to apply.';end if;
 finance_on:=(p_payload->>'financeEnabled')::boolean;late_on:=(p_payload->>'lateEnabled')::boolean;
 if finance_on then rate:=mobile_private.money_value(p_payload->>'rate');if rate>100 then raise exception 'Finance charge rate must be between 0 and 100 percent.';end if;end if;
 if late_on then late:=mobile_private.money_value(p_payload->>'lateAmount');end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 1000 then raise exception 'Choose between 1 and 1000 available borrower transactions.';end if;
 select role::text into borrower_role from public.profiles where id=borrower and status='active' for update;
 if not found or borrower_role<>'user' then raise exception 'Choose an active borrower account.';end if;
 if exists(select 1 from public.fee_assessments where user_id=borrower and source_due_date=source_date and assessment_month=cycle and voided_at is null) then raise exception 'Fees were already assessed for this borrower and due date this month. Review the posted assessment.';end if;
 select array_agg(value->>'id' order by value->>'id') into ids from jsonb_array_elements(items);
 if array_length(ids,1)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Duplicate or unavailable selected transaction.';end if;
 perform 1 from public.transactions where id=any(ids) order by id for update;
 for item in select value from jsonb_array_elements(items) order by value->>'id' loop
  select * into due from public.transactions where id=item->>'id';
  if not found or due.user_id<>borrower or due.due_date<>source_date or due.archived_at is not null or due.status not in ('unpaid','past_due') or due.amount<=0 then raise exception 'A selected borrower transaction is unavailable. Refresh and review again.';end if;
  balance:=due.amount-due.amount_applied;
  if balance<=0 or balance<>mobile_private.money_value(item->>'expectedBalance') then raise exception 'A selected balance changed. Refresh and review again.';end if;
  base:=base+balance;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('id',due.id,'description',due.description,'dueDate',due.due_date,'originalAmount',due.amount,'paidAmount',due.amount_applied,'remainingAmount',balance,'feeKind',due.fee_kind));
 end loop;
 finance:=case when finance_on then round(base*rate/100,2) else 0 end;
 if base>9999999999.99 or finance+late>9999999999.99 or finance+late<=0 then raise exception 'Choose positive charges within the supported amount limit.';end if;
 insert into public.fee_assessments(id,user_id,actor_id,operation_key,source_due_date,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_rows)
 values(assessment,borrower,actor,op,source_date,cycle,charge_date,finance_on,rate,late_on,base,finance,late,finance+late,snapshots);
 source_label:=to_char(source_date,'Mon FMDD, YYYY');rate_label:=trim(trailing '.' from trim(trailing '0' from to_char(rate,'FM990.00')));
 if finance>0 then
  entry:='fee-'||assessment::text||'-finance';
  insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date,fee_assessment_id,fee_kind)
  values(entry,borrower,1,rate_label||'% Finance Charge for '||source_label||' (₱'||to_char(base,'FM999,999,999,990.00')||')',finance,'Straight',today,charge_date,assessment,'finance_charge');
 end if;
 if late>0 then
  entry:='fee-'||assessment::text||'-late';
  insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date,fee_assessment_id,fee_kind)
  values(entry,borrower,2,'Late Payment fee for '||source_label,late,'Straight',today,charge_date,assessment,'late_fee');
 end if;
 result:=jsonb_build_object('saved',true,'id',assessment,'base',base,'finance',finance,'late',late,'total',finance+late,'month',cycle,'dueDate',charge_date);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'fee-assess',md5(p_payload::text),result);return result;
end $$;
revoke all on function mobile_private.assess_fees(jsonb) from public,anon;
grant execute on function mobile_private.assess_fees(jsonb) to authenticated;

create function mobile_private.void_fee_assessment(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;record public.fee_assessments;reason text:=trim(coalesce(p_payload->>'reason',''));result jsonb;
begin
 if not public.is_admin() then raise exception 'Only an active lender can void fee assessments.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Confirm the cancellation and provide a reason of 10 to 2000 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then if prior.action<>'fee-void' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;end if;
 select * into record from public.fee_assessments where id=(p_payload->>'id')::uuid;
 if not found then raise exception 'Fee assessment unavailable.';end if;
 perform 1 from public.profiles where id=record.user_id for update;
 select * into record from public.fee_assessments where id=record.id for update;
 if record.voided_at is not null then raise exception 'This fee assessment has already been voided.';end if;
 perform 1 from public.transactions where fee_assessment_id=record.id order by id for update;
 if exists(select 1 from public.transactions where fee_assessment_id=record.id and (amount_applied>0 or status in ('paid','refunded')))
 then raise exception 'A payment was allocated to these fees. Reverse that payment before voiding the assessment.';end if;
 update public.transactions set status='cancelled',date_paid=null where fee_assessment_id=record.id;
 update public.fee_assessments set voided_at=clock_timestamp(),voided_by=actor,void_reason=reason where id=record.id;
 result:=jsonb_build_object('saved',true,'id',record.id,'voided',true);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'fee-void',md5(p_payload::text),result);return result;
end $$;
revoke all on function mobile_private.void_fee_assessment(jsonb) from public,anon;
grant execute on function mobile_private.void_fee_assessment(jsonb) to authenticated;
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select case
 when p_action='statement-create' then mobile_private.statement(p_payload)
 when p_action='statement-delete' then mobile_private.delete_statement(p_payload)
 when p_action='payment-review' then mobile_private.review_proof(p_payload)
 when p_action='credit-apply' then mobile_private.post_reviewed_payment(p_payload,true)
 when p_action='payment-reverse' then mobile_private.reverse_reviewed_payment(p_payload)
 when p_action='fee-assess' then mobile_private.assess_fees(p_payload)
 when p_action='fee-void' then mobile_private.void_fee_assessment(p_payload)
 else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';

-- 20261018223454_borrower_access_overrides.sql

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


-- 20261019000052_borrower_realtime_signals.sql

-- Publish only invalidation metadata. Clients re-read their RLS-scoped records;
-- message bodies and deleted-row payloads never travel on these signal tables.
do $$declare t text;begin
 foreach t in array array['message_change_signals','payment_due_change_signals'] loop
  execute format('create table public.%I (borrower_id uuid primary key references public.profiles(id) on update cascade on delete cascade, version bigint not null default 1, updated_at timestamptz not null default now())',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_or_lender on public.%I for select to authenticated using (mobile_private.valid_session() and (borrower_id=(select auth.uid()) or public.is_admin()))',t);
  execute format('create policy mobile_live_session on public.%I as restrictive to authenticated using (mobile_private.valid_session())',t);
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
create function mobile_private.signal_borrower_live_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare target text; owners uuid[]; owner_id uuid;
begin
 if tg_op='UPDATE' and new is not distinct from old then return new;end if;
 if tg_table_schema<>'public' or tg_table_name not in ('messages','payment_due_overrides') then raise exception 'Unsupported change source';end if;
 target=case when tg_table_name='messages' then 'message_change_signals' else 'payment_due_change_signals' end;
 if tg_op='INSERT' then owners=array[new.borrower_id];
 elsif tg_op='DELETE' then owners=array[old.borrower_id];
 else owners=array[old.borrower_id,new.borrower_id];end if;
 for owner_id in select distinct unnest(owners) loop
  -- Cascading profile deletion must not recreate a removed owner's signal.
  if exists(select 1 from public.profiles where id=owner_id) then
   execute format('insert into public.%I as s(borrower_id) values($1) on conflict(borrower_id) do update set version=s.version+1,updated_at=clock_timestamp()',target) using owner_id;
  end if;
 end loop;
 return null;
end $$;
revoke all on function mobile_private.signal_borrower_live_change() from public,anon,authenticated;
create trigger messages_live_signal after insert or update or delete on public.messages for each row execute function mobile_private.signal_borrower_live_change();
create trigger payment_due_live_signal after insert or update or delete on public.payment_due_overrides for each row execute function mobile_private.signal_borrower_live_change();


-- 20261019162523_admin_transaction_corrections.sql
-- Additive, audited admin corrections. Do not remove these records after use.
-- Rollback: deploy the prior UI and revoke execute on admin_correct_transaction;
-- retain corrections/releases so subsequent payment reversals remain correct.

create table public.transaction_corrections(
 id uuid primary key default gen_random_uuid(),
 transaction_id text not null references public.transactions(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 operation_key uuid not null,
 reason text not null check(length(reason) between 10 and 2000),
 before_row jsonb not null,after_row jsonb not null,
 credit_returned numeric(12,2) not null check(credit_returned>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,operation_key)
);
create table public.payment_allocation_releases(
 correction_id uuid not null references public.transaction_corrections(id) on delete restrict,
 posting_id uuid not null,
 transaction_id text not null,
 user_id uuid not null references public.profiles(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0),
 primary key(correction_id,posting_id,transaction_id),
 foreign key(posting_id,transaction_id) references public.payment_allocations(posting_id,transaction_id) on delete restrict
);
create index allocation_releases_posting on public.payment_allocation_releases(posting_id,transaction_id);
alter table public.transaction_corrections enable row level security;
alter table public.payment_allocation_releases enable row level security;
revoke all on public.transaction_corrections,public.payment_allocation_releases from public,anon,authenticated;
grant select on public.transaction_corrections,public.payment_allocation_releases to authenticated;
create policy corrections_admin_read on public.transaction_corrections for select to authenticated using(mobile_private.valid_session() and public.is_admin());
create policy releases_read on public.payment_allocation_releases for select to authenticated using(mobile_private.valid_session() and exists(select 1 from public.profiles where id=auth.uid() and status='active') and(user_id=auth.uid() or public.is_admin()));
create policy mobile_valid_session on public.transaction_corrections as restrictive for all to authenticated using(mobile_private.valid_session()) with check(mobile_private.valid_session());
create policy mobile_valid_session on public.payment_allocation_releases as restrictive for all to authenticated using(mobile_private.valid_session()) with check(mobile_private.valid_session());
create trigger immutable_transaction_correction before update or delete on public.transaction_corrections for each row execute function mobile_private.protect_accounting_record();
create trigger immutable_allocation_release before update or delete on public.payment_allocation_releases for each row execute function mobile_private.protect_accounting_record();
alter table public.payment_logs add column correction_id uuid unique references public.transaction_corrections(id) on delete restrict;
create function mobile_private.protect_correction_log() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if NEW.correction_id is not null and current_user not in ('postgres','supabase_admin') then raise exception 'Correction history is managed by reviewed admin edits.';end if;return NEW;
 end if;
 if OLD.correction_id is not null or (TG_OP='UPDATE' and NEW.correction_id is not null) then raise exception 'Correction history is immutable.';end if;
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end $$;
revoke all on function mobile_private.protect_correction_log() from public,anon,authenticated;
create trigger immutable_correction_log before insert or update or delete on public.payment_logs for each row execute function mobile_private.protect_correction_log();

create function public.admin_correct_transaction(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;
 reason text:=btrim(coalesce(p_payload->>'reason',''));patch jsonb:=p_payload->'patch';expected jsonb:=p_payload->'expected';
 oldrow public.transactions;newrow public.transactions;prior mobile_private.operation_keys;
 result jsonb;snapshot jsonb;correction uuid:=gen_random_uuid();entry record;lock_user uuid;
 retained numeric;returned numeric;left_to_release numeric;released numeric;credit numeric;history public.payment_logs;
 today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if not public.is_admin() then raise exception 'Only an active lender can override ledger entries.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Review the correction and enter a reason of 10 to 2,000 characters.';end if;
 if jsonb_typeof(patch) is distinct from 'object' or patch='{}'::jsonb then raise exception 'Choose a field to change.';end if;
 if exists(select 1 from jsonb_object_keys(patch) k where k not in ('userId','description','amount','type','txnDate','dueDate','datePaid','status')) then raise exception 'Unsupported transaction change.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'transaction-correct' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 select * into oldrow from public.transactions where id=p_payload->>'id';
 if not found then raise exception 'This transaction is unavailable. Refresh and retry.';end if;
 -- The same borrower lock/order used by posting/reversal prevents races with funds.
 for lock_user in select distinct id from public.profiles where id in(oldrow.user_id,coalesce((patch->>'userId')::uuid,oldrow.user_id)) order by id loop
  perform pg_advisory_xact_lock(hashtextextended(lock_user::text,53));
  perform 1 from public.profiles where id=lock_user for update;
 end loop;
 select * into oldrow from public.transactions where id=oldrow.id for update;
 snapshot:=jsonb_build_object('user_id',oldrow.user_id,'loan_id',oldrow.loan_id,'n',oldrow.n,'description',oldrow.description,'amount',oldrow.amount,'amount_applied',oldrow.amount_applied,'type',oldrow.type,'txn_date',oldrow.txn_date,'due_date',oldrow.due_date,'date_paid',oldrow.date_paid,'status',oldrow.status,'fee_assessment_id',oldrow.fee_assessment_id,'archived_at',oldrow.archived_at);
 if expected is distinct from snapshot or oldrow.archived_at is not null then raise exception 'This transaction changed. Refresh and review the correction again.' using errcode='40001';end if;
 newrow:=oldrow;
 if patch?'userId' then
  if not exists(select 1 from public.profiles where id=(patch->>'userId')::uuid and role='user') then raise exception 'Choose a borrower account.';end if;
  newrow.user_id:=(patch->>'userId')::uuid;
  if newrow.user_id<>oldrow.user_id then
   if oldrow.amount_applied>0 or exists(select 1 from public.payment_allocations a join public.payment_postings p on p.id=a.posting_id where a.transaction_id=oldrow.id and p.reversal_of is null and not exists(select 1 from public.payment_postings r where r.reversal_of=p.id)) then raise exception 'Reverse the reviewed payments before moving this transaction to another borrower.';end if;
   newrow.loan_id:=null;newrow.n:=1;
  end if;
 end if;
 if patch?'description' then newrow.description:=btrim(patch->>'description');if newrow.description is null or length(newrow.description) not between 1 and 2000 then raise exception 'Enter a description of 1 to 2,000 characters.';end if;end if;
 if patch?'amount' then
  if coalesce(patch->>'amount','')!~'^[+-]?[0-9]{1,10}(\.[0-9]{1,2})?$' or (patch->>'amount')::numeric=0 or abs((patch->>'amount')::numeric)>9999999999.99 then raise exception 'Enter a nonzero positive or negative amount with at most two decimal places.';end if;
  newrow.amount:=(patch->>'amount')::numeric;
 end if;
 if patch?'type' then if coalesce(patch->>'type','') not in ('Straight','Installment') then raise exception 'Choose Straight or Installment.';end if;newrow.type:=patch->>'type';end if;
 if patch?'status' then if coalesce(patch->>'status','') not in ('paid','unpaid','refunded','cancelled','past_due') then raise exception 'Choose a valid transaction status.';end if;newrow.status:=(patch->>'status')::public.txn_status;end if;
 if patch?'txnDate' then if coalesce(patch->>'txnDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid transaction date.';end if;newrow.txn_date:=(patch->>'txnDate')::date;end if;
 if patch?'dueDate' then if coalesce(patch->>'dueDate','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid due date.';end if;newrow.due_date:=(patch->>'dueDate')::date;end if;
 if patch?'datePaid' then
  if patch->>'datePaid' is not null and coalesce(patch->>'datePaid','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid paid date.';end if;
  newrow.date_paid:=(patch->>'datePaid')::date;
  if newrow.date_paid is not null and newrow.status in ('unpaid','past_due') then newrow.status:='paid';end if;
  if newrow.date_paid is null and newrow.status='paid' then newrow.status:='unpaid';end if;
 end if;
 -- Increasing a fully allocated due reopens its remainder unless explicitly settled.
 if patch?'amount' and not patch?'status' and oldrow.amount_applied>0 and newrow.amount>oldrow.amount_applied and newrow.status='paid' then newrow.status:='unpaid';end if;
 retained:=case when newrow.status in ('cancelled','refunded') then 0 else least(oldrow.amount_applied,greatest(newrow.amount,0)) end;
 returned:=oldrow.amount_applied-retained;newrow.amount_applied:=retained;
 if newrow.status='paid' and newrow.date_paid is null then newrow.date_paid:=today;end if;
 if newrow.status in ('unpaid','past_due','cancelled') then newrow.date_paid:=null;end if;
 select credit_balance into credit from public.profiles where id=oldrow.user_id;
 if credit+returned>9999999999.99 then raise exception 'The resulting account credit exceeds the supported amount limit.';end if;
 insert into public.transaction_corrections(id,transaction_id,user_id,actor_id,operation_key,reason,before_row,after_row,credit_returned)
 values(correction,oldrow.id,oldrow.user_id,actor,op,reason,to_jsonb(oldrow),to_jsonb(newrow),returned);
 left_to_release:=returned;
 -- Append release records. Original postings and allocation snapshots stay immutable.
 for entry in select a.posting_id,a.amount-coalesce((select sum(r.amount) from public.payment_allocation_releases r where r.posting_id=a.posting_id and r.transaction_id=a.transaction_id),0) available
  from public.payment_allocations a join public.payment_postings p on p.id=a.posting_id
  where a.transaction_id=oldrow.id and p.reversal_of is null and not exists(select 1 from public.payment_postings rev where rev.reversal_of=p.id) order by p.created_at desc,p.id desc loop
  exit when left_to_release=0;
  released:=least(left_to_release,entry.available);
  if released>0 then insert into public.payment_allocation_releases(correction_id,posting_id,transaction_id,user_id,amount) values(correction,entry.posting_id,oldrow.id,oldrow.user_id,released);left_to_release:=left_to_release-released;end if;
 end loop;
 if left_to_release<>0 then raise exception 'Applied funds do not match reviewed allocations. Reconcile the payment history before editing.';end if;
 update public.transactions set user_id=newrow.user_id,loan_id=newrow.loan_id,n=newrow.n,description=newrow.description,amount=newrow.amount,amount_applied=newrow.amount_applied,type=newrow.type,txn_date=newrow.txn_date,due_date=newrow.due_date,status=newrow.status,date_paid=newrow.date_paid where id=oldrow.id;
 if returned>0 then
  update public.profiles set credit_balance=credit+returned where id=oldrow.user_id;
  insert into public.payment_logs(user_id,kind,txn_date,reference,subject,amount_owed,method,funds_applied,remaining_balance,alloc_status,carry_applied,note,correction_id)
  values(oldrow.user_id,'payment',today,'COR-'||correction::text,'Account credit returned after transaction correction',0,'Manual Credit',0,returned,'Credited',0,reason||' — returned ₱'||returned::text||' from '||oldrow.description,correction) returning * into history;
 end if;
 insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED','Admin correction '||correction::text||' on '||oldrow.id||': '||reason||'. Credit returned PHP '||returned::text from public.profiles where id=actor;
 result:=jsonb_build_object('transaction',to_jsonb(newrow),'creditReturned',returned,'creditBalance',credit+returned,'creditUserId',oldrow.user_id,'correctionId',correction,'paymentLog',case when returned>0 then to_jsonb(history) else null end);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'transaction-correct',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function public.admin_correct_transaction(jsonb) from public,anon;
grant execute on function public.admin_correct_transaction(jsonb) to authenticated;
create or replace function mobile_private.reverse_reviewed_payment(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 original public.payment_postings;credit_before numeric;credit_after numeric;expected numeric;released_total numeric;
 entry uuid:=gen_random_uuid();log_key uuid:=gen_random_uuid();item record;reason text:=btrim(coalesce(p_payload->>'reason',''));
 result jsonb;today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if not public.is_admin() then raise exception 'Only an active lender can reverse payments.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Review the reversal and enter a reason of 10 to 2000 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'payment-reverse' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 select * into original from public.payment_postings where id=(p_payload->>'id')::uuid and reversal_of is null;
 if not found then raise exception 'Choose an original payment posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(original.user_id::text,53));
 select credit_balance into credit_before from public.profiles where id=original.user_id for update;
 if exists(select 1 from public.payment_postings where reversal_of=original.id) then raise exception 'This posting has already been reversed.';end if;
 expected:=mobile_private.money_value(p_payload->>'expectedCredit');
 if expected<>credit_before then raise exception 'Available credit changed. Refresh and review the reversal again.';end if;
 select coalesce(sum(amount),0) into released_total from public.payment_allocation_releases where posting_id=original.id;
 if credit_before<original.credit_added+released_total then raise exception 'The surplus credit was already used. Reverse its later credit applications first.';end if;
 credit_after:=credit_before+original.credit_used-original.credit_added-released_total;
 if credit_after>9999999999.99 then raise exception 'The resulting credit exceeds the supported amount limit.';end if;
 perform 1 from public.transactions where id in(select transaction_id from public.payment_allocations where posting_id=original.id) order by id for update;
 insert into public.payment_postings(id,user_id,reversal_of,actor_id,operation_key,cash_amount,credit_used,credit_added,allocated_amount,effective_date,note,log_id)
 values(entry,original.user_id,original.id,actor,op,original.cash_amount,original.credit_used,original.credit_added,original.allocated_amount,today,reason,log_key);
 for item in select a.transaction_id,a.amount-coalesce((select sum(r.amount) from public.payment_allocation_releases r where r.posting_id=a.posting_id and r.transaction_id=a.transaction_id),0) allocation_amount,t.amount original_amount,t.amount_applied from public.payment_allocations a join public.transactions t on t.id=a.transaction_id where a.posting_id=original.id loop
  if item.allocation_amount=0 then continue;end if;
  if item.amount_applied<item.allocation_amount then raise exception 'An allocated due changed. Review the accounting history before reversing.';end if;
  insert into public.payment_allocations(posting_id,transaction_id,user_id,amount,before_balance) values(entry,item.transaction_id,original.user_id,item.allocation_amount,item.original_amount-item.amount_applied+item.allocation_amount);
  update public.transactions set amount_applied=amount_applied-item.allocation_amount,
   status=case when due_date<today then 'past_due'::public.txn_status else 'unpaid'::public.txn_status end,date_paid=null where id=item.transaction_id;
 end loop;
 update public.profiles set credit_balance=credit_after where id=original.user_id;
 insert into public.payment_logs(id,user_id,kind,txn_date,reference,subject,amount_owed,method,funds_applied,remaining_balance,alloc_status,carry_applied,note,source_posting_id)
 values(log_key,original.user_id,'payment',today,'REV-'||original.id::text,'Payment posting reversed',0,'Manual Credit',-(original.cash_amount+original.credit_used),0,'Credited',-original.credit_used,reason,entry);
 if original.payment_id is not null then update public.payments set status='rejected',note='Posting reversed: '||reason,reviewed_at=today where id=original.payment_id;end if;
 perform set_config('app.notification_event',jsonb_build_object('event_type','payment.proof_rejected','payload',jsonb_build_object('source_id',coalesce(original.payment_id,original.id),'status','reversed','reason',reason,'amount',original.cash_amount))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('payment','Payment posting reversed','A lender reversed the posting. Reason: '||reason||'. Dues and account credit have been updated.','targeted',array[original.user_id],actor);
 insert into public.audit_log(actor,action,detail) select name,'PAYMENT_REVERSED','Reversal '||entry::text||' of '||original.id::text||': '||reason from public.profiles where id=actor;
 result:=jsonb_build_object('saved',true,'posting_id',entry,'reversal_of',original.id,'credit_balance',credit_after);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'payment-reverse',md5(p_payload::text),result);return result;
end $$;

notify pgrst,'reload schema';


-- 20261019165316_correction_reversal_credit_history.sql
-- Additive reversal metadata; keep it with immutable accounting history.

alter table public.payment_postings add column correction_credit_reclaimed numeric(12,2) not null default 0
 check(correction_credit_reclaimed>=0 and correction_credit_reclaimed<=allocated_amount and (reversal_of is not null or correction_credit_reclaimed=0));
create or replace function mobile_private.reverse_reviewed_payment(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 original public.payment_postings;credit_before numeric;credit_after numeric;expected numeric;released_total numeric;
 entry uuid:=gen_random_uuid();log_key uuid:=gen_random_uuid();item record;reason text:=btrim(coalesce(p_payload->>'reason',''));
 result jsonb;today date:=(now() at time zone 'Asia/Manila')::date;
begin
 if not public.is_admin() then raise exception 'Only an active lender can reverse payments.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Review the reversal and enter a reason of 10 to 2000 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'payment-reverse' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 select * into original from public.payment_postings where id=(p_payload->>'id')::uuid and reversal_of is null;
 if not found then raise exception 'Choose an original payment posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(original.user_id::text,53));
 select credit_balance into credit_before from public.profiles where id=original.user_id for update;
 if exists(select 1 from public.payment_postings where reversal_of=original.id) then raise exception 'This posting has already been reversed.';end if;
 expected:=mobile_private.money_value(p_payload->>'expectedCredit');
 if expected<>credit_before then raise exception 'Available credit changed. Refresh and review the reversal again.';end if;
 select coalesce(sum(amount),0) into released_total from public.payment_allocation_releases where posting_id=original.id;
 if credit_before<original.credit_added+released_total then raise exception 'The surplus credit was already used. Reverse its later credit applications first.';end if;
 credit_after:=credit_before+original.credit_used-original.credit_added-released_total;
 if credit_after>9999999999.99 then raise exception 'The resulting credit exceeds the supported amount limit.';end if;
 perform 1 from public.transactions where id in(select transaction_id from public.payment_allocations where posting_id=original.id) order by id for update;
 insert into public.payment_postings(id,user_id,reversal_of,actor_id,operation_key,cash_amount,credit_used,credit_added,allocated_amount,effective_date,note,log_id,correction_credit_reclaimed)
 values(entry,original.user_id,original.id,actor,op,original.cash_amount,original.credit_used,original.credit_added,original.allocated_amount,today,reason||case when released_total>0 then '. Reclaimed PHP '||released_total::text||' returned by earlier transaction corrections.' else '' end,log_key,released_total);
 for item in select a.transaction_id,a.amount-coalesce((select sum(r.amount) from public.payment_allocation_releases r where r.posting_id=a.posting_id and r.transaction_id=a.transaction_id),0) allocation_amount,t.amount original_amount,t.amount_applied from public.payment_allocations a join public.transactions t on t.id=a.transaction_id where a.posting_id=original.id loop
  if item.allocation_amount=0 then continue;end if;
  if item.amount_applied<item.allocation_amount then raise exception 'An allocated due changed. Review the accounting history before reversing.';end if;
  insert into public.payment_allocations(posting_id,transaction_id,user_id,amount,before_balance) values(entry,item.transaction_id,original.user_id,item.allocation_amount,item.original_amount-item.amount_applied+item.allocation_amount);
  update public.transactions set amount_applied=amount_applied-item.allocation_amount,
   status=case when due_date<today then 'past_due'::public.txn_status else 'unpaid'::public.txn_status end,date_paid=null where id=item.transaction_id;
 end loop;
 update public.profiles set credit_balance=credit_after where id=original.user_id;
 insert into public.payment_logs(id,user_id,kind,txn_date,reference,subject,amount_owed,method,funds_applied,remaining_balance,alloc_status,carry_applied,note,source_posting_id)
 values(log_key,original.user_id,'payment',today,'REV-'||original.id::text,'Payment posting reversed',0,'Manual Credit',-(original.cash_amount+original.credit_used),0,'Credited',-original.credit_used,reason,entry);
 if original.payment_id is not null then update public.payments set status='rejected',note='Posting reversed: '||reason,reviewed_at=today where id=original.payment_id;end if;
 perform set_config('app.notification_event',jsonb_build_object('event_type','payment.proof_rejected','payload',jsonb_build_object('source_id',coalesce(original.payment_id,original.id),'status','reversed','reason',reason,'amount',original.cash_amount))::text,true);
 insert into public.notifications(category,title,body,audience,target_user_ids,created_by) values('payment','Payment posting reversed','A lender reversed the posting. Reason: '||reason||'. Dues and account credit have been updated.','targeted',array[original.user_id],actor);
 insert into public.audit_log(actor,action,detail) select name,'PAYMENT_REVERSED','Reversal '||entry::text||' of '||original.id::text||': '||reason from public.profiles where id=actor;
 result:=jsonb_build_object('saved',true,'posting_id',entry,'reversal_of',original.id,'credit_balance',credit_after);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'payment-reverse',md5(p_payload::text),result);return result;
end $$;

notify pgrst,'reload schema';


-- 20261020165218_notification_delivery_signals.sql

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


-- 20261020172823_ledger_live_and_archive_deletion.sql

alter type public.audit_action add value if not exists 'BREAKDOWN_HIDDEN';
alter type public.audit_action add value if not exists 'BREAKDOWN_RESTORED';
-- Scoped revision metadata; financial content remains behind existing RLS.
create table public.ledger_change_signals(
 borrower_id uuid primary key references public.profiles(id) on delete cascade,
 version bigint not null default 1,updated_at timestamptz not null default now()
);
alter table public.ledger_change_signals enable row level security;
revoke all on public.ledger_change_signals from public,anon,authenticated;
grant select on public.ledger_change_signals to authenticated;
create policy owner_or_lender on public.ledger_change_signals for select to authenticated
 using(mobile_private.valid_session() and (borrower_id=(select auth.uid()) or public.is_admin()));
create policy mobile_valid_session on public.ledger_change_signals as restrictive to authenticated using(mobile_private.valid_session());
alter publication supabase_realtime add table public.ledger_change_signals;

create function mobile_private.signal_ledger_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare owners uuid[];owner_id uuid;before_row jsonb;after_row jsonb;owner_key text;
begin
 if tg_table_schema<>'public' or tg_table_name not in ('profiles','loans','transactions','payments','payment_logs','payment_postings','payment_allocations','payment_breakdown_visibility') then raise exception 'Unsupported ledger source';end if;
 if tg_op<>'INSERT' then before_row=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row=to_jsonb(new);end if;
 if tg_op='UPDATE' and (after_row-array['last_login','updated_at']) is not distinct from (before_row-array['last_login','updated_at']) then return null;end if;
 owner_key=case when tg_table_name='profiles' then 'id' else 'user_id' end;
 owners=array[(before_row->>owner_key)::uuid,(after_row->>owner_key)::uuid];
 for owner_id in select distinct unnest(owners) loop
  if exists(select 1 from public.profiles where id=owner_id) then
   insert into public.ledger_change_signals as s(borrower_id) values(owner_id)
    on conflict(borrower_id) do update set version=s.version+1,updated_at=clock_timestamp();
  end if;
 end loop;
 return null;
end $$;
revoke all on function mobile_private.signal_ledger_change() from public,anon,authenticated;
do $$declare source text;begin
 foreach source in array array['profiles','loans','transactions','payments','payment_logs','payment_postings','payment_allocations'] loop
  execute format('create trigger ledger_live_signal after insert or update or delete on public.%I for each row execute function mobile_private.signal_ledger_change()',source);
 end loop;
end $$;

-- Display visibility is separate from immutable payment/accounting records.
create table public.payment_breakdown_visibility(
 posting_id uuid primary key references public.payment_postings(id) on delete restrict,
 user_id uuid not null references public.profiles(id) on delete cascade,
 hidden_at timestamptz not null default now(),hidden_by uuid not null
);
alter table public.payment_breakdown_visibility enable row level security;
revoke all on public.payment_breakdown_visibility from public,anon,authenticated;
grant select on public.payment_breakdown_visibility to authenticated;
create policy own_or_lender on public.payment_breakdown_visibility for select to authenticated
 using(mobile_private.valid_session() and (user_id=(select auth.uid()) or public.is_admin()));
create policy mobile_valid_session on public.payment_breakdown_visibility as restrictive to authenticated using(mobile_private.valid_session());
create index payment_breakdown_visibility_owner on public.payment_breakdown_visibility(user_id,posting_id);
create trigger ledger_live_signal after insert or update or delete on public.payment_breakdown_visibility
 for each row execute function mobile_private.signal_ledger_change();

create function public.admin_set_payment_breakdown_visibility(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;ids uuid[];hidden boolean;
 prior mobile_private.operation_keys;result jsonb;
begin
 if not public.is_admin() then raise exception 'Only an active lender can manage payment breakdowns.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'ids') is distinct from 'array' or jsonb_typeof(p_payload->'hidden') is distinct from 'boolean' then raise exception 'Review the selected payment breakdowns.';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'ids') value where jsonb_typeof(value)<>'string') then raise exception 'Choose valid payment breakdown IDs.';end if;
 select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'ids');
 if coalesce(cardinality(ids),0) not between 1 and 500 or cardinality(ids)<>jsonb_array_length(p_payload->'ids') then raise exception 'Choose between 1 and 500 distinct payment breakdowns.';end if;
 hidden=(p_payload->>'hidden')::boolean;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'breakdown-visibility' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 perform 1 from public.payment_postings where id=any(ids) order by id for update;
 if (select count(*) from public.payment_postings where id=any(ids) and reversal_of is null and cash_amount>0)<>cardinality(ids) then raise exception 'A selected payment breakdown is unavailable. Refresh and retry.';end if;
 if hidden then
  insert into public.payment_breakdown_visibility(posting_id,user_id,hidden_by)
   select id,user_id,actor from public.payment_postings where id=any(ids)
   on conflict(posting_id) do nothing;
 else delete from public.payment_breakdown_visibility where posting_id=any(ids);end if;
 insert into public.audit_log(actor,action,detail) select name,(case when hidden then 'BREAKDOWN_HIDDEN' else 'BREAKDOWN_RESTORED' end)::public.audit_action,
  cardinality(ids)||' payment breakdown(s); payments and balances unchanged' from public.profiles where id=actor;
 result=jsonb_build_object('ids',ids,'hidden',hidden);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'breakdown-visibility',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function public.admin_set_payment_breakdown_visibility(jsonb) from public,anon;
grant execute on function public.admin_set_payment_breakdown_visibility(jsonb) to authenticated;

create function public.admin_purge_archived_transactions(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;ids text[];eligible text[];
 blocked jsonb;deleted text[];result jsonb;prior mobile_private.operation_keys;
begin
 if not public.is_admin() then raise exception 'Only an active lender can permanently delete archives.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'ids') is distinct from 'array' then raise exception 'Review the selected archive entries.';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'ids') value where jsonb_typeof(value)<>'string') then raise exception 'Choose valid archive IDs.';end if;
 select array_agg(distinct value) into ids from jsonb_array_elements_text(p_payload->'ids');
 if coalesce(cardinality(ids),0) not between 1 and 500 or cardinality(ids)<>jsonb_array_length(p_payload->'ids') or exists(select 1 from unnest(ids) id where length(id) not between 1 and 200) then raise exception 'Choose between 1 and 500 distinct archive entries.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'archive-purge' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;
 end if;
 perform 1 from public.transactions where id=any(ids) order by id for update;
 with assessed as(
  select selected.id,case
   when t.id is null then 'Entry no longer exists.'
   when t.archived_at is null then 'Entry was restored and is no longer archived.'
   when t.fee_assessment_id is not null then 'Retained: linked to an assessed fee.'
   when exists(select 1 from public.payment_allocations a where a.transaction_id=t.id) or t.amount_applied>0 then 'Retained: linked to recorded payment allocations.'
   when exists(select 1 from public.transaction_corrections c where c.transaction_id=t.id) then 'Retained: linked to transaction correction history.'
   else null end reason
  from unnest(ids) selected(id) left join public.transactions t on t.id=selected.id
 ) select coalesce(array_agg(id order by id) filter(where reason is null),'{}'),
  coalesce(jsonb_agg(jsonb_build_object('id',id,'reason',reason) order by id) filter(where reason is not null),'[]') into eligible,blocked from assessed;
 with removed as(delete from public.transactions where id=any(eligible) returning id) select coalesce(array_agg(id),'{}') into deleted from removed;
 insert into public.audit_log(actor,action,detail) select name,'TXN_PURGED',cardinality(deleted)||' archived ledger record(s) permanently deleted; '||jsonb_array_length(blocked)||' retained' from public.profiles where id=actor;
 result=jsonb_build_object('deletedIds',deleted,'blocked',blocked);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'archive-purge',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function public.admin_purge_archived_transactions(jsonb) from public,anon;
grant execute on function public.admin_purge_archived_transactions(jsonb) to authenticated;


-- 20261021230453_guest_support_tracking.sql

create table mobile_private.support_verification_challenges (
 id uuid primary key,
 ticket_id uuid references public.support_tickets(id) on delete cascade,
 code_hash text not null check(length(code_hash)=64),
 attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create table mobile_private.support_tracking_sessions (
 token_hash text primary key check(length(token_hash)=64),
 ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index support_verification_expiry on mobile_private.support_verification_challenges(expires_at);
create index support_tracking_session_expiry on mobile_private.support_tracking_sessions(expires_at);
alter table mobile_private.support_verification_challenges enable row level security;
alter table mobile_private.support_tracking_sessions enable row level security;
revoke all on mobile_private.support_verification_challenges,mobile_private.support_tracking_sessions from public,anon,authenticated;


-- 20261023182733_combined_fee_assessment.sql
-- Additive combined assessments. Existing assessments and the single-date API remain intact.
-- Production rollback is forward-only: disable the new UI/RPC grants; retain posted history.

set local lock_timeout='5s';
alter table public.fee_assessments
 add column assessment_mode text not null default 'single_date',
 add column source_due_dates date[],
 add column prior_assessment_count integer,
 add column repeat_confirmed boolean not null default false,
 add column repeat_review_token text;
alter table public.fee_assessments add constraint combined_fee_metadata check(
 assessment_mode in ('single_date','combined') and
 (assessment_mode<>'combined' or (
  source_due_dates is not null and cardinality(source_due_dates) between 1 and 1000
  and array_position(source_due_dates,null) is null
  and source_due_date>=all(source_due_dates)
  and prior_assessment_count is not null and prior_assessment_count>=0
  and repeat_review_token is not null
  and (prior_assessment_count=0 or repeat_confirmed)
 ))
);
-- Preserve the monthly restriction for callers of the original single-date workflow.
drop index public.fee_assessment_monthly_once;
create unique index fee_assessment_monthly_once
 on public.fee_assessments(user_id,source_due_date,assessment_month)
 where voided_at is null and assessment_mode='single_date';

create function mobile_private.fee_signed_amount(value text) returns numeric
language plpgsql immutable security invoker set search_path='' as $$
begin
 if value is null or value!~'^-?[0-9]{1,10}([.][0-9]{1,2})?$' or abs(value::numeric)>9999999999.99 then
  raise exception 'Use a valid ledger amount with at most two decimal centavo places.';
 end if;
 return value::numeric;
end $$;
revoke all on function mobile_private.fee_signed_amount(text) from public,anon,authenticated;

create function mobile_private.combined_fee_context(borrower uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();cycle date:=date_trunc('month',clock_timestamp() at time zone 'Asia/Manila')::date;result jsonb;
begin
 if not public.is_admin() then raise exception 'Only an active lender can review fee assessments.' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=borrower and role='user' and status='active') then raise exception 'Choose an active borrower account.';end if;
 select jsonb_build_object('assessmentMonth',cycle,'count',count(*),'total',coalesce(sum(total_amount),0),
  'reviewToken',md5(coalesce(string_agg(id::text,',' order by id::text),'')))
 into result from public.fee_assessments where user_id=borrower and assessment_month=cycle and voided_at is null;
 return result||jsonb_build_object('assessments',coalesce((
  select jsonb_agg(to_jsonb(h)) from (
   select id,source_due_date,charge_due_date,total_amount,created_at,assessment_mode
   from public.fee_assessments where user_id=borrower and assessment_month=cycle and voided_at is null
   order by created_at desc,id limit 5
  ) h
 ),'[]'::jsonb));
end $$;
revoke all on function mobile_private.combined_fee_context(uuid) from public,anon,authenticated;
grant execute on function mobile_private.combined_fee_context(uuid) to authenticated;

create function mobile_private.assess_combined_fees(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;
 borrower uuid:=(p_payload->>'borrowerId')::uuid;as_of date;charge_date date;dates date[];
 today date:=(clock_timestamp() at time zone 'Asia/Manila')::date;cycle date;context jsonb;
 rate numeric:=0;late numeric:=0;finance numeric:=0;base numeric:=0;balance numeric;
 finance_on boolean;late_on boolean;items jsonb:=p_payload->'selections';item jsonb;ids text[];
 due public.transactions;snapshots jsonb:='[]';assessment uuid:=gen_random_uuid();result jsonb;entry text;date_label text;rate_label text;
begin
 if not public.is_admin() then raise exception 'Only an active lender can assess fees.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb then raise exception 'Review and confirm the combined charges before posting.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'fee-assess-combined' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;
  return prior.result;
 end if;
 if coalesce(p_payload->>'asOfDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or coalesce(p_payload->>'chargeDueDate','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose valid As of and new charge due dates.';end if;
 as_of:=(p_payload->>'asOfDate')::date;charge_date:=(p_payload->>'chargeDueDate')::date;
 if charge_date<as_of then raise exception 'The new charge due date cannot be before the As of date.';end if;
 cycle:=date_trunc('month',today)::date;
 if p_payload->>'assessmentMonth' is distinct from to_char(cycle,'YYYY-MM-DD') then raise exception 'The assessment month changed. Refresh and review again.';end if;
 if jsonb_typeof(p_payload->'sourceDueDates') is distinct from 'array'
  or jsonb_array_length(p_payload->'sourceDueDates') not between 1 and 1000 then raise exception 'Select between 1 and 1000 original due dates.';end if;
 for item in select value from jsonb_array_elements(p_payload->'sourceDueDates') loop
  if jsonb_typeof(item) is distinct from 'string' or (item#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Select valid original due dates.';end if;
 end loop;
 select array_agg((value#>>'{}')::date order by value#>>'{}') into dates from jsonb_array_elements(p_payload->'sourceDueDates');
 if cardinality(dates)<>(select count(distinct x) from unnest(dates) x) or exists(select 1 from unnest(dates) d where d>as_of) then raise exception 'Original due dates must be unique and on or before the As of date.';end if;
 if p_payload->'financeEnabled' not in ('true'::jsonb,'false'::jsonb) or p_payload->'financeEnabled' is null
  or p_payload->'lateEnabled' not in ('true'::jsonb,'false'::jsonb) or p_payload->'lateEnabled' is null then raise exception 'Choose which fee components to apply.';end if;
 finance_on:=(p_payload->>'financeEnabled')::boolean;late_on:=(p_payload->>'lateEnabled')::boolean;
 if finance_on then
  if coalesce(p_payload->>'rate','')!~'^[0-9]{1,3}([.][0-9]{1,2})?$' then raise exception 'Enter a finance charge rate from 0 to 100 percent.';end if;
  rate:=(p_payload->>'rate')::numeric;if rate>100 then raise exception 'Finance charge rate must not exceed 100 percent.';end if;
 end if;
 if late_on then late:=mobile_private.fee_signed_amount(p_payload->>'lateAmount');if late<0 then raise exception 'Late fee cannot be negative.';end if;end if;
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 1000 then raise exception 'Choose between 1 and 1000 available ledger entries.';end if;
 perform 1 from public.profiles where id=borrower and role='user' and status='active' for update;
 if not found then raise exception 'Choose an active borrower account.';end if;
 context:=mobile_private.combined_fee_context(borrower);
 if p_payload->>'priorReviewToken' is distinct from context->>'reviewToken' then
  raise exception 'Fee assessment history changed. Reload the assessment review and confirm again.' using errcode='PT409';
 end if;
 if (context->>'count')::integer>0 and p_payload->'repeatConfirmed' is distinct from 'true'::jsonb then raise exception 'Explicitly confirm another assessment for this borrower this month.';end if;
 select array_agg(value->>'id' order by value->>'id') into ids from jsonb_array_elements(items);
 if exists(select 1 from unnest(ids) x where x is null or length(x) not between 1 and 200)
  or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Duplicate or unavailable selected entry.';end if;
 perform 1 from public.transactions where id=any(ids) order by id for update;
 for item in select value from jsonb_array_elements(items) order by value->>'id' loop
  select * into due from public.transactions where id=item->>'id';
  if not found or due.user_id<>borrower or not due.due_date=any(dates) or due.due_date>as_of
   or due.archived_at is not null or due.status not in ('unpaid','past_due') or due.amount=0 then
   raise exception 'A selected ledger entry is unavailable. Refresh and review again.';
  end if;
  if due.amount<0 and due.amount_applied<>0 then raise exception 'A negative adjustment has an applied payment. Review the record first.';end if;
  balance:=due.amount-due.amount_applied;
  if balance=0 or balance<>mobile_private.fee_signed_amount(item->>'expectedBalance')
   or due.amount<>mobile_private.fee_signed_amount(item->>'expectedAmount')
   or due.amount_applied<>mobile_private.fee_signed_amount(item->>'expectedAppliedAmount')
   or due.due_date::text is distinct from item->>'expectedDueDate'
   or due.description is distinct from item->>'expectedDescription'
   or due.status::text is distinct from item->>'expectedStatus' then
   raise exception 'A selected balance or record changed. Refresh and review again.' using errcode='PT409';
  end if;
  base:=base+balance;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('id',due.id,'description',due.description,'dueDate',due.due_date,'originalAmount',due.amount,'paidAmount',due.amount_applied,'remainingAmount',balance,'feeKind',due.fee_kind));
 end loop;
 if base<=0 or base>9999999999.99 then raise exception 'The selected net balance must be positive and within the supported limit.';end if;
 finance:=case when finance_on then round(base*rate/100,2) else 0 end;
 if finance+late<=0 or finance+late>9999999999.99 then raise exception 'Choose positive charges within the supported amount limit.';end if;
 insert into public.fee_assessments(id,user_id,actor_id,operation_key,source_due_date,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_rows,assessment_mode,source_due_dates,prior_assessment_count,repeat_confirmed,repeat_review_token)
 values(assessment,borrower,actor,op,as_of,cycle,charge_date,finance_on,rate,late_on,base,finance,late,finance+late,snapshots,'combined',dates,(context->>'count')::integer,coalesce(p_payload->'repeatConfirmed'='true'::jsonb,false),context->>'reviewToken');
 date_label:=to_char(as_of,'Mon FMDD, YYYY');rate_label:=trim(trailing '.' from trim(trailing '0' from to_char(rate,'FM990.00')));
 if finance>0 then
  entry:='fee-'||assessment::text||'-finance';
  insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date,fee_assessment_id,fee_kind)
  values(entry,borrower,1,rate_label||'% Finance Charge as of '||date_label||' (₱'||to_char(base,'FM999,999,999,990.00')||')',finance,'Straight',today,charge_date,assessment,'finance_charge');
 end if;
 if late>0 then
  entry:='fee-'||assessment::text||'-late';
  insert into public.transactions(id,user_id,n,description,amount,type,txn_date,due_date,fee_assessment_id,fee_kind)
  values(entry,borrower,2,'Late Payment Fee as of '||date_label,late,'Straight',today,charge_date,assessment,'late_fee');
 end if;
 result:=jsonb_build_object('saved',true,'id',assessment,'base',base,'finance',finance,'late',late,'total',finance+late,'month',cycle,'dueDate',charge_date,'asOfDate',as_of,'sourceDueDates',dates);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'fee-assess-combined',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function mobile_private.assess_combined_fees(jsonb) from public,anon,authenticated;
grant execute on function mobile_private.assess_combined_fees(jsonb) to authenticated;

create function public.combined_fee_context(p_borrower_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select mobile_private.combined_fee_context(p_borrower_id)$$;
create function public.assess_combined_fees(p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select mobile_private.assess_combined_fees(p_payload)$$;
revoke all on function public.combined_fee_context(uuid),public.assess_combined_fees(jsonb) from public,anon,authenticated;
grant execute on function public.combined_fee_context(uuid),public.assess_combined_fees(jsonb) to authenticated;
notify pgrst,'reload schema';


-- 20261023192521_non_retrying_transaction_conflicts.sql
-- Stop domain-conflict errors from entering PostgREST 14 serialization retries.
-- No financial calculation or stored record changes.
-- Retain this correction on rollback; do not reintroduce custom SQLSTATE 40001.

set local lock_timeout='5s';
do $$
declare definition text;changed text;expected text:='b08993e4da31be7ee7e51e199c83a6a0a5abdedfeb80a876ead63e85bcb7ee39';
begin
 definition:=pg_get_functiondef('public.admin_correct_transaction(jsonb)'::regprocedure);
 if encode(sha256(convert_to(definition,'UTF8')),'hex')<>expected then
  raise exception 'Transaction correction function differs from the reviewed version. Review its definition before applying this fix.';
 end if;
 changed:=replace(definition,'using errcode=''40001''','using errcode=''PT409''');
 if changed=definition then raise exception 'Reviewed stale guard was not found.';end if;
 execute changed;
end $$;
notify pgrst,'reload schema';


-- 20261023195500_loan_request_access_realtime.sql

set local lock_timeout='5s';
-- Access flags only; existing RLS continues to scope borrowers to their own row.
do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loan_request_access') then
  alter publication supabase_realtime add table public.loan_request_access;
 end if;
end
$$;


-- 20261024180858_telegram_proof_alerts.sql

set local lock_timeout='5s';
create table mobile_private.telegram_settings(
 singleton boolean primary key default true check(singleton),
 version integer not null default 1,
 enabled boolean not null default false,
 chat_id text check(chat_id ~ '^[1-9][0-9]{0,19}$'),
 chat_label text,
 last_worker_error text,
 bot_id text,
 connected_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(not enabled or (chat_id is not null and bot_id is not null))
);
insert into mobile_private.telegram_settings(singleton) values(true);
create table mobile_private.telegram_connections(
 actor_id uuid primary key references public.profiles(id) on delete cascade,
 nonce_hash text not null,
 bot_id text not null,
 expires_at timestamptz not null
);
create table mobile_private.telegram_deliveries(
 id uuid primary key default gen_random_uuid(),
 payment_id uuid unique,
 kind text not null default 'proof' check(kind in ('proof','test')),
 destination text not null check(destination ~ '^[1-9][0-9]{0,19}$'),
 bot_id text not null,
 settings_version integer not null,
 payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','sending','retry','delivered','failed','uncertain','cancelled')),
 attempts integer not null default 0,
 next_at timestamptz not null default now(),
 sending_at timestamptz,
 delivered_at timestamptz,
 message_id text,
 last_error text,
 created_at timestamptz not null default now()
);
create index telegram_ready on mobile_private.telegram_deliveries(next_at,created_at) where status in ('queued','retry');
create table mobile_private.telegram_audit(
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references public.profiles(id) on delete set null,
 operation text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table mobile_private.telegram_settings enable row level security;
alter table mobile_private.telegram_connections enable row level security;
alter table mobile_private.telegram_deliveries enable row level security;
alter table mobile_private.telegram_audit enable row level security;
revoke all on mobile_private.telegram_settings,mobile_private.telegram_connections,mobile_private.telegram_deliveries,mobile_private.telegram_audit from public,anon,authenticated;
-- Queue a snapshot only for future successfully inserted proofs. No backfill and no HTTP in the payment transaction.
create function mobile_private.queue_telegram_proof() returns trigger
language plpgsql security definer set search_path='' as $$
declare s mobile_private.telegram_settings; borrower_name text;
begin
 if new.status::text<>'pending' or coalesce(new.file_path,'')='' then return new;end if;
 select * into s from mobile_private.telegram_settings where singleton and enabled;
 if not found then return new;end if;
 select name into borrower_name from public.profiles where id=new.user_id and role::text='user';
 if not found then return new;end if;
 insert into mobile_private.telegram_deliveries(payment_id,destination,bot_id,settings_version,payload)
 values(new.id,s.chat_id,s.bot_id,s.version,jsonb_build_object('borrower',borrower_name,'amount',new.amount,'reference',coalesce(nullif(new.receipt_number,''),new.id::text),'submittedAt',coalesce(new.submitted_at_exact,clock_timestamp())))
 on conflict(payment_id) do nothing;
 return new;
end $$;
revoke all on function mobile_private.queue_telegram_proof() from public,anon,authenticated;
create trigger telegram_new_proof after insert on public.payments for each row execute function mobile_private.queue_telegram_proof();
-- Existing notification event wake-ups and the canonical one-minute worker also process this independent queue.


-- 20261024204957_telegram_borrower_message_alerts.sql

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


-- 20261025010004_transaction_groups.sql
-- Classification metadata only. No backfill or accounting/credit mutation.
-- Rollback: restore the previous app; retain the nullable metadata for safe forward retry.

set local lock_timeout='3s';
set local statement_timeout='30s';
alter table public.transactions add column transaction_group text
 check(transaction_group in ('cash_loan','retail_installment','straight_retail','fees','adjustments'));
create function mobile_private.transaction_group_key(p_type text,p_description text,p_amount numeric,p_fee text,p_explicit text,p_loan_category text default null)
returns text language sql immutable set search_path='' as $$
 select case when p_type='Installment' then
  case when p_loan_category in ('cash_loan','retail_installment') then p_loan_category
   when p_explicit in ('cash_loan','retail_installment') then p_explicit
   when coalesce(p_description,'')~*'cash\s+loan|paypal\s+send' then 'cash_loan' else 'retail_installment' end
  when p_explicit in ('straight_retail','fees','adjustments') then p_explicit
  when p_fee is not null or btrim(coalesce(p_description,''))~*'^(\d+(\.\d+)?\s*%\s*)?finance\s+charge\y|^late\s+(payment\s+)?fee\y' then 'fees'
  when p_amount<0 or btrim(coalesce(p_description,''))~*'^(partial\s+payment|overpayment|account\s+credit|credit\s+applied)\y' then 'adjustments'
  else 'straight_retail' end;
$$;
revoke all on function mobile_private.transaction_group_key(text,text,numeric,text,text,text) from public,anon;
grant execute on function mobile_private.transaction_group_key(text,text,numeric,text,text,text) to authenticated,service_role;

create function mobile_private.validate_transaction_group() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and new.type is distinct from old.type and new.transaction_group is not distinct from old.transaction_group then new.transaction_group:=null;end if;
 if new.transaction_group is not null and
  ((new.type='Installment' and new.transaction_group not in ('cash_loan','retail_installment')) or
   (new.type='Straight' and new.transaction_group not in ('straight_retail','fees','adjustments'))) then
  raise exception 'Group must match the transaction type.';
 end if;
 return new;
end $$;
revoke all on function mobile_private.validate_transaction_group() from public,anon,authenticated;
create trigger validate_transaction_group before insert or update of type,transaction_group on public.transactions
 for each row execute function mobile_private.validate_transaction_group();

create function mobile_private.set_transaction_group(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;
 row_before public.transactions;linked public.loans;group_before text;target text:=p_payload->>'group';
 reason text:=btrim(coalesce(p_payload->>'reason',''));prior mobile_private.operation_keys;result jsonb;scope text;
begin
 if not public.is_admin() then raise exception 'Only an active lender can change transaction groups.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or length(reason) not between 10 and 2000 then raise exception 'Review the group and enter a reason of 10 to 2,000 characters.';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||op::text,0));
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'transaction-group' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;
  return prior.result;
 end if;
 select * into row_before from public.transactions where id=p_payload->>'id';
 if not found or row_before.archived_at is not null then raise exception 'This transaction is unavailable.';end if;
 -- Same borrower lock used by posting/corrections; metadata changes do not alter funds.
 perform pg_advisory_xact_lock(hashtextextended(row_before.user_id::text,53));
 -- Lock loan before transaction, consistent with loan/schedule operations.
 if row_before.type='Installment' and row_before.loan_id is not null then
  select * into linked from public.loans where id=row_before.loan_id for update;
 end if;
 select * into row_before from public.transactions where id=row_before.id for update;
 if row_before.archived_at is not null or row_before.type is distinct from p_payload->>'expectedType'
  or row_before.user_id::text is distinct from p_payload->>'expectedUserId' or row_before.loan_id is distinct from p_payload->>'expectedLoanId' then raise exception 'The transaction changed. Refresh and review again.' using errcode='40001';end if;
 if row_before.type='Installment' and target not in ('cash_loan','retail_installment')
  or row_before.type='Straight' and target not in ('straight_retail','fees','adjustments') or target is null then raise exception 'Choose a group matching the transaction type.';end if;
 group_before:=mobile_private.transaction_group_key(row_before.type,coalesce(linked.label,row_before.description),row_before.amount,row_before.fee_kind,case when linked.id is not null then null else row_before.transaction_group end,linked.loan_category);
 if group_before is distinct from p_payload->>'expectedGroup' then raise exception 'The group changed. Refresh and review again.' using errcode='40001';end if;
 if row_before.type='Installment' and row_before.loan_id is not null then
  if linked.id is null or linked.user_id<>row_before.user_id then raise exception 'The linked installment group is unavailable.';end if;
  update public.loans set loan_category=target where id=linked.id;
  scope:='loan';
 else
  update public.transactions set transaction_group=target where id=row_before.id;
  scope:='transaction';
 end if;
 insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED','Group changed for '||row_before.id||' ('||scope||'): '||group_before||' → '||target||'. '||reason from public.profiles where id=actor;
 result:=jsonb_build_object('id',row_before.id,'loanId',row_before.loan_id,'group',target,'scope',scope);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'transaction-group',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function mobile_private.set_transaction_group(jsonb) from public,anon;
grant execute on function mobile_private.set_transaction_group(jsonb) to authenticated;
create function public.admin_set_transaction_group(p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select mobile_private.set_transaction_group(p_payload);$$;
revoke all on function public.admin_set_transaction_group(jsonb) from public,anon;
grant execute on function public.admin_set_transaction_group(jsonb) to authenticated;


commit;
