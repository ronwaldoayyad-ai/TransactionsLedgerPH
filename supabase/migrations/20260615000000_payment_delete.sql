-- ============================================================================
-- LoanLedger PH — Migration 007: delete proof of payment
--
-- Both borrowers and admins can now permanently delete a proof of payment
-- (the payment row + its storage object).
--   1. payments: borrowers may delete their own rows (admins already can).
--   2. storage: borrowers may delete their own proof files (admins already can).
--   3. PAYMENT_DELETED audit action.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- 1. Borrowers can delete their own payment rows
create policy "payments: borrower delete own" on public.payments
  for delete to authenticated using (user_id = auth.uid());

-- 2. Borrowers can delete their own proof files (folder named after their uid).
--    The admin-delete policy from migration 001 stays in place.
create policy "proofs: borrower delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. New audit action
alter type public.audit_action add value if not exists 'PAYMENT_DELETED';
