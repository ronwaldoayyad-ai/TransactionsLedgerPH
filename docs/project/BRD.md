# Business Requirements Document

Baseline: October 14, 2026 · LoanLedger PH v4.12.24. Related documents: [PRD](PRD.md), [FRD](FRD.md), [URS](URS.md).

## Business problem

Borrowers need a clear, trustworthy view of what they owe, which items a payment relates to, the progress of loan requests, and the documents associated with their account. Inconsistent dates, signs, download controls, repeated refreshes and failed support submissions create confusion and additional lender work. Borrowers also need simple explanations of app terms without confusing automated assistance with a lender decision.

## Stakeholders

| Stakeholder | Need and responsibility |
| --- | --- |
| Borrower | Review own records, submit proof, obtain documents and communicate |
| Guest with access trouble | Read guidance and submit a support issue without signing in |
| Lender / authorized administrator | Maintain ledger records, review payment and loan requests, manage communication |
| Project owner | Approve policies, FAQ content, fees, release scope and provider configuration |
| Development and operations | Preserve account isolation, maintain service availability, validate changes and record evidence |

## Business requirements

| ID | Requirement | Measure of acceptance |
| --- | --- | --- |
| B01 | Provide account-specific access to borrower records | Account ownership verified; unrelated records excluded |
| B02 | Explain balances using the items belonging to the selected card | Amount, item count, dates and advisory switch together |
| B03 | Make payment submission and review distinguishable from settlement | Pending proof and acknowledgement never claim verified funds |
| B04 | Give readable installment and straight transaction lists | Latest transaction date by default; correct charge/credit signs |
| B05 | Make loan progress understandable | Dated History Timeline, status colors and green Completed check |
| B06 | Reduce document retrieval friction | Consistent download action, visible preparation and handoff notice |
| B07 | Make support available before and after login | Durable ticket confirmation; signed-in email prefilled; failure recoverable |
| B08 | Offer useful self-service guidance | Searchable FAQ and Pawcheebels reference the same maintained content |
| B09 | Keep human communication explicit | Message lender sends through account messaging; FAQ/AI answers are identified |
| B10 | Document and track the implemented system | Requirements, design, flows, test evidence and maintained source graph |

## Scope

Included: borrower dashboard, payment cards, transaction schedules, proof submission, acknowledgement receipts, invoices, loan requests, disbursements, notifications, account settings, support and FAQ. Lender workflows remain in the existing React administration interface. The separate Expo source is part of the repository but is not automatically updated by a browser UI change.

Pawcheebels combines the maintained FAQ with OpenRouter AI assistance enabled by default for signed-in users with an off switch using free models. Paid model selections are rejected and unavailable AI falls back to FAQ. Automated loan approval, payment verification, balance editing and autonomous lender messaging are outside its authority.

## Business rules and constraints

Borrower records are confidential. Existing financial values are not recalculated merely to change display wording. Loan agreements and lender review determine financial obligations and outcomes. The advisory’s three-day grace period and 3% monthly Finance Charge reflect the service’s published wording; account-specific fees require lender confirmation.

Browser saving preferences and native download UI remain under browser control. Reliable access depends on the application, account services and network connection. API credentials stay on the server. External AI receives no automatic ledger data or lender conversations.

## Success measures and release decisions

Track support completion rate, failed-request retries, document handoff failures, FAQ search usefulness and observed interaction delays. No analytics collection has been added for these measures; current acceptance uses test evidence and borrower feedback. Numerical service-level targets require owner approval and representative device measurement.

Operations owns service hosting, operator contact details, record retention, AI configuration, device compatibility and monitored performance targets. These responsibilities are maintained through controlled releases.

## Payment-submission acknowledgement enhancement

Borrowers receive a concise, immediate confirmation after the proof and its details are saved. The summary makes the submitted amount, payment date, reference, channel and requested coverage easy to retain as an image or share through the device's sharing controls. Payment verification remains a lender action. Missing bank/account details are hidden.

## Unsubmitted payment continuity

Borrowers can resume an unfinished proof submission after navigating away or returning after a browser reload. This avoids repeated entry or loss of a selected receipt. Successful authentication and delayed requests provide clear, accessible progress feedback.

## Borrower account references and proof distinction

Borrowers receive a permanent numeric account reference that is easier to recognize and quote in account communications and acknowledgement receipts. Payment proof status colors distinguish lender approval from unapproved states, while a prominent retract action helps borrowers withdraw a pending proof.
