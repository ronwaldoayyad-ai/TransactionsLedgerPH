-- ============================================================================
-- LoanLedger PH — Migration 011: Payment Logs (payment acknowledgement ledger)
--
-- A dedicated, admin-managed record of payments RECEIVED from borrowers, fully
-- independent of the amortization ledger (public.transactions) — recording a
-- log never writes the transactions table. Borrowers read their own logs only.
--
-- Each recording stores a `payment` row (the acknowledgement). When funds do
-- not exactly settle the amount owed, a separate `carry` row captures the
-- excess (Overpayment) or shortfall (Underpayment) so it can be auto-netted
-- into the next log; once applied, the carry is marked consumed.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create type public.pay_log_method as enum ('GCash', 'Maya', 'Bank Transfer', 'Cash');
create type public.pay_log_alloc  as enum ('Settled', 'Overpayment', 'Underpayment');
create type public.pay_log_kind   as enum ('payment', 'carry');

create table public.payment_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  kind              public.pay_log_kind not null default 'payment',
  txn_date          date not null default current_date,   -- (1) Transaction Date
  reference         text not null default '',             -- (2) Transaction Reference #
  subject           text not null default '',             -- (3) editable subject
  due_date          date,                                 -- the [Due Date] the log covers
  amount_owed       numeric(12,2) not null default 0,     -- (4) Amount Owed
  method            public.pay_log_method,                -- (5) Payment Method
  funds_applied     numeric(12,2) not null default 0,     -- (6) Funds Applied
  remaining_balance numeric(12,2) not null default 0,     -- (7) excess(+) / shortfall(-)
  alloc_status      public.pay_log_alloc not null default 'Settled',
  carry_applied     numeric(12,2) not null default 0,     -- prior net carry netted into amount_owed
  parent_id         uuid references public.payment_logs (id) on delete set null, -- carry -> source payment
  consumed          boolean not null default false,       -- carry already applied to a later log
  consumed_by       uuid references public.payment_logs (id) on delete set null,
  note              text not null default '',
  created_at        timestamptz not null default now()
);

create index payment_logs_user_id_idx   on public.payment_logs (user_id);
create index payment_logs_created_at_idx on public.payment_logs (created_at);

alter table public.payment_logs enable row level security;

-- Borrowers read their own logs; admin reads all. Only admin writes.
create policy "payment_logs: read own or admin" on public.payment_logs
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "payment_logs: admin write" on public.payment_logs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Audit actions for the append-only log (PG15 permits ADD VALUE here because
-- the new values are not USED within this same migration).
alter type public.audit_action add value if not exists 'PAYMENT_LOG_CREATED';
alter type public.audit_action add value if not exists 'PAYMENT_LOG_DELETED';
