-- Additive combined assessments. Existing assessments and the single-date API remain intact.
-- Production rollback is forward-only: disable the new UI/RPC grants; retain posted history.
begin;
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
commit;
