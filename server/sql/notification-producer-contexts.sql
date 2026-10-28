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
