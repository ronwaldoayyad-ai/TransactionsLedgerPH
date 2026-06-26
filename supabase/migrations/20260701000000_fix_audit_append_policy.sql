-- ============================================================================
-- LoanLedger PH — Migration 025: restore audit_log append policy
--
-- Fixes "new row violates row-level security policy for table audit_log" seen
-- when a borrower submits a proof of payment (the action writes a best-effort
-- audit entry). The original schema granted authenticated users INSERT on
-- audit_log; this re-creates it idempotently in case it's missing or was
-- dropped. Reads stay admin-only; updates/deletes stay denied.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.audit_log enable row level security;

drop policy if exists "audit: authenticated append" on public.audit_log;
create policy "audit: authenticated append" on public.audit_log
  for insert to authenticated with check (true);
