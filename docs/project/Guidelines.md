# User and Developer Guidelines

Reviewed October 26, 2026.

## Borrower guide
- Dashboard: switch Current/Next Balance Due and inspect the matching breakdown. Credit advice appears only when account credit exists.
- Transactions: use search, sort and group/status filters. Installment Cards is the default; open a schedule for fees, progress and status. Straight Retail, Fees and Adjustments use pills within the existing grouping.
- Payments: select positive dues, upload/replace a proof of at most 5 MB, verify OCR and formatted amount/date/reference, then submit. Recent Payments shows five initially with date sorting and Show more.
- Documents: Proof is the uploaded evidence; Receipt is the associated acknowledgement; Confirmation records submission and later approval status/time. Submission does not itself verify funds.
- Contact: use Message lender for human account assistance; Pawcheebels provides reference/AI help within its limits. Request a Loan appears only when enabled for your account.
- Account trouble: follow the displayed support/unlock reference. Do not send passwords or Login Codes in messages.

## Administrator guide
Review the borrower and selected items before any amount, status, group, fee or credit change. Use the reviewed allocation workflow for funds. Changing a loan's installment category affects its linked schedule. Brand logos manages presentation metadata only; use Needs review for ambiguous descriptions and explicit selection for bulk association.

Use the per-borrower Loan Requests switch to show/hide access. Borrowers → View as borrower includes Return to Admin. Settings controls New/Classic release access and configured integrations. Notification Sent & linking offers borrower/category/subject filters and deletion controls; read/reply interactions are handled by the underlying service.

In Reports & Logs, distinguish archive/restore from permanent purge. Hiding Payment Breakdown is not a payment reversal. The current grid bulk archive control lacks a dedicated confirmation; verify the selected count before using that separate action.

## Developer guide
Use Node and the exact package lock, documented public build flags and separate isolated test credentials. VITE values are public. Store privileged keys, database URIs, bot tokens and SMTP/AI secrets only in approved secret configuration; never in docs, exports, screenshots or commit history.

Trace requirements to routes, providers, service handlers, RPCs and tests. Preserve idempotency keys and expected-state validation. Never bypass RLS by adding a privileged public function to solve a UI error. Frame-origin checks complement, rather than replace, server authorization.

Update the appropriate canonical document and tests in the same feature change. The Documentation build fingerprint/inventory is regenerated, but narrative content and captured schema still need human review. Use public/legal-content.json for policy edits so public, borrower and Documentation views remain aligned.

## Deployment and recovery
Build/check first, then obtain required review for the exact production action. Use protected hosted Chrome acceptance and preserve deployment protection. Financial repair, migration, release promotion and borrower enablement are separate scopes. A UI rollback does not undo posted funds; use a reviewed reconciliation/recovery procedure.
