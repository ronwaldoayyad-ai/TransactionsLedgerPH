-- ============================================================================
-- Notification templates: admin-managed presets for the notification composer
-- ----------------------------------------------------------------------------
-- Mirrors public.announcement_templates. The admin can create, edit, and delete
-- these from the Notifications composer ("Manage templates" / "Save as template").
-- Seeded with the presets that were previously hardcoded in
-- src/lib/notificationTemplates.js so nothing is lost; created_by is null for
-- those built-ins (nullable, unlike announcement_templates, so the migration can
-- seed them without an authenticated user).
-- ============================================================================

create table public.notification_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  category   text not null default 'general' check (category in ('payment', 'document', 'account', 'general')),
  title      text not null default '',
  body       text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index notification_templates_created_idx on public.notification_templates (created_at desc);

alter table public.notification_templates enable row level security;

-- The admin authors and manages every template; borrowers never see this table.
create policy "notification_templates: admin all" on public.notification_templates
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Seed with the former hardcoded presets (built-ins, created_by = null).
insert into public.notification_templates (name, category, title, body) values
  ('Payment Received', 'payment', '💰 Payment Received', 'Your payment of ₱[amount] has been received successfully. Thank you!'),
  ('Payment Due Reminder', 'payment', '⏰ Payment Due Reminder', 'Reminder: Your payment of ₱[amount] is due on [date]. Please ensure sufficient funds.'),
  ('Payment Failed', 'payment', '❌ Payment Failed', 'Your recent payment attempt of ₱[amount] failed. Please update your payment method and try again.'),
  ('Payment Scheduled', 'payment', '📅 Payment Scheduled', 'A payment of ₱[amount] has been scheduled for [date]. You will be notified once processed.'),
  ('Payment Receipt', 'payment', '🧾 Payment Receipt', 'Here is your receipt for payment of ₱[amount] on [date]. Transaction ID: [id].'),
  ('Auto-Pay Enabled', 'payment', '🔁 Auto-Pay Enabled', 'Auto-pay has been enabled for your account. Future payments will be processed automatically on their due dates.'),
  ('Insufficient Funds', 'payment', '⚠️ Insufficient Funds', 'Your payment could not be completed due to insufficient funds. Please add funds to your account.'),
  ('Payment Confirmation', 'payment', '✅ Payment Confirmation', 'Your payment of ₱[amount] has been confirmed. Outstanding balance: ₱[balance].'),
  ('Document Request', 'document', '📄 Document Request', 'We need you to upload the following document(s) to proceed: [list]. Please upload by [date].'),
  ('Document Uploaded', 'document', '📑 Document Uploaded', 'Your document [name] has been uploaded successfully and is pending review.'),
  ('Document Approved', 'document', '✅ Document Approved', 'Great news! Your document [name] has been approved.'),
  ('Document Rejected', 'document', '❌ Document Rejected', 'Your document [name] was rejected. Reason: [reason]. Please upload a corrected version.'),
  ('Document Under Review', 'document', '⏳ Document Under Review', 'Your document [name] is under review. This typically takes 1–2 business days.'),
  ('Document Reminder', 'document', '🔔 Document Reminder', 'Reminder: We are still waiting for the following document(s): [list]. Please upload them to avoid delays.'),
  ('Document Expiring Soon', 'document', '🗂️ Document Expiring Soon', 'Your document [name] will expire on [date]. Please upload an updated version.'),
  ('Password Changed', 'account', '🔐 Password Changed', 'Your password has been changed successfully. If this wasn''t you, contact support immediately.'),
  ('Email Verified', 'account', '✅ Email Verified', 'Your email address has been verified. You can now access all features.'),
  ('New Login Detected', 'account', '⚠️ New Login Detected', 'We noticed a new login to your account from [device/location]. If this wasn''t you, secure your account.'),
  ('Verification Code', 'account', '📧 Verification Code', 'Your verification code is: [code]. It expires in 10 minutes.'),
  ('Profile Updated', 'account', '👤 Profile Updated', 'Your profile information has been updated successfully.'),
  ('Two-Factor Enabled', 'account', '🔒 Two-Factor Enabled', 'Two-factor authentication has been enabled for your account. Keep your backup codes safe.'),
  ('Account Suspended', 'account', '⛔ Account Suspended', 'Your account has been temporarily suspended due to [reason]. Contact support for assistance.'),
  ('Welcome!', 'account', '🎉 Welcome!', 'Welcome to [Product Name]! Your account has been created. Complete your profile to get started.'),
  ('System Maintenance', 'general', '📢 System Maintenance', 'We will be performing scheduled maintenance on [date] from [start] to [end]. Some services may be unavailable.'),
  ('Policy Update', 'general', 'ℹ️ Policy Update', 'We have updated our [policy name]. Please review the changes by [date].'),
  ('Loan Offer Available', 'general', '🎯 Loan Offer Available', 'You are pre‑qualified for a loan of up to ₱[amount]. Apply now to lock in your rate.'),
  ('New Message', 'general', '💬 New Message', 'You have a new message from [lender/borrower]. Tap to view.'),
  ('Reminder: Action Needed', 'general', '🔔 Reminder: Action Needed', 'Action required: Please [action] by [date] to keep your application moving.'),
  ('Application Approved', 'general', '✅ Application Approved', 'Congratulations! Your loan application has been approved for ₱[amount].'),
  ('Application Denied', 'general', '❌ Application Denied', 'We regret to inform you that your application was not approved at this time. Reason: [reason].'),
  ('Statement Ready', 'general', '📊 Statement Ready', 'Your monthly statement for [period] is now available for review.');

-- Live delivery not needed (admin-only table); the composer refetches on change.
