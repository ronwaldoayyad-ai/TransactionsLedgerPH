-- ============================================================================
-- LoanLedger PH — Migration 028: Allow admins to delete loan requests
--
-- Adds a DELETE policy so the admin can remove loan requests (one by one or in
-- bulk) from the Loan Request Approval table. Events cascade via the existing
-- `on delete cascade` FK on loan_request_events.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create policy "loan requests: admin delete" on public.loan_requests
  for delete to authenticated using (public.is_admin());
