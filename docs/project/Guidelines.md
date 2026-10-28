# User and Developer Guidelines

Reviewed October 27, 2026.

Security configuration, quotas, accepted Login Code policy, pending MFA and native release requirements are maintained in [Security.md](Security.md), reviewed October 28, 2026. Run its verification gates before publishing security changes.

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

In Reports & Logs, distinguish archive/restore from permanent purge. Hiding Payment Breakdown is not a payment reversal. The grid archive flow displays a review confirmation and waits for persistence before hiding records; verify the exact selected count and items before confirming. An allocated due with an unpaid remainder cannot be archived.

## Developer guide

Published task guidance lives in `public/faq-knowledge.json` and is shared by the borrower FAQ and Pawcheebels reference service. Its October 28 expansion contains 160 guides across 13 topics, numbered procedures, seven illustrative SVG diagrams and distinct lender walkthroughs. Preserve stable FAQ IDs when changing wording. Structured summary/steps/notes must remain consistent with the plain-text answer consumed by the assistant. Illustrations use synthetic sample values and must not embed real borrower information. The screen progressively reveals questions instead of mounting all answers at first load. Existing Filipino guides remain available; newly added guides are labelled as English when no reviewed translation exists. Update `public/locales/filipino-content.json`, its source string dictionary and generated locale payload together when revising translated FAQ answers.

Admins manage Cash Loan, Fees and Adjustments artwork in Settings → Group logos or Transactions → Group logos. Upload SVG (up to 128 KB) or transparent PNG (up to 2 MB), review its preview and confirm the shared change. Ordinary class-based SVG colours/styles are supported; complex SVG effects can be exported as PNG instead. PNG transparency is retained and artwork is optimized automatically. The artwork automatically follows the current group on all applicable borrower transaction views. Retail groups continue to use Brandfetch. Replacing/removing a group logo does not archive records, change amounts or create payments/credit.

Use Node and the exact package lock, documented public build flags and separate isolated test credentials. VITE values are public. Store privileged keys, database URIs, bot tokens and SMTP/AI secrets only in approved secret configuration; never in docs, exports, screenshots or commit history.

Trace requirements to routes, providers, service handlers, RPCs and tests. Preserve idempotency keys and expected-state validation. Never bypass RLS by adding a privileged public function to solve a UI error. Frame-origin checks complement, rather than replace, server authorization.

Update the appropriate canonical document and tests in the same feature change. The Documentation build fingerprint/inventory is regenerated, but narrative content and captured schema still need human review. Use public/legal-content.json for policy edits so public, borrower and Documentation views remain aligned.

## Deployment and recovery
Build/check first, then obtain required review for the exact production action. Use protected hosted Chrome acceptance and preserve deployment protection. Financial repair, migration, release promotion and borrower enablement are separate scopes. A UI rollback does not undo posted funds; use a reviewed reconciliation/recovery procedure.

## Managing custom artwork

Open Transactions → Brand logos, select one or more retail items, then use Upload SVG or PNG when a brand search has no suitable result. Review the preview, logo name and selected items before assigning. Use automatic returns to normal matching; Remove logo suppresses the target logo. Installment choices apply to the linked loan. These controls are separate from archiving/deleting transactions.

Open Group logos (also available in Settings) to upload a shared Cash Loan, Fees, Adjustments or Payment Proof Submitted image. The proof image appears in borrower Recent Activity and the separate submission-history section. SVG and transparent PNG use the same validation as retail uploads. Replacing/removing artwork changes presentation only.

Switches state the current effect rather than the next action. If a save is pending or delivery is unavailable, read its feedback before assuming the feature is active. Search borders animate only in the admin workspace and become still when reduced motion is requested.
