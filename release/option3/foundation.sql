-- Option 3 additive foundation. Requires a verified existing production baseline.
-- local-mobile-enhancements.sql
-- Run only against the copied local Supabase database.
begin;
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
commit;

-- local-full-flow.sql
begin;
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
commit;

-- local-statements.sql
begin;
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
commit;

-- local-flow-fixes.sql
begin;
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
commit;

-- local-upload-validation.sql
begin;
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
notify pgrst,'reload schema';commit;

-- local-flow-guards.sql
begin;
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
notify pgrst,'reload schema';commit;

-- local-storage-guards.sql
begin;
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
notify pgrst,'reload schema';commit;

-- local-proof-review.sql
begin;
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
commit;
