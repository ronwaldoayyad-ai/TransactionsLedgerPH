-- ============================================================================
-- Move the "Statement Ready" automation from a DB trigger to the client
-- ----------------------------------------------------------------------------
-- The notification now needs to carry the generated invoice PDF as an attachment,
-- which a Postgres trigger cannot produce (the PDF is rendered client-side with
-- jsPDF). So the admin Invoices page now creates the notification — with the PDF
-- attached — when it assigns an invoice. Drop the trigger from
-- 20260905000000_invoice_assigned_notification.sql to avoid duplicate,
-- attachment-less notifications.
-- ============================================================================

drop trigger if exists invoices_notify_assigned on public.invoices;
drop function if exists public.notify_invoice_assigned();
