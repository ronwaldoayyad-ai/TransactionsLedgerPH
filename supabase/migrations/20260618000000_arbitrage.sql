-- ============================================================================
-- LoanLedger PH — Migration 012: Arbitrage / Interest Earnings tracker
--
-- ADMIN-ONLY records of the admin's lending spread: each borrower pays a
-- monthly add-on rate while the admin sources funds at a lower cost rate. This
-- table tracks borrower interest, the admin's interest cost, fees, and the net
-- gain. Borrowers must NEVER see it (it exposes the markup) — the RLS policy is
-- gated entirely on is_admin(), so borrowers receive no rows and cannot write.
--
-- A separate interest_rates table holds the editable dropdown lists (borrower
-- rates vs the admin's cost rates), shared with the Loan Calculator.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create type public.rate_kind as enum ('borrower', 'cost');

create table public.interest_rates (
  id         uuid primary key default gen_random_uuid(),
  kind       public.rate_kind not null,
  rate       numeric(6,4) not null check (rate >= 0),   -- percent per month, e.g. 1.7900
  created_at timestamptz not null default now(),
  unique (kind, rate)
);

create table public.arbitrage_loans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  principal          numeric(12,2) not null check (principal > 0),
  txn_date           date not null,
  first_payment_date date not null,
  duration_months    int  not null check (duration_months between 1 and 600),
  last_payment_date  date not null,                     -- = first + duration (computed in app)
  borrower_rate      numeric(6,4) not null default 0,   -- percent/mo
  cost_rate          numeric(6,4) not null default 0,   -- percent/mo
  dst                numeric(12,2) not null default 0    check (dst >= 0),
  processing_fee     numeric(12,2) not null default 1500 check (processing_fee >= 0),
  notarial_fee       numeric(12,2) not null default 0    check (notarial_fee >= 0),
  created_at         timestamptz not null default now()
);

create index arbitrage_loans_user_id_idx on public.arbitrage_loans (user_id);

alter table public.interest_rates  enable row level security;
alter table public.arbitrage_loans enable row level security;

create policy "interest_rates: admin only" on public.interest_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "arbitrage_loans: admin only" on public.arbitrage_loans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed starter rates so the dropdowns aren't empty.
insert into public.interest_rates (kind, rate) values
  ('borrower', 1.7900), ('borrower', 1.8000), ('cost', 0.6500)
on conflict (kind, rate) do nothing;

-- Audit actions (PG15 permits ADD VALUE here; the values aren't USED in this
-- same migration).
alter type public.audit_action add value if not exists 'ARBITRAGE_CREATED';
alter type public.audit_action add value if not exists 'ARBITRAGE_DELETED';
