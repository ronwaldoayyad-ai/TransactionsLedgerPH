-- ============================================================================
-- LoanLedger PH — Migration 009: one-time cleanup of stale Date Paid
--
-- Enforces the invariant that only "paid" / "refunded" transactions carry a
-- payment date. Any unpaid / past due / cancelled row that still has a
-- date_paid (created before the constraint, or via an older code path) is
-- cleared. Safe and idempotent — re-running affects nothing once clean.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

update public.transactions
set date_paid = null
where status in ('unpaid', 'past_due', 'cancelled')
  and date_paid is not null;
