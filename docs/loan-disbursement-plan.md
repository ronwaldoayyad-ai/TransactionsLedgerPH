# Loan Disbursement — Implementation Plan

Status: **Planned** · Scope: **Web app first (admin + borrower)** · Ledger side-effects: **none (document-only)**

## Overview

An admin-generated **Loan Disbursement** document, modeled on the existing **Invoices** feature.
From an **approved loan request**, the admin picks specific **unpaid installments** from the
borrower's existing loans to deduct, the totals auto-compute, and the admin issues a document
showing **net proceeds = gross − fees − deductions**. On assign, the borrower receives a
notification **with the PDF attached**. The borrower **acknowledges via a checkbox**, which fires a
**notification to the admin's inbox**. No writes to `public.loans` (document-only for this phase).

### Key decisions (locked)
- **Deduction source:** specific unpaid installments (line-item picker, like Invoices) — not whole loans.
- **Trigger:** admin generates manually after approval (not auto-on-approval).
- **Loan creation:** document only — admin still creates the real loan via the Calculator.
- **Clients:** web app first; Expo mobile port deferred.
- **Assign notification:** client-side notification carrying the generated PDF (mirrors the invoice
  flow, which deliberately dropped its DB trigger in `20260906` because a trigger can't attach a
  jsPDF-rendered PDF).
- **Acknowledgment:** borrower checkbox (not a wet signature) → notifies the admin.
- **Admin alert:** build a real admin notification inbox/bell (the app currently delivers
  notifications to borrowers only).
- **Generate unlocks** at request status `bank_approved` and stays available through `completed`.
- **Reference No** on the document = the loan request's `reference`; `DISB-YYYY-###` is the internal
  unique number.

## Source model (confirmed)
- Loan requests: `supabase/migrations/20260703000000_loan_requests.sql` — 8-status workflow;
  approving does **not** create a real loan.
- Borrower existing loans: `public.loans`, surfaced as derived installment "transactions"
  (`src/lib/transactions.js`, `src/pages/user/ConsolidatedLoans.jsx`).
- Structural template: Invoices — `supabase/migrations/20260826000000_invoices.sql`,
  `src/context/InvoicesContext.jsx`, `src/lib/invoice.js`, `src/lib/invoicePdf.js`,
  `src/pages/admin/Invoices.jsx`.

---

## Phase 1 — DB migration `supabase/migrations/2026XXXX_loan_disbursements.sql`

**Table `public.loan_disbursements`:**
`id, disbursement_number (DISB-YYYY-###), reference, request_id → loan_requests,
user_id → profiles, status ('draft'|'assigned'), disbursement_date, agreement_date,
loan_account_number, bank_name, bank_account_number, bank_account_name,
total_sanctioned_amount, gross_amount, percentage_of_total, value_date,
processing_fee, notarial_fee, dst, total_deductions, net_proceeds,
disbursement_mode ('bank_transfer'|'check'|'cash'|'others'), deduction_items jsonb,
acknowledged_at, acknowledged_by, created_by, created_at, updated_at`

**RLS** (copy invoice policies): borrower reads own **assigned**; admin reads all;
admin-only insert/update/delete.

**RPCs (SECURITY DEFINER):**
- `create_loan_disbursement(...)` — `is_admin()` guard + `pg_advisory_xact_lock` on the year +
  `DISB-YYYY-###` numbering + insert as `draft`. Mirrors `create_invoice`.
- `acknowledge_loan_disbursement(p_id)` — verifies the row is `auth.uid()`'s own, `status='assigned'`,
  not already acknowledged; stamps `acknowledged_at/by`; **then inserts the admin notification**
  (`audience='targeted'`, `target_user_ids = (select array_agg(id) from profiles where role='admin')`,
  `created_by = auth.uid()`). Definer-side because notification insert is admin-only and the borrower
  cannot write the disbursement directly.

**No DB triggers** (assign→PDF notification is client-side). Add table to `supabase_realtime`.

## Phase 2 — `src/lib/disbursement.js`
- `LENDER` constants (org name, address, email, contact, TIN — from the mockup).
- `buildDeductionItems(transactions, userId, today)` → borrower's unpaid/receivable installments as
  `{ id, description, dueDate, amount, sourceLoanLabel }`.
- `computeDisbursement({ grossAmount, processingFee, notarialFee, dst, deductionItems })` →
  `{ totalDeductions, netProceeds, warning }` (warn if `netProceeds < 0`).
- `DISBURSEMENT_MODES`, `DISBURSEMENT_STATUS_META`.

## Phase 3 — `src/context/DisbursementsContext.jsx`
Near-verbatim copy of `InvoicesContext`: `fetchAll` + realtime; `createDisbursement`,
`assignDisbursement`, `updateDisbursementStatus`, `deleteDisbursement`, `acknowledgeDisbursement(id)`.
Wrap in `App.jsx`.

## Phase 4 — Admin
- **Generate from approved request** (`src/pages/admin/LoanRequests.jsx`): "Generate Disbursement"
  action on rows at `bank_approved`+ → `GenerateDisbursementModal` (borrower/gross/fees prefilled from
  request; checkbox list of unpaid installments with live running total; live net-proceeds; mode
  selector; agreement/value dates) → `createDisbursement`.
- **`src/pages/admin/Disbursements.jsx`** (model on `admin/Invoices.jsx`): list, view, assign, status,
  delete, Download PDF, and an **"Accepted ✓ (date)"** column from `acknowledged_at` (realtime).
- **`doAssignDisbursement`** mirrors `doAssign` in `admin/Invoices.jsx`: `assignDisbursement(id)` →
  `createNotification({ title:'💸 Loan Disbursement Ready', audience:'targeted',
  targetUserIds:[userId], attachments:[disbursementPdfAttachment(toPdf(d))] })` in try/catch.

## Phase 5 — Borrower
- **`src/pages/user/Disbursements.jsx`** ("My Disbursements"): list own assigned, detail, Download PDF.
- **Acknowledgment checkbox** on the detail view: "I acknowledge the gross amount, itemized
  deductions, and net amount, and accept the agreement." → `acknowledgeDisbursement(id)`; locks +
  shows timestamp once checked.

## Phase 6 — Notification infra (for the admin bell)
Edits to `src/context/NotificationsContext.jsx`:
- Add derived **`inboxNotifications`** = notifications where `targetsMe(me) && created_by !== me`.
- **`unreadCount`**: drop `if (isAdmin) return 0`; compute from `inboxNotifications` minus `myReadIds`
  for everyone.
- **`fetchReads` / `markRead` / `markUnread`**: remove the `isAdmin` early-returns (the
  `notification_reads` RLS already permits own-row writes for any authenticated user).
- **Admin Notifications page** (`src/pages/admin/Notifications.jsx`): split into **"Inbox"** (received:
  `targetsMe && created_by !== me`) and the existing **"Sent"** (authored). The AppShell bell badge on
  `/admin/notifications` keys off `unreadCount`, so it lights up automatically.

## Phase 7 — PDF `src/lib/disbursementPdf.js`
Mirror `src/lib/invoicePdf.js`: `buildDisbursementDoc` (full mockup layout — header/parties/preamble/
A gross/B deductions table/C net+mode/D instructions/acknowledgment line), `downloadDisbursementPdf`,
`disbursementPdfBlobUrl`, `disbursementPdfAttachment`. Acknowledgment renders the e-acknowledgment line
(blank, or "Acknowledged electronically by [name] on [date]").

## Wiring
`App.jsx` (provider + 2 lazy routes); `src/components/AppShell.jsx` (admin "Disbursements", borrower
"My Disbursements").

## Build order
Phase 1 → 2 → 3 → 6 (infra) → 4 (admin) → 5 (borrower) → 7 (PDF).

## Document layout (from the mockup `loanledger_disbursement_template.docx`)
- Header: "LOANLEDGER PH — Financial Services & Management" · **LOAN DISBURSEMENT** · Loan Reference No · Disbursement Date
- Parties: LENDER (fixed org details incl. TIN) | BORROWER (Full Name, Bank Name, Bank Account Number)
- Preamble: governed by Loan Agreement dated […] · Loan Account Number · Total Sanctioned Loan Amount
- A. Gross Disbursement Amount: Gross under this tranche · Percentage of Total Loan · Value Date
- B. Deductions: acknowledgment text + deductions table (Description | Due Date | Amount + Total)
- C. Net Disbursement Amount: Gross − Total Deductions · Mode of Disbursement (Bank Transfer/Check/Cash/Others)
- D. Instructions & Special Conditions
- Acknowledgment & Authorization: e-acknowledgment line (replaces wet signature)
- Footer: "Thank you for trusting LoanLedger PH…"
