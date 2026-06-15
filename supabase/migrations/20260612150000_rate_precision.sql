-- ============================================================================
-- LoanLedger PH — Migration 004: monthly rate precision
--
-- monthly_rate stores the FRACTION (1.8934% = 0.018934). The original
-- numeric(6,4) kept only 4 fractional digits, silently rounding 0.018934 to
-- 0.0189 (= 1.8900%). Widening to numeric(8,6) preserves rates entered with
-- up to 4 decimal places of the percentage, matching the UI.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- Note: rates saved before this migration were already rounded and cannot be
-- recovered — re-assign those loans if the lost precision matters.
-- ============================================================================

alter table public.loans
  alter column monthly_rate type numeric(8,6);
