-- ============================================================================
-- LoanLedger PH — Migration 018: Card & Bills Wallet — Accounts
--
-- Adds a deposit/source "Accounts" entity to the isolated wallet feature, plus
-- links a bill payment to the account it was paid from (debiting that account).
-- Same isolation rules: owner-scoped RLS, no FK to existing app tables (FKs
-- only among the wallet_* tables).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.wallet_accounts (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid(),   -- plain uuid, intentionally NO FK
  account_number      text not null default '',
  product_type        text not null default '',
  bank_name           text not null default '',
  bank_code           text not null default '',
  swift_code          text not null default '',
  branch              text not null default '',
  ownership           text not null default '',
  available_balance   numeric(16,2) not null default 0,
  maintaining_balance numeric(16,2) not null default 0 check (maintaining_balance >= 0),
  debit_card_number   text not null default '',
  sort_order          int  not null default 0,
  created_at          timestamptz not null default now()
);

create index wallet_accounts_owner_idx on public.wallet_accounts (owner_id);

alter table public.wallet_accounts enable row level security;
create policy "wallet_accounts: own" on public.wallet_accounts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Link a payment to its source account (within the wallet set only) + a note.
alter table public.wallet_payments
  add column if not exists note       text not null default '',
  add column if not exists account_id uuid references public.wallet_accounts (id) on delete set null;
