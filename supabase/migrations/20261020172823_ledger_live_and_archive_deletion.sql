begin;
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
commit;
