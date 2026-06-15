-- ============================================================================
-- LoanLedger PH — Migration 008: admin can upload proofs for any borrower
--
-- When an admin submits a proof while "viewing as" a borrower, the file is
-- stored under the BORROWER's folder (so it belongs to the borrower, not the
-- admin). The base "upload to own folder" policy would reject that because the
-- folder != the admin's uid, so admins need an explicit any-folder upload
-- policy. The payments-table insert was already allowed for admins.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create policy "proofs: admin upload any" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-proofs' and public.is_admin());
