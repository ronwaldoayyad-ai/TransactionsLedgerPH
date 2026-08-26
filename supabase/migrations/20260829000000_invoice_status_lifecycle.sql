-- Invoice status lifecycle: an assigned invoice can now be marked Settled, Past
-- Due, or Partial by an admin. The borrower sees the status (read-only) but can
-- only ever see their own NON-DRAFT invoices, so widening the read policy from
-- status = 'assigned' to status <> 'draft' keeps drafts admin-only.

-- Widen the allowed statuses. The inline CHECK from the initial invoices
-- migration is auto-named invoices_status_check.
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'assigned', 'settled', 'past_due', 'partial'));

-- Borrowers see ONLY their own non-draft invoices; admins see everything.
drop policy if exists "invoices: read own assigned or admin" on public.invoices;
create policy "invoices: read own assigned or admin" on public.invoices
  for select to authenticated
  using ((user_id = auth.uid() and status <> 'draft') or public.is_admin());
