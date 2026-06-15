-- ============================================================================
-- LoanLedger PH — Migration 003: CSV imports + permanent deletes
--
-- 1. CSV-imported ledger records have no parent loan → loan_id becomes
--    nullable (the FK still applies when present).
-- 2. Permanent deletion of archived ledger records and audit entries
--    (admin-only) → audit_log needs a delete policy.
-- 3. New audit action codes for these operations.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- 1. Imported ledger rows stand alone (no loan)
alter table public.transactions alter column loan_id drop not null;

-- 2. Admin may permanently delete audit entries (no update policy — the log
--    stays immutable otherwise)
create policy "audit: admin delete" on public.audit_log
  for delete to authenticated using (public.is_admin());

-- 3. New audit action codes
alter type public.audit_action add value if not exists 'TXN_IMPORTED';
alter type public.audit_action add value if not exists 'TXN_PURGED';
alter type public.audit_action add value if not exists 'AUDIT_PURGED';
