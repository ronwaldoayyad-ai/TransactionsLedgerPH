-- Additive global presentation metadata. No loan, transaction, payment or credit edits.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create table public.transaction_group_logos(
 group_key text primary key check(group_key in ('cash_loan','fees','adjustments')),
 svg text check(svg is null or (octet_length(svg) between 1 and 65536 and svg like '<svg%' and svg like '%</svg>')),
 filename text check(filename is null or length(filename) between 1 and 120),
 version uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 check((svg is null)=(filename is null))
);
alter table public.transaction_group_logos enable row level security;
revoke all on public.transaction_group_logos from public,anon,authenticated,service_role;
grant select on public.transaction_group_logos to authenticated;
-- Writes go through the existing active-admin server and SVG validator, never the Data API.
create policy group_logo_reference on public.transaction_group_logos for select to authenticated using(mobile_private.valid_session());
create policy mobile_valid_session on public.transaction_group_logos as restrictive to authenticated using(mobile_private.valid_session());
insert into public.transaction_group_logos(group_key) values('cash_loan'),('fees'),('adjustments');
alter publication supabase_realtime add table public.transaction_group_logos;
commit;
