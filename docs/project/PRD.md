# Project Requirements and Scope Documentation

Reviewed October 26, 2026. This describes the web application in the accompanying build; it is not a promise of future functionality.

## Purpose and users
LoanLedger PH supports borrower account servicing and lender operations. Borrowers need understandable balances, payment evidence, schedules and communication. Authorized administrators need controlled record maintenance, review and reporting. Guests can access legal notices and supported account-recovery channels.

## Included in the current product
- Admin workspace: overview, borrowers, payment review, payment due, editable transactions, payment history, loan calculator, fees and billing, loan requests, loan tracking, disbursements, invoices, messages, support, announcements, notifications, portfolio, cards and bills, interest/arbitrage, reports/logs, settings and this Documentation tab.
- Borrower workspace: dashboard, current/next balance views, transaction breakdown, Cash Loan and Retail Installment Cards/List and schedules, straight-transaction group pills, Payments, History, loan requests when enabled, documents, messages, notifications, profile, support and Pawcheebels.
- Account controls: password and Login Code routes, account/device lock handling, lender access overrides, explicit email-confirmation override, borrower preview with Return to Admin, and controlled New/Classic release access.
- Reviewed accounting: positive/negative manual entries, loan-linked entries, partial allocation, excess credit, account-credit application, corrections and reversals, assessed fees, and display-only payment breakdowns.
- Brand logos: automatic clear retail matches, ambiguity review, individual/bulk manual association and borrower display across cards, transactions, breakdown, activity and history.
- Communication: live message/record invalidation, notification rules and sent-item management, and optional Telegram alerts for new proofs and borrower messages.

## Boundaries
Proof submission and OCR do not settle debt. Fee calculations require lender confirmation; there is no unattended monthly financial posting. Loan requests require per-borrower enablement and lender processing. Pawcheebels cannot approve loans, verify payments, alter balances or perform account actions.

The New borrower interface is responsive web presentation hosted inside the React app. Classic remains a controlled fallback. Separate Expo/mobile source does not imply a newly shipped app-store build. Native download/share, keyboard and gesture behavior depend on browser capabilities.

## Acceptance and change control
Requirements must be traceable to the User Flow, SRS, design and testing sections. Build routes, packages, source fingerprint and database catalog appear in this Documentation tab. A current reference does not replace hosted acceptance, accounting reconciliation or owner approval for production financial changes.

## Implementation references
- src/App.jsx
- src/components/admin/workspaceNavigation.js
- src/components/VersionedBorrower.jsx
- public/borrower-v4.12.24.html
- src/context/AppContext.jsx
