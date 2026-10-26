# Software Requirements Specification

Reviewed October 26, 2026. Requirements describe current behavior and its verification boundary.

## Functional requirements
| ID | Requirement | Acceptance |
| --- | --- | --- |
| S01 | Role and account isolation | Borrowers cannot enter admin routes or read another account through direct calls. |
| S02 | Shared sign-in and lock controls | Supported login methods respect access controls; remaining attempts and support states are explicit. |
| S03 | Balances and transaction grouping | Current/next views use matching items; installment and straight grouping follows saved categories. |
| S04 | Proof submission | Maximum 5 MB, positive payable selection only, editable image, reviewed fields and durable submission confirmation. |
| S05 | Reviewed payment accounting | Allocations, partial payment and credit use explicit review and idempotent operations. |
| S06 | Transaction corrections | Admin can review editable fields; excess allocation returns to the same owner's credit and paid ownership changes require reversal. |
| S07 | Combined fees | Inclusive As of filter, editable date/item selection, net remaining base, independent rate/late-fee toggles, new due date and explicit posting. |
| S08 | Loan requests | Lender-controlled per-borrower switch controls visibility; processing follows recorded request states. |
| S09 | Live communication | Messages, notifications, due changes and transaction changes refresh affected borrower data without a full-page reload. |
| S10 | Notification administration | Rules/canvas, categories, sent-item filters/linking, individual/bulk deletion and rule restoration follow current tools. |
| S11 | Documents | Proof, receipt and confirmation differ; approval updates confirmation status and approval time. |
| S12 | Shared branding | Clear retail matches auto-resolve; uncertain matches need review; manual choices apply to their record/loan and reach borrowers. |
| S13 | Documentation | Fourteen sections, current build inventory, schema metadata, search, navigation, print and Markdown export. |

## Runtime and interface contract
The exact package versions and registered routes are generated from this build below. Node/Vite build the web app; Vercel serves the app/API; Supabase supplies Auth, PostgreSQL, Storage and Realtime. The bridge validates channel, same origin and source frame. A mobile-call carries requestId/action/payload; its result is correlated by requestId. Retry keys and expected-state fields must survive retries when the operation supports them.

API route families include login/access, upload validation, guest support, support tracking, release access, notification rules, Telegram, the notification worker, Pawcheebels and health. Only documented route/method/origin combinations are accepted. API configuration failures must not masquerade as successful financial actions.

## Data and numeric rules
Amounts are handled as validated cent values in financial calculations and displayed with thousands separators and two decimal places. Saved postings/allocations remain the accounting evidence. Display-only payment breakdowns do not subtract funds twice. Negative adjustments cannot be selected as positive dues for proof submission. Dates are explicit calendar dates or timestamps; formatting must not silently change the account day.

## Quality requirements
- Installment fee-help text follows the effective installment group. Preserve Cash Loan copy; retail DST/Notarial Fee are not applicable and retail Processing Fee describes checkout versus later conversion. Recorded fee values are unchanged by help text.
- Shared Cash Loan/Fees/Adjustments SVG or transparent PNG logos are admin-managed global presentation settings with validated preview, explicit review, optimistic version checks and safe retries. SVG supports ordinary exported class styling (128 KB input maximum); static PNG preserves transparency and is optimized automatically (2 MB input maximum). Active borrowers read the shared logos; direct Data API writes are denied. Updates refresh borrower views without editing their ledger records.
- Lazy-load secondary screens and Documentation; preserve focused forms/drafts during background updates.
- Mobile controls must fit supported small widths; desktop borrowers use a persistent workspace navigation.
- Use visible field boundaries, keyboard access, text status labels, readable contrast and reduced-motion alternatives.
- Private-file access must respect ownership; public profile delivery is distinct from private proof storage.
- User-facing failures must explain retry/recovery without exposing credentials or raw internal database errors.

## Known operational constraints
A successful local test is not hosted acceptance. External delivery and AI depend on configuration and quota. Existing direct-Auth failed-attempt coverage differs from the app endpoint when the optional paid-tier password-verification hook is unavailable. The current grid bulk archive action has no dedicated review confirmation; this remains a UI safety gap, not part of brand assignment.

## Implementation references
- src/lib/paymentAllocation.js
- src/lib/feeAssessment.js
- server/web-api.cjs
- tests/unit
- tests/integration
