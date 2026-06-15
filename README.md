# LoanLedger PH — Loan Amortization App (Phase 1 MVP front-end)

Design-phase front-end prototype implementing the **App MVP Master Plan** (June 11, 2026).
All data is mocked in-memory; no backend is required to run or demo it.

**See [PRD.md](PRD.md)** for the complete Product Requirements Document — the authoritative
spec (requirement IDs, business rules, data contracts) for Phase 2 backend implementation.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. The login page includes a **Demo access** panel to enter as:

- **Admin** — Command Center (overview, calculator, verification queue, user CRUD, audit logs)
- **Maria Santos / Jose Ramirez** — active borrowers with seeded loans and payments
- **Ana Dela Cruz** — invited user, demonstrates the forced first-login password setup

## Scope coverage vs. master plan

| Plan section | Where |
|---|---|
| Two-tier RBAC | `src/App.jsx` route guards (`Protected role=…`) |
| Invite-only auth + first-login password | `src/pages/Login.jsx`, `src/pages/SetPassword.jsx`, invite flow in Users page |
| Personal dashboard (loans, net proceeds, balances) | `src/pages/user/UserDashboard.jsx`, `LoanDetail.jsx` |
| Payment proof upload + status badges | `src/pages/user/Payments.jsx` |
| Global user management (CRUD) | `src/pages/admin/Users.jsx` |
| Verification queue (approve/reject) | `src/pages/admin/Queue.jsx` |
| Overall transactions ledger (filters, editable dates, 5 statuses, auto past-due, bulk updates, delete-to-archive) | `src/pages/admin/Transactions.jsx` |
| Archives of deleted ledger records (with restore) | `src/pages/admin/Logs.jsx` (Archives tab) |
| Receivables analytics (by status/borrower/due date) + Grand View | `src/pages/admin/AdminDashboard.jsx` |
| Borrower consolidated loans view (due-date filter) | `src/pages/user/ConsolidatedLoans.jsx` |
| Reporting, audit trail, CSV export | `src/pages/admin/Logs.jsx` |
| Amortization & disclosure module | `src/pages/admin/Calculator.jsx` |
| In-app assignment + external share | Calculator → Distribution card (Web Share API with clipboard fallback) |

## Calculation engine

`src/lib/amortization.js` is a pure, UI-free module intended to be ported to the
backend in Phase 2:

- **DST**: `Math.ceil(P / 200) * 1.50` (BIR mandate), auto-calculated but editable —
  a manual edit holds until the principal changes, which re-syncs the auto value
- **Fee handling**: "Deduct from the Loan Proceeds" checked → fees come out of the
  principal (net proceeds = P − deductions); unchecked → borrower receives the full
  principal and the fees are collected as part of the first amortization payment
- **Schedule**: principal `P / D`, interest `P * R`, total per row, TOTALS footer
- **Final-month rounding**: last row absorbs the fractional-cent remainder so
  principal sums exactly to P
- **Date rollover**: payment dates anchor to the first payment date and clamp to
  month-end (Jan 31 → Feb 28/29 → Mar 31), leap-year aware

## Mock data & state

- `src/data/mock.js` — seed users, loans, payments, audit log (proposed API shapes)
- `src/context/AppContext.jsx` — in-memory store standing in for the backend;
  every mutation writes an audit entry, mirroring the planned server-side trail
- `transactions` (one record per amortization installment, across all loans) is
  the single source of truth for payment status: the admin's Overall
  Transactions ledger writes to it, and the borrower dashboard, loan detail,
  and admin KPIs all derive their balances and progress from it

## Out of scope (per plan)

Payment gateways, OCR receipt scanning, and in-app chat are intentionally absent.
File uploads capture metadata only (no storage); email invitations are simulated.
