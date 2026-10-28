# Business Requirements Document

Reviewed October 26, 2026. Scope is the current admin and borrower web application.

## Business need
A borrower should understand what is owed, what was submitted, what the lender approved and how every applied peso affected the ledger. Administrators need accurate servicing tools that preserve account history while reducing repetitive communication and record-entry work.

## Stakeholders and ownership
| Stakeholder | Responsibility |
| --- | --- |
| Borrower | Review own account, verify submission details, request permitted services and contact the lender. |
| Lender/admin | Review financial allocations, account access, fees, loan requests and borrower communication. |
| Project owner | Approve policy, rollout, production changes, integrations and recovery decisions. |
| Developer/operator | Maintain access isolation, operational evidence, data integrity, recovery and current documentation. |
| Guest | Use supported login-help and legal information without access to private account records. |

## Business requirements
| ID | Outcome | Evidence |
| --- | --- | --- |
| B01 | Account-specific access | Ownership/RLS and role-denial checks. |
| B02 | Explainable balances | Matching total, dates, item count and itemized breakdown. |
| B03 | Submission distinct from settlement | Pending proof/confirmation before review; approved records after reviewed posting. |
| B04 | Understandable transactions | Cash Loan/Retail Installment grouping, straight-group pills, status and dynamic totals. |
| B05 | Traceable loan progress | Saved request events, disclosure and schedule state including refunded/fully paid. |
| B06 | Accessible documents | Clearly separate proof, receipt and confirmation with readable status/time. |
| B07 | Recoverable support | Durable ticket flow, context capture and configured tracking capabilities. |
| B08 | Helpful self-service | Maintained FAQ/Pawcheebels reference without fabricated account decisions. |
| B09 | Timely human communication | Live lender messaging and optional Telegram alerts. |
| B10 | Governed release and change | Current requirements, diagrams, schema reference, tests and recovery evidence. |

## Financial and policy boundaries
Fee defaults are calculation inputs, not automatic permission to post. The current combined assessment uses the net remaining selected ledger balance and one configured late fee for that selection. Multiple confirmed assessments in one month are permitted. Human review determines allocation, correction and posting; changing display labels or logos must never change debt.

The borrower loan-request switch is access to a workflow, not a promise of lending. Paid rows, historical legacy proofs and adjustments must be reconciled before new credit is created from old evidence. Hiding a payment breakdown preserves payments/balances; reversing a posting is a different operation.

## Success and release evaluation
Evaluate account isolation, duplicate-post prevention, accurate allocation, delivery status, recoverability and practical device/browser usability. Existing acceptance uses automated checks, hosted Chrome evidence and operator feedback. This document does not assert unmeasured uptime, latency guarantees or new analytics collection.
