-- ============================================================================
-- LoanLedger PH — Migration 014: Payment Logs "Credited" status + edit support
--
-- 1. Adds a fourth allocation status, "Credited" (admin-assignable), to the
--    payment_logs allocation enum. The three computed statuses remain
--    (Settled / Overpayment / Underpayment); "Credited" is set manually by the
--    admin when editing a log.
-- 2. Adds a PAYMENT_LOG_UPDATED audit action for the new edit capability.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter type public.pay_log_alloc add value if not exists 'Credited';
alter type public.audit_action  add value if not exists 'PAYMENT_LOG_UPDATED';
