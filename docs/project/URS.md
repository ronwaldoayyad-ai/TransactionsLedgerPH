# User Requirements Specification

Baseline: October 14, 2026. Functional mapping: [FRD](FRD.md). Product scope: [PRD](PRD.md).

| ID | User requirement | Acceptance / functional mapping |
| --- | --- | --- |
| U01 | As a borrower, I can sign in and remain signed in during normal account use | Auth/session restoration, explicit sign-out; F01 |
| U02 | I can understand what is included in my current or next balance | Active-card amount, item list and advisory agree; F02–F06 |
| U03 | I can find my newest loan and transaction records first | Default transaction-date order and working sort; F07–F10 |
| U04 | I can recognize payments/credits and original loan principal | Correct signs, green credits and bold principal; F09 |
| U05 | I can submit proof for specific payable items and correct OCR results | Allocation confirmation, editable/manual fields; F11–F12 |
| U06 | I can download proof and acknowledgement without a separate preview step | Consistent document actions and feedback; F13–F14 |
| U07 | I can find an old invoice due date and remove an invoice I generated | Year/month navigation and owned-document deletion; F15 |
| U08 | I can inspect monthly payments and understand loan request progress | Schedule plus latest History Timeline and status labels; F16–F17 |
| U09 | I can identify unread notifications and respond without clutter | Unread categories, reply/download and reaction trigger; F18 |
| U10 | I can contact support when signed in, with my email already entered | Registered email prefill, durable ticket and recovery; F19–F20 |
| U11 | As a guest, I can read FAQ and submit an access problem without logging in | Public FAQ and guest ticket endpoint; F19–F21 |
| U12 | I can ask Pawcheebels general questions or how to use the app, with relevant FAQ references | FAQ or identified AI answer; reference links when available; F22–F23 |
| U13 | I can tell whether I am asking an assistant or messaging my lender | Separate modes and user-submitted message; F24 |
| U14 | I can retry a failed operation without losing my input or duplicating it | Busy guard, retained draft and request key; F20, F23 |
| U15 | I can read the privacy notice for real records and optional AI | Shared dated policy describing account data and AI with an off switch |
| U16 | As a lender, I receive borrower messages and support tickets through existing operations | Account-owned message records and durable ticket storage |
| U17 | As a project owner, I can configure AI later and maintain FAQ centrally | Server environment configuration and one versioned content file |

## User authority

A borrower operates only their own account. Account email may be used for support contact, but account ownership comes from authenticated identity. A guest cannot retrieve a borrower’s private history through FAQ or the support form. The lender reviews payment proof and records final loan statuses; Pawcheebels cannot perform those decisions.

## User control

Users can select balance cards, change sort/filter, expand and collapse long content, turn available AI assistance on or off, clear the in-memory assistant conversation, choose Message lender, edit a failed support draft and download documents. Interface preferences include appearance and mascot visibility. Browser download preferences remain device/browser settings.

## Language and understanding

Use consistent names: transaction date, due date, paid date, requested allocation, acknowledgement receipt, monthly add-on rate, amortization, History Timeline, FAQ and Submit Request. Explain that proof submission/acknowledgement differs from verification. Explain that Next Balance Due is the configured next group, which can still contain overdue dates. Never infer the user’s financial obligation solely from an assistant answer.

## Acceptance participation

Borrower device feedback is needed for mobile toast visibility, upload/OCR behavior, field spacing, mascot movement and ease of navigation. A successful browser emulation run is not a substitute for those checks. The project owner remains responsible for approving operational FAQ/policy changes and provider configuration before external AI is enabled.

## Pawcheebels in Messages

More → Messages offers Ask Pawcheebels and Message lender. The assistant uses the same conversation and AI preference as the mascot and FAQ screen. Switching destinations preserves separate unsent assistant and lender drafts. Asking the assistant never submits a lender message; lender messages require the user to select Send. Account changes clear assistant state.

## Payment confirmation needs

After submitting proof, I can see that the saved submission awaits review, confirm the captured amount/date/reference/channel, compare the submitted amount with my selected dues, save an image or choose a sharing destination, and close the pop-up. If saving fails, I retain the details and attachment so I can retry. I can still obtain the full acknowledgement receipt from Recent Payments.

## Recovery expectations

Borrowers can leave My Payment and return to their unsent attachment and entries. Reloaded sessions recover the same borrower's draft from device storage. A proof remains unsubmitted until the borrower explicitly submits it, and only a confirmed save or explicit discard removes the draft. Borrowers see processing feedback when requests take time.

## Recognizable borrower accounts

Borrowers can quote one stable, unique numeric account reference across screens and receipts. The number remains fixed when their name changes. They can distinguish Approved proofs from other statuses and retract an eligible pending proof through a clear action with confirmation.
