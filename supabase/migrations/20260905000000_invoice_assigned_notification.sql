-- ============================================================================
-- Automation: "Statement Ready" notification when an invoice is assigned
-- ----------------------------------------------------------------------------
-- When an admin generates and assigns an invoice to a borrower (the invoice
-- enters status 'assigned' — the point at which the borrower can see it), send
-- that borrower the "Statement Ready" notification. The template's [period]
-- variable is derived from the invoice Due Date (its month + year, falling back
-- to the invoice date when no due date is set).
--
-- Fires once on entering 'assigned' (a draft->assigned update, or an invoice
-- inserted already assigned) and not on later edits that keep it assigned.
-- Targeted to the borrower only (target_user_ids = [invoice owner]); runs as
-- SECURITY DEFINER because the notifications RLS restricts INSERT to admins.
-- ============================================================================

create or replace function public.notify_invoice_assigned()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'assigned' and (tg_op = 'INSERT' or old.status is distinct from 'assigned') then
    insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (
      'general',
      '📊 Statement Ready',
      'Your monthly statement for '
        || to_char(coalesce(new.due_date, new.invoice_date), 'FMMonth YYYY')
        || ' is now available for review.',
      'targeted',
      array[new.user_id],
      coalesce(auth.uid(), new.user_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_notify_assigned on public.invoices;
create trigger invoices_notify_assigned
  after insert or update on public.invoices
  for each row execute function public.notify_invoice_assigned();
