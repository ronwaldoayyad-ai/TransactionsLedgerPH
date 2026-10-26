# Design Document

Reviewed October 27, 2026. This is the implemented software and interaction design.

## Responsibilities
| Layer | Responsibility | Boundary |
| --- | --- | --- |
| React host | Auth/session, role routes, data providers, API/RPC operations | Owns credentials; does not trust presentation claims. |
| Admin workspace | Navigation, record maintenance and reviewed operator workflows | Protected admin routes and server authorization. |
| Borrower presentation | Responsive screens, cards, gestures, Finder and feedback | Receives account-scoped snapshots; no server secret. |
| Read models | Outstanding amounts, groups, credit/payment activity | Display-only events are not new debt/payment rows. |
| API/services | Login, validation, support, external delivery and controlled operations | Validate method, origin, session, payload and ownership. |
| PostgreSQL/RLS | Persistence, constraints, expected-state checks and atomic operations | Financial invariants enforced beyond UI controls. |

## State and ownership
Providers separate the real admin identity from View as borrower. The preview banner returns to admin, while account data sent to the borrower frame remains scoped to the selected borrower. Release assignment controls interface selection; it does not change ledger ownership.

Realtime invalidation refreshes relevant read models rather than replacing the whole app page. Active input, selected proof and disclosure review must not be lost when unrelated data arrives. Changes with expected versions/balances fail on stale data and require a fresh review.

## Interaction patterns
- Admin workspace: persistent navigation on larger screens, compact navigation/drawer on small screens, page/borrower search and contextual actions.
- Borrower: desktop sidebar; mobile bottom navigation; card/list installments, horizontal Quick Access, positive-only proof selection and progressively expanded lists.
- Installment cards use a compact layout with a single-line status badge and a separate borderless logo below it. Card spacing reserves the logo area and adapts for narrow screens and translated labels. Borrower History places Installment Transactions before Straight Transactions while retaining its existing category filters and per-section expansion. Cash Loan cards retain the dedicated artwork and can also show the shared uploaded Cash Loan logo. Cash Loan (including PayPal Send), Fees and Adjustments use admin-uploaded SVG or transparent PNG group logos across transaction lists, breakdowns, activity and history; retail logos continue to use Brandfetch. Unknown/removed logos retain the existing fallback.
- Payments and Finder share the animated gradient border. Navigation uses a cancellable entrance, avoids duplicate positioning and respects reduced motion.
- Fees retain red styling; paid/credit activity retains the appropriate green cue with textual labels.
- Approved proof confirmations show the saved approval/posting timestamp in the same Manila date/time format as submission. A date-only legacy review never overrides an available exact timestamp; missing historic times are explicitly labelled rather than invented. Acknowledgement items resolve their own installment schedule transaction date, with saved submission/transaction dates as fallbacks. Multi-loan receipts retain a distinct date per selected item and never reuse the first loan's date for unmatched rows. These are read-only document changes.

## Failure and concurrency design
Idempotent requests reuse their UUID when retrying identical details. Reviewed financial changes compare expected ownership, balances, amounts and versions. Stable manual logo associations override automatic matching; ambiguous names are never silently resolved to competing brands. Missing external assets must not block account access.

Shared group-logo uploads use server-side validation, preview and explicit group-wide review. SVG uploads (128 KB maximum) retain self-contained vectors and local gradients; ordinary class/id/tag styles are flattened into allowed presentation attributes. Scripts, external content and unsupported CSS are rejected. Static PNG uploads (2 MB and 16 million decoded pixels maximum) are decoded and re-encoded without metadata, resized inside 512 pixels while preserving transparency, then embedded in a fixed server-generated SVG container. Both formats remain within the existing 64 KB canonical artwork contract and work with existing borrower renderers. Group-logo requests have a dedicated 3 MB limit; unrelated upload limits remain unchanged. The settings table is readable to active sessions but not directly writable through the Data API. Version checks and retry keys protect concurrent/repeated saves. The server changes presentation metadata only, never loan/transaction rows.

Installment disclosure information icons use the effective Cash Loan/Retail Installment group. Cash Loan and Request a Loan retain their existing fee descriptions. Retail Installments explain that DST/Notarial Fee are not applicable and that Processing Fee depends on amount and how the purchase became an installment. This help copy does not recalculate or erase recorded fees.

## Documentation design
The Documentation route is admin-guarded and lazy-loaded. Canonical Markdown lives in docs/project; legal sections read the same legal-content.json as public/borrower pages. A build-time inventory supplies routes, package versions, test-suite names, source fingerprint and schema metadata. No live borrower records, credentials or secret configuration values are bundled.

## Uploaded artwork and control feedback

Retail items support a manually uploaded SVG or transparent PNG when Brandfetch is missing or ambiguous. Admins can preview, name and explicitly review one image for up to 200 selected targets. Installment assignments cover the entire linked loan; straight retail assignments cover one transaction. Uploaded choices take priority over automatic matching. Choosing Brandfetch, automatic or no logo clears the custom reference. These actions write artwork/assignment metadata and an audit event only. They do not archive transactions, alter amounts/statuses or create credit.

The immutable retail_brand_assets table deduplicates canonical artwork by SHA-256. Borrowers receive only assignments for their own target keys and referenced assets; both database RLS and the admin-preview snapshot enforce this boundary. Existing assignment realtime invalidations reload referenced artwork. Uploaded artwork has no external Brandfetch icon fallback.

The fourth shared-artwork setting, Payment Proof Submitted, decorates borrower Recent Activity and a separate Payment proof submissions History section. Submission events show their current review status and stay separate from posted-payment records and totals. They are not new financial records.

Switches retain stable accessible feature names and expose current-result text, including pending or unavailable states where applicable. All admin search fields use the Finder gradient border, native input behavior, visible keyboard focus and a still reduced-motion alternative.
