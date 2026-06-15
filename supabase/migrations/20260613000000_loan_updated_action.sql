-- ============================================================================
-- LoanLedger PH — Migration 006: LOAN_UPDATED audit action
--
-- The admin can now edit a loan's disclosure-statement fields (via "View as
-- borrower"). Those edits write a LOAN_UPDATED audit entry, so the enum needs
-- the new value.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter type public.audit_action add value if not exists 'LOAN_UPDATED';
