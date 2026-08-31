-- ============================================================================
-- LoanLedger PH — Borrower self-notifications
--
-- Allows an authenticated user to INSERT a notification addressed ONLY to
-- themselves. This backs the client-side "acceptance confirmation" sent when a
-- borrower accepts a Loan Disbursement agreement: the confirmation carries the
-- ACCEPTED copy of the PDF (rendered with jsPDF, showing the acceptance date and
-- time), which a Postgres trigger cannot produce — so the borrower's browser
-- renders it and writes the notification directly.
--
-- Scoped tightly so a user can NEVER notify anyone else:
--   * created_by must be the caller,
--   * audience must be 'targeted',
--   * target_user_ids must be exactly [the caller].
-- Admin-authored notifications are still covered by the existing admin policy.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- ============================================================================

drop policy if exists "notifications: self insert" on public.notifications;
create policy "notifications: self insert" on public.notifications
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and audience = 'targeted'
    and target_user_ids = array[auth.uid()]
  );
