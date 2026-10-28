-- Additive, audited admin corrections. Do not remove these records after use.
-- Rollback: deploy the prior UI and revoke execute on admin_correct_transaction;
-- retain corrections/releases so subsequent payment reversals remain correct.
begin;
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
commit;
