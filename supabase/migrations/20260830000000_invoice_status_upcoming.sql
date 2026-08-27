-- Add "Upcoming" as an assignable invoice status. The borrower-facing label for
-- the existing 'partial' status also changes to "Partially Paid", but that is a
-- display-only rename (the stored value stays 'partial'), so no data change is
-- needed for it — only the new 'upcoming' value must be allowed by the CHECK.
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('draft', 'assigned', 'upcoming', 'settled', 'past_due', 'partial'));
