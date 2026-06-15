# Product Requirements Document — LoanLedger PH

**Loan Amortization App · Phase 1 MVP (front-end complete) → Phase 2 (backend integration)**

| | |
|---|---|
| Version | 1.0 |
| Date | June 11, 2026 |
| Status | Front-end prototype complete and verified; this PRD is the contract for backend implementation |
| Source | "App MVP Master Plan — Loan Amortization" (June 11, 2026) + all design-phase iterations |
| Prototype | React 19 + Vite + Tailwind 4, in-memory data layer (`src/context/AppContext.jsx`, `src/data/mock.js`) |

---

## 1. Overview

### 1.1 Problem
A small lending operation (single owner/administrator, Philippine market) needs to generate predictable loan repayment schedules with Philippine-compliant disclosure statements, distribute them to borrowers, track every installment's payment status, and verify borrower-submitted proofs of payment — without manual spreadsheets.

### 1.2 Goals
1. Admin can produce a BIR/RA 3765-compliant Loan Disclosure Statement and amortization schedule in seconds, reactively, with no "calculate" step.
2. Admin manages the entire receivables ledger (every installment, every borrower) from one screen, including bulk operations.
3. Borrowers get an isolated, read-only, always-current view of their own loans, balances, and payment statuses, and a channel to submit proof of payment.
4. Every state-changing action is captured in an audit trail.

### 1.3 Success criteria
- Admin can go from loan terms → disclosure → assigned-to-borrower in under one minute.
- A status change in the admin ledger is visible to the borrower immediately (same data source — no sync step).
- All money math matches the formulas in §6 to the cent, including final-month rounding.

---

## 2. Roles & Access Control

### 2.1 Two-tier RBAC
| Role | Description | Access |
|---|---|---|
| **Admin (Owner)** | Single operator of the lending business | Unrestricted: all data, configuration, user management |
| **General User (Borrower)** | Invited customer | Read-only, strictly own data; may submit payment proofs |

- **RBAC-1** Admin routes (`/admin/*`) are unreachable by general users and vice versa (`/portal/*`); cross-role navigation redirects to the user's home.
- **RBAC-2** Unauthenticated visitors are redirected to `/login`.
- **RBAC-3** Backend must enforce all authorization server-side; front-end guards are UX only.

### 2.2 Authentication (invite-only)
- **AUTH-1** Public registration is disabled. Accounts exist only when the Admin creates them.
- **AUTH-2** Creating a user triggers an automated email invitation containing a secure link / temporary credential. *(Prototype simulates the email; backend must send it.)*
- **AUTH-3** A user in `invited` status is forced through a **Set Permanent Password** screen on first login and cannot reach the portal until completed. Completing it transitions the account to `active`.
- **AUTH-4** Password rules (validated live in UI; backend must re-validate): minimum 8 characters; at least one number; both upper- and lowercase letters; confirmation must match.
- **AUTH-5** Sign-in is by email + password. Unknown emails show: access is by invitation only.
- **AUTH-6** Sign-out is available from the navigation shell for both roles.
- **AUTH-7** The prototype's "Demo access" panel on the login page is **prototype-only** and must not ship.

---

## 3. Scope

### 3.1 In scope (implemented in front-end)
Authentication flows; borrower dashboard, loan detail, consolidated loans, payment submission/history with proof view/download; admin overview with receivables analytics and Grand View; Overall Transactions ledger (editable, filterable, bulk ops, archive); loan calculator & disclosure module (installment + straight); distribution (assign, undo, share, email, CSV); verification queue; user management CRUD; audit trail; archives.

### 3.2 Explicitly out of scope for MVP (from master plan)
- Direct payment gateway integrations (Stripe, Maya, etc.)
- Automated OCR for receipt scanning
- In-app chat or messaging

### 3.3 Prototype simplifications the backend must replace (see §9)
Real authentication/sessions, email delivery, file storage, data persistence, server-side audit writing, server-enforced validation and authorization.

---

## 4. Borrower (General User) Requirements

### 4.1 Personal Dashboard (`/portal`)
- **BD-1** KPI cards: **Active Loans** (count; hint shows "N fully paid" when applicable), **Net Proceeds Received** (sum across visible loans, "after fees & deductions"), **Outstanding Balance** (sum of receivable installment amounts — see BR-STATUS), **Next Payment Due** (amount + date + loan description of the earliest receivable installment; em-dash when none).
- **BD-2 My Loan Schedules** list: per loan — description, loan ID, duration, monthly add-on rate, principal, progress bar, and "x/y paid" counter where `y` = the loan's current (non-archived) ledger records.
- **BD-3 Loan visibility rule:** a loan appears **only if at least one of its ledger records exists** (not archived). If the Admin deletes *all* of a loan's installments from Overall Transactions, the loan disappears from the borrower's dashboard, all KPIs recalculate without it, and direct navigation to its detail page redirects to the dashboard.
- **BD-4 Fully Paid treatment:** when **every** ledger record of a loan has status `paid`, the loan row is themed distinctly (emerald left border + tinted background) and carries a **"Fully Paid"** badge with a check icon. The Active Loans KPI hint counts fully paid loans.
- **BD-5 Consolidated Loans** entry button in the My Loan Schedules header (shown when the user has ≥1 visible loan).
- **BD-6 Recent Payments** card: latest 5 proof submissions with amount, method, date, file-type icon, and status badge; links to My Payments.

### 4.2 Loan Detail (`/portal/loans/:loanId`)
- **BLD-1 Loan Disclosure Statement** (labelled "Republic Act No. 3765 (Truth in Lending Act)") listing, in order: **Transaction Date**, Principal Amount, Monthly Add-on Rate (%), Duration (months), First Payment Date, Documentary Stamp Tax, Processing Fee, Notarial Fee, Total Deductions, and highlighted **Net Proceeds**.
  - The Transaction Date is read from the loan's ledger (first installment's `txnDate`), so admin inline edits are reflected; falls back to the loan record.
  - When fees are **not** deducted from proceeds, the "Total Deductions" row is relabelled **"Fees & Deductions (with 1st payment)"**.
- **BLD-2 Fully Paid banner:** when all installments are paid, a prominent congratulatory banner renders above the content ("Congratulations — this loan is Fully Paid! All N installments have been verified as paid…"), and the schedule card subtitle reads "Fully paid — all installments verified"; otherwise the subtitle reads "x of N payments verified".
- **BLD-3 Amortization grid** (driven entirely by the shared ledger): columns **#**, **Item Description** (admin-maintained), **Payment Due Date**, **Payment Date** (actual date pushed by Admin; em-dash when unpaid), **Total Amortization**, **Status**. Past-due rows are highlighted red. A TOTALS footer sums the amount column. *(No principal/interest breakdown is shown to borrowers.)*
- **BLD-4** If the loan does not belong to the session user, or has zero ledger records, redirect to `/portal`.

### 4.3 Consolidated Loans (`/portal/consolidated`)
- **BCL-1** A single grid combining **all** of the borrower's installments across all visible loans, sorted by due date, using the same columns as BLD-3.
- **BCL-2 Filters:** **Status** (All, Paid, Upcoming, Due, Past Due, Refunded, Cancelled) and **Due Date** (exact date); a Clear control resets both. Empty state explains when filters match nothing.
- **BCL-3** Subtitle shows filtered installment count and the **outstanding** total (receivable statuses only) for the filtered set.
- **BCL-4** No Loan Disclosure Statement on this page (per-loan disclosures live on each loan detail page).

### 4.4 My Payments (`/portal/payments`)
- **BPAY-1 Submit Proof of Payment:** drag-and-drop or browse upload accepting **JPG/JPEG/PNG/WebP/PDF** (UI states max 10 MB — backend must enforce); loan selector; **Amount paid** (formatted currency input per UI-1); **Payment method** (GCash, Maya, Bank Transfer, Cash Deposit); optional reference number. Validation errors render inline; success shows a confirmation notice. Submitting creates a `pending` payment record and an audit entry.
- **BPAY-2 Submission History:** every proof with amount, file name, method, reference, submitted/reviewed dates, and status badge (**Pending / Approved / Rejected**). Rejected items display the Admin's note ("Admin note: …").
- **BPAY-3 View & download proof:** each history item has a **View** action (in-app preview modal — image render for images, embedded frame for PDFs — with a Download button) and a direct **Download** action that saves the original file under its original name.

---

## 5. Admin Requirements

### 5.1 Navigation shell
- **NAV-1** Sidebar (desktop) / collapsible top drawer (mobile): **Overview, Overall Transactions, Loan Calculator, Verification Queue, User Management, Reports & Logs**, with brand header and user footer (avatar initial, name, role, sign-out).
- **NAV-2** The Verification Queue item shows a live badge with the count of pending proofs.

### 5.2 Overview / Command Center (`/admin`)
- **OVR-1** KPI cards: Active Borrowers (+ total accounts hint), Total Net Proceeds Disbursed, **Outstanding Receivables** (+ open installment count), Pending Verifications (state-aware accent).
- **OVR-2 Receivables by Status:** every ledger status present, with count and amount sum; footer row totals the **receivables** (see BR-STATUS-5).
- **OVR-3 Receivables by Borrower:** open (receivable) balance and installment count per borrower, sorted by amount descending.
- **OVR-4 Receivables by Due Date:** expected collections grouped per due date, ascending, scrollable; dates earlier than today are flagged red with an "overdue" label.
- **OVR-5 Grand View — Scheduled Collections:** a due-date picker (defaulting to the next collection date: earliest receivable due date ≥ today, else earliest overdue) and a table of all borrowers scheduled to pay on that date — Borrower, Item Description, Due Date, Amount, Status (past-due rows highlighted) — with a footer totaling expected amount, installment count, and distinct borrower count. Empty state when nothing falls on the selected date.
- **OVR-6** Verification Queue preview (latest 5 pending) and Recent Activity (latest 6 audit entries), each linking to the full page.

### 5.3 Overall Transactions ledger (`/admin/transactions`)
The system of record for payment status. One row per amortization installment across all borrowers.

- **LGR-1 Columns:** select checkbox · Borrower · **Txn Date (editable)** · Item Description (truncates with full text on hover, includes loan ID) · Amount · Type (`Installment`/`Straight`) · **Due Date (editable)** · **Date Paid (editable)** · Status badge · **Action** (status dropdown).
- **LGR-2 Editable dates:** Txn Date, Due Date, and Date Paid are inline date inputs persisted immediately. Rationale: late record-keeping and advance payments.
- **LGR-3 Date Paid ↔ status coupling:** entering a Date Paid on an `unpaid`/`past_due` row promotes it to `paid`; clearing the Date Paid on a `paid` row reverts it to `unpaid`.
- **LGR-4 Statuses & actions:** `paid`, `unpaid`, `refunded`, `cancelled`, `past_due` — settable per row via the Action dropdown and in bulk. Side effects on status set: `paid` stamps today as Date Paid (preserving an existing date); `refunded` keeps the original Date Paid; `unpaid`/`cancelled`/`past_due` clear it.
- **LGR-5 Automatic Past Due:** a stored `unpaid` row whose due date is **at least 1 day in the past** displays as **Past Due** with a red row highlight, without changing the stored status. Explicitly stored statuses always win. This effective-status rule applies everywhere statuses are shown or filtered (ledger, overview, borrower views, exports).
- **LGR-6 Filters:** free-text search (borrower, description, loan ID), borrower select, status select (matching **effective** status), and three single-date filters mapped per column — **filter 1 = Txn Date, filter 2 = Due Date, filter 3 = Date Paid** (exact match).
- **LGR-7 Live amount aggregation:** whenever filters change, the Amount column is summed automatically and shown in the card subtitle, in a **FILTERED TOTAL** table footer (with record count), and appended to the CSV export.
- **LGR-8 Selection & bulk actions:** header checkbox selects/deselects all *filtered* rows; selecting rows raises an action bar with the selection count, a status picker (all five statuses) + **Apply**, and **Delete (move to Archives)**.
- **LGR-9 Delete = archive:** deletion is a soft delete; rows move to the Archives (§5.7) stamped with the archive date, and can be restored. An audit entry is written.
- **LGR-10 CSV export** of the current filtered view: Borrower, Loan, Item Description, Txn Date, Amount, Type, Due Date, Date Paid, Status (effective), plus the filtered-total row.
- **LGR-11 Layout:** all ten columns must fit without horizontal scroll at a standard desktop content width (~1100 px): compact paddings, compact date inputs, truncating text cells with hover tooltips, and plain status labels in the Action dropdown.
- **LGR-12 Propagation:** every ledger write (status, dates, archive/restore) is immediately reflected in borrower views and admin analytics — single shared store; the backend equivalent is a single table/source queried by both roles.

### 5.4 Loan Calculator & Disclosure (`/admin/calculator`)
A fully reactive module — every output recomputes on input change with no submit step.

- **CALC-1 Transaction Type switch** (segmented control): **Installment | Straight**, with an explanatory hint per mode.
- **CALC-2 Type defaults** (applied on switch; everything remains manually editable afterwards):

  | Field | Installment | Straight |
  |---|---|---|
  | Description | `Cash Loan` | `Purchased Item` |
  | Monthly Add-on Rate | `0.00` | `0.00` (editable) |
  | Principal / Amount | unchanged | `0` |
  | Apply DST | checked | unchecked |
  | Deduct from Loan Proceeds | checked | unchecked |
  | Duration | editable (1–60) | **locked to 1**, input disabled, hint "Fixed at 1 for Straight transactions." |

  Initial page state equals the Installment defaults (with Principal seeded at 50,000 in the prototype). "Add Processing Fee" defaults to unchecked in both modes.
- **CALC-3 Core inputs:** Description (renamed from "Loan label"); Principal Amount (₱-prefixed currency input); Monthly Add-on Rate (%); Duration (months); **Transaction Date** (date input, defaults to today; stamped on every ledger record on assignment); First Payment Date (date input, defaults to one month from today; anchors the schedule).
- **CALC-4 Fees & Deductions** (all ₱-prefixed currency inputs, live-updating with Principal):
  - **DST** with an **"Apply DST"** checkbox. Checked: auto-calculated per the BIR formula (BR-MATH-1), editable as an override; the override holds only for the principal it was entered against — changing the principal re-syncs the auto value; clearing the field counts as ₱0.00 (not "recalculate"). Unchecked: forced to ₱0.00 and the input is disabled.
  - **Processing Fee** with an **"Add Processing Fee"** checkbox. Default unchecked = ₱0.00 (disabled input); checking sets ₱1,500.00, editable.
  - **Notarial Fee**, default ₱0.00, always editable.
  - **"Deduct from the Loan Proceeds"** checkbox (BR-MATH-3).
  - Live aggregates: **Total Deductions**; **"Added to first payment"** line (amber) when not deducting from proceeds; **Net Proceeds to Borrower** (emphasized).
- **CALC-5 Output grids**, in order:
  1. **Amortization Schedule — {Borrower first name | "General User"}** — title and subtitle dynamically use the first name of the borrower selected in "Assign to borrower"; shows the borrower view (Payment Due Date + Total Amortization only). Actions: **CSV** (user-view variant) and **Email**.
  2. **Amortization Schedule — {Admin first name}** (e.g., "Ron", derived from the admin profile) — full breakdown with Principal and Interest spreads. Actions: **CSV** (full variant) and **Email**.
  - Both grids: header "Payment Due Date", TOTALS footer; when fees ride on the first payment, row 1's total carries an asterisk and a footnote states the included fee amount. Empty state when inputs are invalid.
- **CALC-6 Disclosure Summary** card: Principal, Net Proceeds, Total Interest, Total Repayable.
- **CALC-7 Distribution:**
  - **Assign & push live** to a selected borrower: creates the loan, generates one ledger record per schedule row (all `unpaid`, stamped with the Transaction Date), and surfaces it on the borrower's dashboard. Confirmation message persists (no auto-dismiss) with **Undo** and dismiss controls.
  - **Undo:** removes the loan *and* every ledger record generated for it; writes an audit entry; confirmation updates accordingly.
  - **Share statement:** native OS share sheet (Web Share API) with full disclosure text; clipboard fallback with a notice (covers Email, WhatsApp, Telegram, SMS).
  - **Email** (per grid): opens a pre-filled email — subject "Loan Disclosure Statement — {Description}"; borrower-view emails pre-address the selected borrower; body contains the matching schedule text. *(Prototype uses `mailto:`; backend should send server-side with the statement attached.)*

### 5.5 Verification Queue (`/admin/queue`)
- **VQ-1** Filter tabs: Pending (with count), Approved, Rejected, All.
- **VQ-2** Each submission shows attachment preview placeholder (file type), borrower, amount, loan, method, reference, file name, submission date, status badge.
- **VQ-3** Pending items: **Approve** (one click) or **Reject** — rejection opens a modal requiring a reason that is shown to the borrower; both write audit entries.
- **VQ-4** Reviewed items can be **re-opened** to pending.

### 5.6 User Management (`/admin/users`)
- **UM-1** Borrower table: avatar initial, name, ID, email, phone, status badge (`invited`/`active`/`disabled`), active-loan count + principal sum, last login (or "Never").
- **UM-2 Invite (create):** modal with full name, email (validated), mobile number; creates an `invited` account and sends the invitation (AUTH-2); toast confirms. **Resend invitation** action available while `invited`.
- **UM-3 Edit:** update name/email/phone.
- **UM-4 Delete:** confirmation modal warning that access is lost permanently while loan/payment history stays in the audit trail.
- **UM-5** All CRUD actions write audit entries.

### 5.7 Reports & Logs (`/admin/logs`)
- **RPT-1** Two tabs: **Audit Trail** and **Archives (count)**; the Export CSV button exports the active tab.
- **RPT-2 Audit Trail:** timestamped entries (timestamp, actor, action code, human-readable detail) with free-text search and an action-type filter; color-coded action chips; CSV export of the filtered view.
- **RPT-3 Action codes:** `INVITE_SENT`, `USER_UPDATED`, `USER_DELETED`, `PAYMENT_SUBMITTED`, `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `LOAN_ASSIGNED`, `LOAN_UNASSIGNED`, `PAYMENT_STATUS_UPDATED`, `TXN_UPDATED`, `TXN_ARCHIVED`, `TXN_RESTORED`.
- **RPT-4 Archives:** ledger records deleted from Overall Transactions — Archived On, Borrower, Item Description, Amount, Due Date, Status, and a per-row **Restore** action that returns the record to the ledger. CSV export includes Txn Date and Date Paid.

---

## 6. Business Rules & Calculation Engine

Authoritative reference implementation: `src/lib/amortization.js` and `src/lib/transactions.js` (pure modules, no UI dependencies — **port to the backend as-is** so both tiers share one engine).

### 6.1 Money math
- **BR-MATH-1 DST (BIR mandate):** `DST = ceil(P / 200) × 1.50` — ₱1.50 per ₱200 of principal *or fraction thereof*. Overridable (CALC-4); an explicit ₱0 (cleared or unchecked) is respected.
- **BR-MATH-2 Deductions:** `TotalDeductions = DST + ProcessingFee + NotarialFee` (rounded to cents).
- **BR-MATH-3 Net proceeds / fee placement:**
  - Deduct from proceeds **checked**: `NetProceeds = P − TotalDeductions`; schedule unchanged.
  - **Unchecked**: `NetProceeds = P` (borrower receives full principal); `TotalDeductions` is added to the **first** installment's total (`fees` component on row 1; flagged with an asterisk and footnote in all schedule renderings; included in TOTALS).
- **BR-MATH-4 Schedule generation:**
  - Monthly Principal Portion = `P / D`, rounded to cents; the **final month absorbs the fractional-cent remainder** so principal sums exactly to `P` (e.g., 10,000 / 3 → 3,333.33 / 3,333.33 / 3,333.34).
  - Monthly Interest = `P × R` (flat add-on rate per month), rounded to cents, identical every month.
  - Total Monthly Amortization = principal portion + interest (+ fees on row 1 when applicable).
  - TOTALS row aggregates principal, interest, and total columns.
- **BR-MATH-5 Payment dates:** anchored to the First Payment Date; month `i` = anchor + `i` months with **end-of-month clamping against the original anchor day** (Jan 31 → Feb 28/29 → Mar 31; leap-year aware). Verified: 2026 non-leap and 2028 leap sequences.
- **BR-MATH-6 Straight transactions:** `D = 1`; single payment of `P + (P × R)` (+ fees if applicable) on the First Payment Date.
- **BR-MATH-7 Currency:** PHP throughout; display format `₱1,234.56` (`en-PH`); input fields accept free typing and format to 2 decimals with comma thousands separators on blur; cleared inputs are treated as null/zero per field rules.

### 6.2 Transaction (installment) records
- **BR-TXN-1** Assigning a loan generates exactly one ledger record per schedule row: `{ id: "{loanId}-{n}", loanId, userId, n, description, amount, type, txnDate, dueDate, status: "unpaid", datePaid: null }`.
- **BR-TXN-2 Description:** Installment → `"{Description} ({n} of {D})"`; Straight → `"{Description}"`.
- **BR-TXN-3 Type label:** `Installment` or `Straight`.
- **BR-TXN-4 Transaction Date:** from the calculator's Transaction Date input; legacy/seed fallback = one month before the First Payment Date (clamped). Editable per record afterwards.

### 6.3 Status model
- **BR-STATUS-1 Stored statuses:** `paid | unpaid | refunded | cancelled | past_due`.
- **BR-STATUS-2 Effective status:** `unpaid` with `dueDate < today` ⇒ displays/filters/exports as `past_due` (highlighted). Stored statuses other than `unpaid` are never overridden.
- **BR-STATUS-3 Borrower-facing labels:** effective `unpaid` renders as **Due** (due today) or **Upcoming** (future); all other statuses render with their standard labels. Badge palette: paid/fully-paid = green, unpaid/due = amber, past due = red, refunded = sky blue, cancelled = gray, upcoming = neutral.
- **BR-STATUS-4 Date Paid side effects:** per LGR-3 and LGR-4.
- **BR-STATUS-5 Receivables** (used by Outstanding KPIs, breakdowns, Grand View, consolidated outstanding): installments whose **effective** status ∈ {`unpaid`, `past_due`}. `refunded` and `cancelled` are not receivable.
- **BR-STATUS-6 Fully Paid loan:** ≥1 active ledger record and **all** of them `paid`.
- **BR-STATUS-7 Deleted loan (borrower perspective):** zero active ledger records ⇒ hidden everywhere in the borrower experience (BD-3, BLD-4).

### 6.4 Payment proofs (separate concept from installment status)
- **BR-PAY-1** Proof statuses: `pending → approved | rejected`; rejected requires an admin note; reviewed items can be re-opened.
- **BR-PAY-2** Proof verification and installment status are **independent** in Phase 1. *(Open question OQ-1 proposes optional linkage.)*

---

## 7. Data Model (proposed backend contracts)

Field shapes below match the prototype's mock layer and are the proposed API contracts.

### 7.1 User
```
id            string (pk)
name          string
email         string (unique)
phone         string
role          enum: admin | user
status        enum: invited | active | disabled
invitedAt     date
lastLogin     datetime | null
passwordHash  (backend only)
```

### 7.2 Loan
```
id                 string (pk)
userId             fk → User
label              string            // "Description" in the UI
txnType            enum: installment | straight
principal          decimal(12,2)
monthlyRate        decimal(6,4)      // e.g. 0.03 = 3% add-on per month
durationMonths     int               // 1 for straight
txnDate            date
firstPaymentDate   date
dst                decimal(12,2)     // final applied value (may be overridden/0)
processingFee      decimal(12,2)
notarialFee        decimal(12,2)
deductFromProceeds boolean
status             enum: active | closed
disclosure         derived (see §6: dst, totalDeductions, netProceeds, schedule rows + totals)
```

### 7.3 Transaction (installment ledger — system of record)
```
id          string (pk)  // "{loanId}-{n}"
loanId      fk → Loan
userId      fk → User    // denormalized for ledger queries
n           int          // installment number, 1-based
description string
amount      decimal(12,2)
type        enum-label: Installment | Straight
txnDate     date         // editable
dueDate     date         // editable
status      enum: paid | unpaid | refunded | cancelled | past_due
datePaid    date | null  // editable; coupling rules BR-STATUS-4
archivedAt  date | null  // soft delete; archived rows excluded from ledger/borrower views
```

### 7.4 Payment (proof of payment)
```
id          string (pk)
userId      fk → User
loanId      fk → Loan
amount      decimal(12,2)
method      enum: GCash | Maya | Bank Transfer | Cash Deposit
reference   string
fileName    string
fileType    enum: image | pdf
fileUrl     string        // backend: object-storage URL (prototype: object/data URL)
submittedAt date
status      enum: pending | approved | rejected
reviewedAt  date | null
note        string        // required when rejected; shown to borrower
```

### 7.5 AuditEntry (append-only)
```
id      string (pk)
at      datetime
actor   string (user name / id)
action  enum — see RPT-3
detail  string
```

---

## 8. Non-Functional Requirements

- **NFR-1 Design system:** trust-navy (#0f172a–#1e3a8a) + premium gold (#ca8a04) on light slate background; IBM Plex Sans (UI) + IBM Plex Mono (all monetary/tabular figures); data-dense dashboard style.
- **NFR-2 Accessibility:** WCAG AA contrast; every input labelled (visible or `sr-only`); `aria-label` on icon-only buttons; visible focus states; status conveyed by text + color (never color alone); `role="status"`/`role="alert"` on notices; `prefers-reduced-motion` respected.
- **NFR-3 Responsive:** 375 px (mobile drawer nav) through 1440 px; tables scroll horizontally on small screens; the ledger must fit without horizontal scroll at desktop content width (LGR-11).
- **NFR-4 Interaction:** 150–300 ms transitions; pointer cursors and hover feedback on all interactive elements; ≥44 px touch targets for primary controls.
- **UI-1 Currency inputs:** all amount fields format to 2 decimals with comma thousands separators (e.g., `1,500.00`) on blur, accept free numeric typing, and carry a ₱ prefix where shown in the calculator.
- **NFR-5 Reactivity:** calculator outputs and ledger aggregates recompute synchronously on input change — no explicit recalculate/submit actions.
- **NFR-6 Localization:** `en-PH` date and currency formatting throughout.

---

## 9. Backend Integration Requirements (Phase 2)

What the backend must provide to replace prototype simulations:

1. **Auth service** — invite-only account creation, secure invitation tokens (expiring), temporary-credential first login, forced password set, session/JWT issuance, server-side role enforcement on every endpoint (RBAC-3). Password policy per AUTH-4.
2. **Email delivery** — invitation emails (AUTH-2), resend (UM-2), and statement emails with the disclosure attached (replacing `mailto:`, CALC-7).
3. **Persistence** — entities per §7; all prototype state is in-memory and resets on reload.
4. **Calculation engine on the server** — port `src/lib/amortization.js` and `src/lib/transactions.js` verbatim; the server is authoritative for schedule generation on assignment so client and server never disagree on cents (BR-MATH-4) or dates (BR-MATH-5).
5. **Ledger semantics** — soft delete via `archivedAt` (LGR-9/RPT-4); restore; bulk status updates atomic per request; Date Paid coupling (LGR-3) enforced server-side; effective past-due (LGR-5) computed at read time (or by scheduled job) — never persisted over a stored non-`unpaid` status.
6. **File storage** — object storage for payment proofs with type (JPG/JPEG/PNG/WebP/PDF) and size (10 MB) validation, virus scanning recommended, authenticated download URLs scoped to the owner and admin (BPAY-3).
7. **Audit trail** — server-side append-only writes for every action in RPT-3, with server timestamps and authenticated actor identity.
8. **Authorization invariants** — borrowers can only read records where `userId = self` and can only create Payment records; all writes to Loans/Transactions/Users are admin-only; assignment Undo must verify the loan was created by the admin and cascade-delete only its own transactions (CALC-7).
9. **Query support** — ledger filtering (search, borrower, effective status, per-column exact dates), aggregation (filtered amount sums, receivables by status/borrower/due-date, grand-view by date), and pagination for the ledger and audit log.
10. **Suggested API surface** (REST sketch):
    - `POST /auth/login`, `POST /auth/set-password`, `POST /auth/logout`
    - `GET|POST /users`, `PATCH|DELETE /users/:id`, `POST /users/:id/resend-invite`
    - `POST /loans` (assign — generates transactions), `DELETE /loans/:id` (undo/unassign), `GET /loans?userId=`
    - `GET /transactions?filters…` (incl. aggregates), `PATCH /transactions/bulk` (status), `PATCH /transactions/:id` (dates), `POST /transactions/archive`, `POST /transactions/restore`
    - `GET|POST /payments`, `PATCH /payments/:id` (approve/reject/re-open), `GET /payments/:id/file`
    - `GET /audit?filters…`, `GET /archives`
    - CSV endpoints or client-side generation from the same filtered queries (LGR-10, RPT-2, RPT-4, CALC-5).

---

## 10. Open Questions / Phase 2 Candidates

- **OQ-1** Should approving a payment proof optionally auto-mark the matching installment `paid` (proof ↔ installment linkage)? Currently independent by design (BR-PAY-2).
- **OQ-2** Date filters are exact-match per column (LGR-6). Range filters (from/to) may be preferable at larger data volumes.
- **OQ-3** DST manual override resets when the principal changes (CALC-4). Confirm whether a "sticky" override is ever needed.
- **OQ-4** Loan `status: closed` lifecycle (auto-close on fully paid?) is not yet surfaced in the UI.
- **OQ-5** Multi-admin support and per-admin audit attribution (current design assumes a single owner).
- **OQ-6** Retention policy for Archives and audit log.

---

## 11. Glossary

| Term | Meaning |
|---|---|
| **Add-on rate** | Flat monthly interest on the original principal (not amortizing/declining balance) |
| **DST** | Documentary Stamp Tax, BIR-mandated: ₱1.50 per ₱200 of principal or fraction |
| **Net Proceeds** | Cash actually released to the borrower after (optional) fee deduction |
| **Straight** | Single-payment transaction (e.g., a purchased item), duration = 1 |
| **Installment** | Multi-month amortized loan |
| **Ledger / Overall Transactions** | The per-installment system of record for payment status |
| **Receivable** | Installment with effective status `unpaid` or `past_due` |
| **Effective status** | Stored status after applying the automatic past-due rule |
| **RA 3765** | Philippine Truth in Lending Act (basis of the disclosure statement) |
