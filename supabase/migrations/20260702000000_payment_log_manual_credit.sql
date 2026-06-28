-- ============================================================================
-- LoanLedger PH — Migration: Payment Logs "Manual Credit" method
--
-- The app's Payment Method options (PAY_LOG_METHODS) include "Manual Credit" —
-- used when a borrower's overpayment is credited against their amount due
-- rather than received as new funds. The `pay_log_method` enum, however, was
-- only ever created with the four original values
-- ('GCash', 'Maya', 'Bank Transfer', 'Cash'), so any insert/update that sets
-- method = 'Manual Credit' is rejected by Postgres
-- ("invalid input value for enum pay_log_method"). The error was silently
-- logged, leaving the record unchanged in the database (e.g. editing a log's
-- method to "Manual Credit" appeared to save but reverted on refresh).
--
-- This adds the missing value so the enum matches the application.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter type public.pay_log_method add value if not exists 'Manual Credit';
