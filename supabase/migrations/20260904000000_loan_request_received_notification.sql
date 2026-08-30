-- ============================================================================
-- Automation: "Loan Request Received" notification on loan-request submission
-- ----------------------------------------------------------------------------
-- When a borrower submits a new loan request (INSERT into public.loan_requests),
-- send them the "Loan Request Received" notification with the requested amount
-- filled into the template's [amount] variable.
--
-- Runs as SECURITY DEFINER because the notifications RLS restricts INSERT to
-- admins. Depends on the notification_templates table (migration 20260903...);
-- the template row it seeds mirrors the "Loan Request Received" preset added to
-- src/lib/notificationTemplates.js so the admin composer offers it too.
-- ============================================================================

-- Make the template available in the admin composer (skip if already present).
insert into public.notification_templates (name, category, title, body)
select 'Loan Request Received', 'general', '📝 Loan Request Received',
       'We''ve received your loan request for ₱[amount]. Our team will review it and update you on the status soon.'
where not exists (
  select 1 from public.notification_templates where name = 'Loan Request Received'
);

create or replace function public.notify_loan_request_received()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
  values (
    'general',
    '📝 Loan Request Received',
    'We''ve received your loan request for ₱'
      || to_char(new.amount, 'FM999,999,999,999,990.00')
      || '. Our team will review it and update you on the status soon.',
    'targeted',
    array[new.user_id],
    new.user_id
  );
  return new;
end;
$$;

drop trigger if exists loan_requests_notify_received on public.loan_requests;
create trigger loan_requests_notify_received
  after insert on public.loan_requests
  for each row execute function public.notify_loan_request_received();
