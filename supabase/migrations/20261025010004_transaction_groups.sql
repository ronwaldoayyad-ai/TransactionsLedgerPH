-- Classification metadata only. No backfill or accounting/credit mutation.
-- Rollback: restore the previous app; retain the nullable metadata for safe forward retry.
begin;
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
