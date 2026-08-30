-- ============================================================================
-- Automation: "Payment Received" notification on proof-of-payment submission
-- ----------------------------------------------------------------------------
-- When a borrower submits a proof of payment (INSERT into public.payments), send
-- them the "Payment Received" notification, filling the submitted amount into the
-- template's [amount] variable. Body/title mirror the "Payment Received" entry in
-- src/lib/notificationTemplates.js.
--
-- Runs as SECURITY DEFINER: the notifications RLS restricts INSERT to admins, so
-- the trigger creates the borrower-facing notification on their behalf. The
-- notification is targeted to the borrower (target_user_ids = [payer]) and reaches
-- them through the existing realtime delivery on public.notifications.
-- ============================================================================

create or replace function public.notify_payment_received()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
  values (
    'payment',
    '💰 Payment Received',
    'Your payment of ₱'
      || to_char(new.amount, 'FM999,999,999,990.00')
      || ' has been received successfully. Thank you!',
    'targeted',
    array[new.user_id],
    new.user_id
  );
  return new;
end;
$$;

drop trigger if exists payments_notify_received on public.payments;
create trigger payments_notify_received
  after insert on public.payments
  for each row execute function public.notify_payment_received();
