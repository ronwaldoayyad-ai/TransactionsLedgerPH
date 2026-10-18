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
