-- Additive presentation metadata only; no financial rows are updated or backfilled.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create table public.retail_brand_assignments(
 target_key text primary key,loan_id text references public.loans(id) on delete cascade,
 transaction_id text references public.transactions(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('manual','none','auto')),domain text,name text,
 version uuid not null default gen_random_uuid(),updated_at timestamptz not null default now(),
 check((loan_id is not null)::int+(transaction_id is not null)::int=1),
 check(target_key=case when loan_id is not null then 'loan:'||loan_id else 'transaction:'||transaction_id end),
 check((mode='manual' and name is not null and domain is not null and length(name) between 1 and 120 and domain=lower(domain) and length(domain)<=253 and domain~'^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$') or (mode in ('none','auto') and domain is null and name is null))
);
create index retail_brand_assignments_owner on public.retail_brand_assignments(user_id);
create table public.retail_brand_rules(
 id uuid primary key default gen_random_uuid(),alias text not null check(length(alias) between 2 and 80 and alias!~'[@/<>]' and alias!~'[0-9]{9}'),
 domain text not null check(length(domain)<=253 and domain=lower(domain) and domain~'^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
 name text not null check(length(name) between 1 and 120),active boolean not null default true,
 version uuid not null default gen_random_uuid(),updated_at timestamptz not null default now()
);
create unique index retail_brand_rule_phrase_domain on public.retail_brand_rules(lower(btrim(alias)),domain);
alter table public.retail_brand_assignments enable row level security;
alter table public.retail_brand_rules enable row level security;
revoke all on public.retail_brand_assignments,public.retail_brand_rules from public,anon,authenticated;
grant select on public.retail_brand_assignments,public.retail_brand_rules to authenticated;
create policy own_retail_brands on public.retail_brand_assignments for select to authenticated using(
 mobile_private.valid_session() and (public.is_admin() or
 exists(select 1 from public.loans l where l.id=loan_id and l.user_id=(select auth.uid())) or
 exists(select 1 from public.transactions t where t.id=transaction_id and t.user_id=(select auth.uid()) and t.archived_at is null))
);
-- Rules contain merchant/product names only, never borrower or payment data.
create policy retail_brand_reference on public.retail_brand_rules for select to authenticated using(mobile_private.valid_session());
create policy mobile_valid_session on public.retail_brand_assignments as restrictive to authenticated using(mobile_private.valid_session());
create policy mobile_valid_session on public.retail_brand_rules as restrictive to authenticated using(mobile_private.valid_session());
alter publication supabase_realtime add table public.retail_brand_assignments,public.retail_brand_rules;

create function mobile_private.assign_retail_brand(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;
 prior mobile_private.operation_keys;result jsonb;target jsonb;scope text;target_id text;target_key_value text;
 owner_id uuid;description_value text;group_value text;before_assignment public.retail_brand_assignments;
 loan public.loans;txn public.transactions;count_value int:=0;mode_value text:=p_payload->>'mode';domain_value text:=lower(btrim(p_payload->>'domain'));name_value text:=btrim(p_payload->>'name');
begin
 if not public.is_admin() then raise exception 'Only an active lender can assign brand logos.' using errcode='42501';end if;
 if op is null or p_payload->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(p_payload->'targets') is distinct from 'array'
  or jsonb_array_length(p_payload->'targets') not between 1 and 200 or mode_value is null or mode_value not in ('manual','none','auto') then raise exception 'Review between 1 and 200 retail items before saving.';end if;
 if mode_value='manual' and (domain_value is null or length(domain_value)>253 or domain_value!~'^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or name_value is null or length(name_value) not between 1 and 120) then raise exception 'Choose a valid brand from the search results.';end if;
 if mode_value<>'manual' then domain_value:=null;name_value:=null;end if;
 perform pg_advisory_xact_lock(724021);
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then
  if prior.action<>'retail-brand' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;
  return prior.result;
 end if;
 if (select count(*) from jsonb_array_elements(p_payload->'targets'))<>(select count(distinct (x->>'scope')||':'||(x->>'id')) from jsonb_array_elements(p_payload->'targets') x) then raise exception 'A retail item was selected more than once.';end if;
 for target in select value from jsonb_array_elements(p_payload->'targets') order by value->>'scope',value->>'id' loop
  scope:=target->>'scope';target_id:=target->>'id';loan:=null;txn:=null;owner_id:=null;description_value:=null;group_value:=null;
  if scope='loan' then
   select * into loan from public.loans where id=target_id;
   if loan.id is not null and loan.txn_type::text<>'straight' and exists(select 1 from public.transactions t where t.loan_id=loan.id and t.archived_at is null) then
    owner_id:=loan.user_id;description_value:=loan.label;
    group_value:=mobile_private.transaction_group_key('Installment',loan.label,loan.principal,null,null,loan.loan_category);
   end if;
  elsif scope='transaction' then
   select * into txn from public.transactions where id=target_id and archived_at is null;
   if txn.id is not null and not(txn.type='Installment' and txn.loan_id is not null) then
    owner_id:=txn.user_id;description_value:=txn.description;
    group_value:=mobile_private.transaction_group_key(txn.type,txn.description,txn.amount,txn.fee_kind,txn.transaction_group,null);
   end if;
  end if;
  if owner_id is null or group_value not in ('retail_installment','straight_retail') then raise exception 'An item is no longer available as retail. Refresh and review again.' using errcode='40001';end if;
  if owner_id::text is distinct from target->>'expectedUserId' or description_value is distinct from target->>'expectedDescription' then raise exception 'An item changed. Refresh and review again.' using errcode='40001';end if;
  target_key_value:=scope||':'||target_id;
  select * into before_assignment from public.retail_brand_assignments a where a.target_key=target_key_value for update;
  if before_assignment.version::text is distinct from target->>'expectedVersion' then raise exception 'A logo choice changed. Refresh and review again.' using errcode='40001';end if;
  insert into public.retail_brand_assignments(target_key,loan_id,transaction_id,user_id,mode,domain,name)
   values(target_key_value,case when scope='loan' then target_id end,case when scope='transaction' then target_id end,owner_id,mode_value,case when mode_value='manual' then domain_value end,case when mode_value='manual' then name_value end)
   on conflict(target_key) do update set user_id=excluded.user_id,mode=excluded.mode,domain=excluded.domain,name=excluded.name,version=gen_random_uuid(),updated_at=clock_timestamp();
  count_value:=count_value+1;
 end loop;
 insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED','Brand logo metadata: '||mode_value||' for '||count_value||' retail items; '||coalesce(domain_value,'automatic/no logo') from public.profiles where id=actor;
 result:=jsonb_build_object('updated',count_value);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'retail-brand',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function mobile_private.assign_retail_brand(jsonb) from public,anon;
grant execute on function mobile_private.assign_retail_brand(jsonb) to authenticated;
create function public.admin_assign_retail_brand(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select mobile_private.assign_retail_brand(p_payload);$$;
revoke all on function public.admin_assign_retail_brand(jsonb) from public,anon;
grant execute on function public.admin_assign_retail_brand(jsonb) to authenticated;

create function mobile_private.save_retail_brand_rule(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=mobile_private.active_user();op uuid:=(p_payload->>'key')::uuid;prior mobile_private.operation_keys;before_rule public.retail_brand_rules;rule_id uuid;result jsonb;
begin
 if not public.is_admin() then raise exception 'Only an active lender can manage brand keywords.' using errcode='42501';end if;
 if op is null then raise exception 'A retry key is required.';end if;
 perform pg_advisory_xact_lock(724021);
 select * into prior from mobile_private.operation_keys where actor_id=actor and key=op;
 if found then if prior.action<>'retail-brand-rule' or prior.payload_hash<>md5(p_payload::text) then raise exception 'Retry details changed.';end if;return prior.result;end if;
 if p_payload->>'id' is not null then
  select * into before_rule from public.retail_brand_rules where id=(p_payload->>'id')::uuid for update;
  if not found or before_rule.version::text is distinct from p_payload->>'expectedVersion' then raise exception 'This keyword changed. Refresh and review again.' using errcode='40001';end if;
  update public.retail_brand_rules set alias=btrim(p_payload->>'alias'),domain=lower(btrim(p_payload->>'domain')),name=btrim(p_payload->>'name'),active=coalesce((p_payload->>'active')::boolean,true),version=gen_random_uuid(),updated_at=clock_timestamp() where id=before_rule.id returning id into rule_id;
 else
  insert into public.retail_brand_rules(alias,domain,name) values(btrim(p_payload->>'alias'),lower(btrim(p_payload->>'domain')),btrim(p_payload->>'name'))
   on conflict(lower(btrim(alias)),domain) do update set name=excluded.name,active=true,version=gen_random_uuid(),updated_at=clock_timestamp() returning id into rule_id;
 end if;
 insert into public.audit_log(actor,action,detail) select name,'TXN_UPDATED','Brand matching keyword updated: '||rule_id from public.profiles where id=actor;
 result:=jsonb_build_object('id',rule_id);
 insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values(actor,op,'retail-brand-rule',md5(p_payload::text),result);
 return result;
end $$;
revoke all on function mobile_private.save_retail_brand_rule(jsonb) from public,anon;
grant execute on function mobile_private.save_retail_brand_rule(jsonb) to authenticated;
create function public.admin_save_retail_brand_rule(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select mobile_private.save_retail_brand_rule(p_payload);$$;
revoke all on function public.admin_save_retail_brand_rule(jsonb) from public,anon;
grant execute on function public.admin_save_retail_brand_rule(jsonb) to authenticated;
commit;
