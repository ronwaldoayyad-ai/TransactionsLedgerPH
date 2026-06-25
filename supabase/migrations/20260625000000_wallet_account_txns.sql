-- ============================================================================
-- LoanLedger PH — Migration 019: Card & Bills Wallet — Account transactions
--
-- Standalone account ledger entries powering the Accounts tab "Add Income" /
-- "Add Expense" actions. An expense debits the account's available_balance, an
-- income credits it (the app applies the balance change; this table is the
-- record). Same isolation rules: owner-scoped RLS, FK only to the wallet set.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.wallet_account_txns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),                                   -- plain uuid, intentionally NO FK to auth
  account_id  uuid not null references public.wallet_accounts (id) on delete cascade,
  kind        text not null check (kind in ('expense', 'income')),
  amount      numeric(16,2) not null check (amount > 0),
  merchant    text not null default '',                                          -- expense only
  category    text not null default '',                                          -- income only
  txn_date    date,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index wallet_account_txns_owner_idx   on public.wallet_account_txns (owner_id);
create index wallet_account_txns_account_idx on public.wallet_account_txns (account_id);

alter table public.wallet_account_txns enable row level security;
create policy "wallet_account_txns: own" on public.wallet_account_txns
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
