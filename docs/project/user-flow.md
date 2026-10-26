# User Flow

Reviewed October 26, 2026. Diagrams show implemented decision points; optional services depend on configuration.

## Sign-in and interface selection
[diagram:access]

1. Open the shared sign-in page. Enter email/password or the lender-issued Login Code.
2. The login service checks account/device restrictions. Locked accounts show support and access-check actions; blocked input cannot be used.
3. Admins enter their workspace. Borrowers resolve to their assigned New or Classic interface through Release access.
4. Admin View as borrower changes the presentation context and retains Return to Admin. It does not transfer credentials between origins.
5. Account setup, disabled profiles and unresolved release access take their guarded paths rather than granting borrower/admin privileges.

## Borrower payment and lender review
[diagram:payment]

1. Review current or next dues and their itemized breakdown.
2. In Payments, select eligible positive payable items, upload a proof of at most 5 MB, or replace the image before submission. OCR assists entry; verify amount, date, reference and channel.
3. Review formatted amounts and requested allocations. Submit once, retaining retry identity when a request is retried.
4. The saved proof is pending review. Submission confirmation is downloadable; it is not proof of settled funds.
5. The lender reviews allocation against outstanding dues and available credit. Partial payments and excess credit must be explicitly reviewed.
6. Approved/posting state updates balances and history. Approved confirmation displays its approval timestamp; Proof, Receipt and Confirmation remain distinct.
7. Rejected proofs can be corrected through the supported retry flow. Pending proofs can be withdrawn where permitted.

## Loan request
When enabled by the lender's borrower switch, Request a Loan appears in borrower navigation/shortcuts. Enter the formatted amount, available term, purpose and bank details, review disclosure and accept the required confirmations. Submit for lender review. The timeline and notifications reflect recorded workflow events; submission alone is not approval or disbursement.

## Combined fee assessment
Select the borrower and As of date. Pending dates on or before that date are initially included; edit dates and individual entries. Review the net remaining selected balance, including eligible unpaid prior fees and negative ledger adjustments. Enable/edit the finance rate (default 3%) and a single late fee (default ₱1,500) for the combined selection, set the new due date and confirm posting. Multiple assessments in a month require separate explicit confirmation. Descriptions reference the As of date.

## Communication and recovery
Borrower/lender messages and ledger changes trigger targeted updates without a manual refresh. Notification rules can generate supported app messages. Configured Telegram delivery supplements existing notifications. Locked sign-in support captures the issue context and screenshot for the ticket where capture is available. Support-tracking email verification depends on configured delivery capabilities.
