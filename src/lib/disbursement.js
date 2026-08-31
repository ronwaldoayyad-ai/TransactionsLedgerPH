// Pure calculation + constants for the Loan Disbursement feature. No UI deps.
//
// A disbursement takes an approved loan request's proceeds, subtracts fees and a
// set of hand-picked UNPAID installments from the borrower's existing loans
// (the "authorized deductions"), and yields the net amount payable. This module
// is document-only: nothing here settles the deducted installments or creates a
// loan — it just computes and shapes the figures snapshotted onto the document.

import { isReceivable } from './transactions'
import { toISODate } from './amortization'

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Fixed lender block for the document header (from the disbursement template).
export const LENDER = {
  name: 'LoanLedger PH',
  tagline: 'Financial Services & Management',
  address: '26 Road 13, Bagong Pag-asa, Quezon City, Metro Manila, Philippines',
  email: 'support@ronwaldo.com',
  contact: '+639760032493',
  tin: '306-712-666',
}

// Disbursement payout modes (the checkbox row on section C of the document).
export const DISBURSEMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'others', label: 'Others' },
]
export const DISBURSEMENT_MODE_LABEL = Object.fromEntries(
  DISBURSEMENT_MODES.map((m) => [m.value, m.label]),
)

// Status palette. `badge` maps to the shared <Badge> styles (same convention as
// INVOICE_STATUS_META). Draft is admin-only; assigned is borrower-visible.
export const DISBURSEMENT_STATUS_META = {
  draft: { label: 'Draft', badge: 'upcoming' },
  assigned: { label: 'Assigned', badge: 'invited' },
}
export const disbursementStatusMeta = (status) =>
  DISBURSEMENT_STATUS_META[status] ?? DISBURSEMENT_STATUS_META.draft

// The borrower's still-owed installments, offered to the admin as authorized
// deductions. Each item snapshots exactly what the document + jsonb column need.
// `loanLabelById` (optional) maps a loanId to its loan's label so the document
// can name the source loan in the deductions table.
export function buildDeductionItems(
  transactions,
  userId,
  today = toISODate(new Date()),
  loanLabelById = {},
) {
  return transactions
    .filter((t) => t.userId === userId && !t.archivedAt && isReceivable(t, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || String(a.id).localeCompare(String(b.id)))
    .map((t) => ({
      id: t.id,
      txnDate: t.txnDate,
      description: t.description,
      dueDate: t.dueDate,
      amount: round2(t.amount),
      sourceLoanLabel: loanLabelById[t.loanId] ?? '',
    }))
}

// Net proceeds = gross − selected installment deductions only.
//
// Processing fee, notarial fee, and DST are deliberately NOT deducted here: the
// borrower settles those on the first monthly amortization of the new loan, so
// they must not reduce the cash actually disbursed. `warning` flags an
// over-deducted document (net below zero) for the admin.
export function computeDisbursement({ grossAmount = 0, deductionItems = [] }) {
  const totalDeductions = round2(deductionItems.reduce((s, it) => s + (Number(it.amount) || 0), 0))
  const netProceeds = round2((Number(grossAmount) || 0) - totalDeductions)
  return { totalDeductions, netProceeds, warning: netProceeds < 0 }
}

// Gross as a percentage of the total sanctioned loan (section A of the document).
export function percentageOfTotal(grossAmount, sanctionedAmount) {
  const S = Number(sanctionedAmount) || 0
  if (!S) return 0
  return round2(((Number(grossAmount) || 0) / S) * 100)
}
