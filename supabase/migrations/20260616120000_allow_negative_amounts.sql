-- ============================================================================
-- LoanLedger PH — Migration 010: allow negative amounts (overpayments)
--
-- Straight transactions may now carry a NEGATIVE amount to record an
-- overpayment credit that reduces the total due. The original CHECK
-- constraints (principal > 0, amount >= 0) are relaxed to disallow only zero.
-- The app still restricts negative entry to straight (single-payment) records;
-- installment amounts remain positive in practice.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.loans drop constraint if exists loans_principal_check;
alter table public.loans add constraint loans_principal_check check (principal <> 0);

alter table public.transactions drop constraint if exists transactions_amount_check;
alter table public.transactions add constraint transactions_amount_check check (amount <> 0);
