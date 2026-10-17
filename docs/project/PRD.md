# Product Requirements Document

Baseline: October 14, 2026 · v4.12.24. Business goals: [BRD B01–B10](BRD.md). Functional details: [FRD](FRD.md).

## Product and personas

LoanLedger PH is an invitation-based borrower and lender portal. A borrower reviews their records and submits requests; a guest can obtain access help; an authorized lender manages records and replies. Pawcheebels is the borrower-facing mascot and guidance assistant, with an explicit switch to the lender conversation.

## Product experience

| Area | Required behavior | Current boundary |
| --- | --- | --- |
| Login | Compact icon-aligned floating labels, validation, password visibility, Remember me, token access and support link | Existing authentication handles sessions; recovery is support-mediated |
| Dashboard | Current/Next cards, latest due dates first, scoped item breakdown, advisory only for active overdue items, five recent activities | Existing configured balance groups can contain older dates |
| Transactions | Installments first, Cash Loan and Retail groups, bold principal, straight charges positive, credits green, working sort | Transaction date differs from due date and paid date |
| Loan request | Fees, monthly add-on percentage, complete amortization table, status colors and latest History Timeline | Lender/bank processing remains an external human workflow |
| Payments | Select dates/items, confirm allocation, OCR assistance/manual entry, submit proof and download receipt | Submission remains pending until lender review |
| Documents | Download-only controls for proof, receipt, invoice, disbursement and notification attachment | Browser may still show native saving UI |
| Invoices | Year/month navigation and deletion of user-generated documents | Lender-issued documents are not borrower-deletable |
| Notifications | Search, categories, unread indicators, replies, attachments and collapsed reactions | Account messaging performs replies; reactions do not trigger financial actions |
| Support | Two sub-items: FAQ and Submit Request; prefilled account email, durable ticket, recoverable errors | Guest submissions have no signed-in history access |
| Pawcheebels | FAQ guidance with sources, optional external AI, explicit Message lender mode | Server-protected credentials, free-model policy, provider availability and no financial action tools |
| Settings | Profile, preferences, loan summary and next-payment navigation | Display settings do not modify repayment obligations |

## FAQ and assistant acceptance

The FAQ is public before login and available from Help & Support in More and Profile & Settings. It includes navigation, app terminology and how-to questions. Search and topic selection filter the list without repeatedly replacing focused input. Five questions are initially visible; Show more and Show fewer are reversible. Questions expand in place.

Pawcheebels reads the same versioned [FAQ file](../../public/faq-knowledge.json) used by the screen. Answers identify FAQ or AI-assisted mode. Relevant FAQ references appear only when retrieved. With AI selected, greetings and general questions can receive answers without a FAQ match. Unknown app-specific details route to Submit Request or Message lender. Its conversation is kept in page memory and cleared on account change. Choosing Message lender uses the existing messaging composer and service; answering a question does not send a human message.

External AI is enabled by default for signed-in questions and can be switched off before sending. It receives the current question and retrieved FAQ references, not an automatic account snapshot. Missing configuration, provider failure or timeout falls back to FAQ. A configured provider can still make mistakes; it has no authority to verify payments or approve loans.

## Feedback and decluttering

Use loading indicators beside the affected action rather than a screen-wide refresh for routine interactions. Show success only after confirmation. Download wording is “Download started” because saving completion is not observable by the page. Use concise document names beside a shared download icon. Long record lists use reversible expansion. Numeric and unread badges must not be clipped.

## Release classification

The web flows, FAQ content, shared legal notices and protected AI adapter form the product scope. Release acceptance follows [TDD](TDD.md): verify provider credentials, model policy and account controls; review physical Android/iOS behavior, accessibility, legal notices and operator requirements. Retain dated evidence for each release.

The legal pages describe borrower records, connected submission and messaging services, and AI processing that users can disable. Proof submission does not execute a bank transfer or establish payment verification.

## Pawcheebels in Messages

More → Messages offers Ask Pawcheebels and Message lender. The assistant uses the same conversation and AI preference as the mascot and FAQ screen. Switching destinations preserves separate unsent assistant and lender drafts. Asking the assistant never submits a lender message; lender messages require the user to select Send. Account changes clear assistant state.

## Payment confirmation experience

After successful proof submission, show a compact pop-up with a success check, amount, captured payment date and reference, submission timestamp, payment details, and selected-dues reconciliation. Loading feedback covers upload/save and confirmation preparation. Save Image downloads a PNG; Share opens supported device sharing or provides an image-download fallback. Failure retains the draft and shows an error. Recent Payments continues to provide the full acknowledgement receipt.

## Draft recovery and processing motion

My Payment retains the selected attachment, due/item selections, confirmation, OCR/manual fields, notes and correction details for its borrower. A successful confirmed save or explicit Discard draft clears it. Sign-in success uses a sequenced pulse grid around the established wallet brand mark; generic delayed work uses magnetic dots with elastic staggered motion. Document upload/download retains its own loading presentation.

## Numeric borrower reference

The first five normalized first-name letters use A=01 through Z=26. Their concatenated code is padded with zeros to a ten-digit base and receives a unique suffix of at least three digits. Normal account numbers therefore contain thirteen digits; a prefix with more than 999 assignments grows its suffix. The assigned reference stays fixed when the name changes. Use it wherever the borrower account is displayed or printed.
