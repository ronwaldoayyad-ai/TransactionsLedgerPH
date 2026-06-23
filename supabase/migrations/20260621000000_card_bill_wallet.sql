-- ============================================================================
-- LoanLedger PH — Migration 015: Card & Bills Wallet (isolated feature)
--
-- A self-contained admin tool to track credit/debit cards, bills, and payments.
-- ISOLATION GUARANTEE: three brand-new tables with NO foreign keys to any
-- existing table (FKs exist only among these new tables), and no views/triggers
-- touching existing data. Rows are scoped per signed-in user via owner_id
-- (default auth.uid()), enforced by RLS — so this can never read or mutate any
-- existing production records.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create type public.wallet_network  as enum ('Visa', 'Mastercard', 'Amex', 'JCB', 'Discover', 'Diners Club', 'UnionPay');
create type public.wallet_tier     as enum ('Classic', 'Gold', 'Platinum', 'Signature', 'World', 'World Elite', 'Infinite', 'Prestige');
create type public.wallet_category as enum ('Cashback', 'Travel', 'Rewards');

create table public.wallet_cards (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid(),   -- plain uuid, intentionally NO FK
  bank_name        text not null default '',
  bank_logo        text,                               -- public URL or base64 data URI
  primary_color    text not null default '#1e3a8a',
  secondary_color  text not null default '#0ea5e9',
  first6           text not null default '',
  last4            text not null default '',
  network          public.wallet_network  not null default 'Visa',
  tier             public.wallet_tier     not null default 'Classic',
  category         public.wallet_category,             -- null = none
  credit_limit     numeric(14,2) not null default 0 check (credit_limit >= 0),
  available_limit  numeric(14,2) not null default 0,
  statement_date   text not null default '',
  due_date         text not null default '',
  created_at       timestamptz not null default now()
);

create table public.wallet_bills (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  card_id     uuid not null references public.wallet_cards (id) on delete cascade,
  amount_due  numeric(14,2) not null check (amount_due >= 0),
  due_date    date not null,
  created_at  timestamptz not null default now()
);

create table public.wallet_payments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid(),
  bill_id     uuid not null references public.wallet_bills (id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  created_at  timestamptz not null default now()
);

create index wallet_cards_owner_idx    on public.wallet_cards (owner_id);
create index wallet_bills_owner_idx     on public.wallet_bills (owner_id);
create index wallet_bills_card_idx      on public.wallet_bills (card_id);
create index wallet_payments_owner_idx  on public.wallet_payments (owner_id);
create index wallet_payments_bill_idx   on public.wallet_payments (bill_id);

alter table public.wallet_cards    enable row level security;
alter table public.wallet_bills    enable row level security;
alter table public.wallet_payments enable row level security;

create policy "wallet_cards: own" on public.wallet_cards
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "wallet_bills: own" on public.wallet_bills
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "wallet_payments: own" on public.wallet_payments
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
