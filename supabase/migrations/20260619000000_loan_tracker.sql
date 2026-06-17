-- ============================================================================
-- LoanLedger PH — Migration 013: Loan Tracker (admin's personal loan portfolio)
--
-- ADMIN-ONLY record of loans the admin has personally availed from banks —
-- completely separate from the borrower loan ledger and every other table.
-- Borrowers must never see it; the RLS policy is gated entirely on is_admin().
--
-- Interest/repayment/monthly/last-payment/status are derived in the app, not
-- stored. Each row snapshots the chosen bank's display fields (name, acronym,
-- brand color, website domain) so cards render independently of any constant.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.tracked_loans (
  id                 uuid primary key default gen_random_uuid(),
  bank_name          text not null,
  bank_acronym       text not null default '',
  bank_color         text not null default '#1e3a8a',
  bank_domain        text not null default '',
  principal          numeric(12,2) not null check (principal > 0),
  processing_fee     numeric(12,2) not null default 0 check (processing_fee >= 0),
  monthly_rate       numeric(6,4)  not null default 0,   -- percent per month
  duration_months    int  not null check (duration_months between 1 and 600),
  txn_date           date not null,
  first_payment_date date not null,
  created_at         timestamptz not null default now()
);

create index tracked_loans_created_at_idx on public.tracked_loans (created_at);

alter table public.tracked_loans enable row level security;
create policy "tracked_loans: admin only" on public.tracked_loans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter type public.audit_action add value if not exists 'TRACKED_LOAN_CREATED';
alter type public.audit_action add value if not exists 'TRACKED_LOAN_DELETED';

-- Sample portfolio so the dashboard isn't empty on first load (only seeded when
-- the table is still empty). Safe to delete from the UI afterward.
insert into public.tracked_loans
  (bank_name, bank_acronym, bank_color, bank_domain, principal, processing_fee, monthly_rate, duration_months, txn_date, first_payment_date)
select * from (values
  ('Land Bank of the Philippines',    'LBP', '#017A3D', 'landbank.com',     100000::numeric, 350::numeric,  1.0000::numeric, 24, '2026-01-10'::date, '2026-02-10'::date),
  ('BDO Unibank',                     'BDO', '#003B7A', 'bdo.com.ph',       500000::numeric, 3000::numeric, 1.1500::numeric, 36, '2024-01-05'::date, '2024-02-05'::date),
  ('Metrobank',                       'MBT', '#004A99', 'metrobank.com.ph', 100000::numeric, 450::numeric,  1.0000::numeric, 12, '2025-01-10'::date, '2025-02-10'::date),
  ('Bank of the Philippine Islands',  'BPI', '#A6192E', 'bpi.com.ph',       350000::numeric, 2000::numeric, 1.0000::numeric, 24, '2022-03-15'::date, '2022-04-15'::date)
) as v(bank_name, bank_acronym, bank_color, bank_domain, principal, processing_fee, monthly_rate, duration_months, txn_date, first_payment_date)
where not exists (select 1 from public.tracked_loans);
