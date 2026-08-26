-- ============================================================================
-- LoanLedger PH — Migration: Payment Due override (Next Payment Due tile)
--
-- Server-side home for the admin's "Payment Due" control. The admin picks a set
-- of borrowers and due dates on /admin/payment-due; every targeted borrower's
-- "Next Payment Due" dashboard tile then sums only their receivable
-- installments landing on those dates, instead of the default auto-calc.
--
-- WHY A TABLE (not localStorage): the admin and borrowers use different
-- devices/sessions, so the choice must live on the server to reach them.
--
-- Singleton: a single active override at a time (matches the one-Apply UI). The
-- boolean primary key pinned to true guarantees at most one row; the app
-- upserts on id = true.
--
--   all_borrowers = true  -> the override targets every borrower (borrower_ids
--                            is ignored); otherwise it targets borrower_ids.
--   due_dates     = ISO 'YYYY-MM-DD' strings, stored as text[] to mirror the
--                   app's config object exactly (no date-coercion surprises).
--
-- RLS: any authenticated user may READ it (a borrower needs to see the override
-- that targets them); only an admin may WRITE it.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- ============================================================================

create table if not exists public.payment_due_config (
  id             boolean primary key default true,
  all_borrowers  boolean     not null default false,
  borrower_ids   text[]      not null default '{}',
  due_dates      text[]      not null default '{}',
  applied_at     timestamptz not null default now(),
  updated_by     uuid,
  constraint payment_due_config_singleton check (id)
);

alter table public.payment_due_config enable row level security;

-- Borrowers must be able to read the override that targets them.
drop policy if exists "payment_due_config: read for authenticated" on public.payment_due_config;
create policy "payment_due_config: read for authenticated"
  on public.payment_due_config
  for select to authenticated
  using (true);

-- Only the admin may set, change, or clear the override.
drop policy if exists "payment_due_config: admin write" on public.payment_due_config;
create policy "payment_due_config: admin write"
  on public.payment_due_config
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
