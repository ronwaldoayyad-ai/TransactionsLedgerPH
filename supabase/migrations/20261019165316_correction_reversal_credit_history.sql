-- Additive reversal metadata; keep it with immutable accounting history.
begin;
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
commit;
