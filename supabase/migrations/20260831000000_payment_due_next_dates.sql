-- ============================================================================
-- LoanLedger PH — Migration: second pinned due-date set for "Next Payment Due"
--
-- The borrower dashboard now shows two swipeable cards: Current and Next Payment
-- Due. Each is driven by an admin-pinned set of due dates on the borrower's
-- payment_due_overrides row:
--   due_dates      -> the CURRENT card (unchanged)
--   next_due_dates -> the NEXT card (new). When empty, the borrower sees only
--                     the Current card.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.
-- ============================================================================

alter table public.payment_due_overrides
  add column if not exists next_due_dates text[] not null default '{}';
