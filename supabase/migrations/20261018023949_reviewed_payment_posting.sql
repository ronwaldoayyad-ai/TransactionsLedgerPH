-- Additive accounting. Historical proofs/logs are never inferred or backfilled.
-- Rollback keeps posted records and uses a compatible Classic reader; do not
-- remove these columns/tables after any real posting has been committed.
begin;
alter type public.audit_action add value if not exists 'PAYMENT_REVERSED';
alter table public.transactions add column amount_applied numeric(12,2) not null default 0
 check(amount_applied>=0 and amount_applied<=amount);
alter table public.profiles add column credit_balance numeric(12,2) not null default 0 check(credit_balance>=0);
alter table public.payments add column posted_at timestamptz;

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
  if TG_OP='UPDATE' and(NEW.amount_applied<>OLD.amount_applied or(OLD.amount_applied>0 and(NEW.amount<>OLD.amount or NEW.status<>OLD.status or NEW.user_id<>OLD.user_id or NEW.loan_id<>OLD.loan_id or NEW.date_paid is distinct from OLD.date_paid))) then
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
  if NEW.posted_at is not null then raise exception 'Posting timestamps are managed by the server.';end if;
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
  update public.payments set status='approved',note=left(coalesce(p_payload->>'note',''),2000),reviewed_at=effective,posted_at=clock_timestamp() where id=proof.id returning * into proof;
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
create or replace function public.mobile_action(p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select case
 when p_action='statement-create' then mobile_private.statement(p_payload)
 when p_action='statement-delete' then mobile_private.delete_statement(p_payload)
 when p_action='payment-review' then mobile_private.review_proof(p_payload)
 when p_action='credit-apply' then mobile_private.post_reviewed_payment(p_payload,true)
 when p_action='payment-reverse' then mobile_private.reverse_reviewed_payment(p_payload)
 else mobile_private.action(p_action,p_payload) end$$;
notify pgrst,'reload schema';
commit;
