// Preset notification templates, grouped by category. The admin composer's
// "Start from a template" dropdown lists the entries for the selected category
// and fills the title + message fields. Placeholders in square brackets
// (e.g. [amount], [date]) are meant to be edited before sending.
export const NOTIFICATION_TEMPLATES = {
  payment: [
    { title: '💰 Payment Received', message: 'Your payment of ₱[amount] has been received successfully. Thank you!' },
    { title: '⏰ Payment Due Reminder', message: 'Reminder: Your payment of ₱[amount] is due on [date]. Please ensure sufficient funds.' },
    { title: '❌ Payment Failed', message: 'Your recent payment attempt of ₱[amount] failed. Please update your payment method and try again.' },
    { title: '📅 Payment Scheduled', message: 'A payment of ₱[amount] has been scheduled for [date]. You will be notified once processed.' },
    { title: '🧾 Payment Receipt', message: 'Here is your receipt for payment of ₱[amount] on [date]. Transaction ID: [id].' },
    { title: '🔁 Auto-Pay Enabled', message: 'Auto-pay has been enabled for your account. Future payments will be processed automatically on their due dates.' },
    { title: '⚠️ Insufficient Funds', message: 'Your payment could not be completed due to insufficient funds. Please add funds to your account.' },
    { title: '✅ Payment Confirmation', message: 'Your payment of ₱[amount] has been confirmed. Outstanding balance: ₱[balance].' },
  ],
  document: [
    { title: '📄 Document Request', message: 'We need you to upload the following document(s) to proceed: [list]. Please upload by [date].' },
    { title: '📑 Document Uploaded', message: 'Your document [name] has been uploaded successfully and is pending review.' },
    { title: '✅ Document Approved', message: 'Great news! Your document [name] has been approved.' },
    { title: '❌ Document Rejected', message: 'Your document [name] was rejected. Reason: [reason]. Please upload a corrected version.' },
    { title: '⏳ Document Under Review', message: 'Your document [name] is under review. This typically takes 1–2 business days.' },
    { title: '🔔 Document Reminder', message: 'Reminder: We are still waiting for the following document(s): [list]. Please upload them to avoid delays.' },
    { title: '🗂️ Document Expiring Soon', message: 'Your document [name] will expire on [date]. Please upload an updated version.' },
  ],
  account: [
    { title: '🔐 Password Changed', message: "Your password has been changed successfully. If this wasn't you, contact support immediately." },
    { title: '✅ Email Verified', message: 'Your email address has been verified. You can now access all features.' },
    { title: '⚠️ New Login Detected', message: "We noticed a new login to your account from [device/location]. If this wasn't you, secure your account." },
    { title: '📧 Verification Code', message: 'Your verification code is: [code]. It expires in 10 minutes.' },
    { title: '👤 Profile Updated', message: 'Your profile information has been updated successfully.' },
    { title: '🔒 Two-Factor Enabled', message: 'Two-factor authentication has been enabled for your account. Keep your backup codes safe.' },
    { title: '⛔ Account Suspended', message: 'Your account has been temporarily suspended due to [reason]. Contact support for assistance.' },
    { title: '🎉 Welcome!', message: 'Welcome to [Product Name]! Your account has been created. Complete your profile to get started.' },
  ],
  general: [
    { title: '📢 System Maintenance', message: 'We will be performing scheduled maintenance on [date] from [start] to [end]. Some services may be unavailable.' },
    { title: 'ℹ️ Policy Update', message: 'We have updated our [policy name]. Please review the changes by [date].' },
    { title: '🎯 Loan Offer Available', message: 'You are pre‑qualified for a loan of up to ₱[amount]. Apply now to lock in your rate.' },
    { title: '💬 New Message', message: 'You have a new message from [lender/borrower]. Tap to view.' },
    { title: '🔔 Reminder: Action Needed', message: 'Action required: Please [action] by [date] to keep your application moving.' },
    { title: '✅ Application Approved', message: 'Congratulations! Your loan application has been approved for ₱[amount].' },
    { title: '❌ Application Denied', message: 'We regret to inform you that your application was not approved at this time. Reason: [reason].' },
    { title: '📊 Statement Ready', message: 'Your monthly statement for [period] is now available for review.' },
  ],
}

export const templatesForCategory = (category) => NOTIFICATION_TEMPLATES[category] ?? []
