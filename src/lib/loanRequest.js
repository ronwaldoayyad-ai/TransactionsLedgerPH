// Pure calculation + constants for the borrower Loan Request feature.
// No UI dependencies. Reuses the shared amortization engine so the request
// preview matches what the admin sees in the Calculator / disclosure.

import { autoDST } from './amortization'

export const TERMS = [3, 6, 12, 24, 36]

// Fees (per the PRD + clarifications): processing is a flat one-time charge;
// notarial is 0.35% of the amount; DST auto-applies at ≥₱500k. Notarial + DST
// are auto-computed at submission but stay admin-editable per request.
export const PROCESSING_FEE = 1500
export const NOTARIAL_RATE = 0.0035
// Notarial fee applies only when the loan amount reaches this threshold
// (same ₱500k cutoff as DST).
export const NOTARIAL_THRESHOLD = 500000

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export function computeNotarial(amount) {
  const A = Number(amount) || 0
  return A >= NOTARIAL_THRESHOLD ? round2(A * NOTARIAL_RATE) : 0
}

// DST mirrors the disclosure engine (₱1.50 per ₱200, only when ≥₱500k).
export function computeRequestDST(amount) {
  return autoDST(amount)
}

// Ordered status workflow. `tone` maps to the Badge palette used app-wide.
export const REQUEST_STATUSES = [
  { key: 'submitted', label: 'Submitted', tone: 'submitted' },
  { key: 'pending', label: 'Pending / Under Review', tone: 'pending' },
  { key: 'coordinating', label: 'Coordinating with Bank', tone: 'coordinating' },
  { key: 'bank_approved', label: 'Bank Approved', tone: 'bank_approved' },
  { key: 'transfer', label: 'Transfer in Progress', tone: 'transfer' },
  { key: 'completed', label: 'Completed', tone: 'completed' },
  { key: 'declined', label: 'Declined / Rejected', tone: 'declined' },
  { key: 'canceled', label: 'Canceled', tone: 'canceled' },
]

export const STATUS_LABEL = Object.fromEntries(REQUEST_STATUSES.map((s) => [s.key, s.label]))

// Default admin-note copy auto-filled when the admin picks a status.
export const STATUS_NOTES = {
  submitted:
    'Your application has been successfully received and is now waiting to be picked up for processing.',
  pending: 'Your application has been received and is currently being evaluated.',
  coordinating:
    'We are currently verifying your details with the bank to ensure everything is in order.',
  declined:
    'Unfortunately, your application does not meet the current requirements for approval at this time.',
  canceled: 'Your loan application has been closed at your request or because the offer expired.',
  bank_approved:
    'Your loan has been officially approved by the bank and is being processed for disbursement.',
  transfer:
    'Your funds are on their way! The money is currently being sent to your designated bank account.',
  completed: 'Your loan has been successfully processed, and the funds have been transferred.',
}

// Statuses that end the workflow, and the early set a borrower may still cancel.
export const TERMINAL_STATUSES = ['completed', 'declined', 'canceled']
export const CANCELABLE_STATUSES = ['submitted', 'pending', 'coordinating']

// A borrower can cancel their own request only while it is still early.
export const canCancel = (status) => CANCELABLE_STATUSES.includes(status)
export const isTerminal = (status) => TERMINAL_STATUSES.includes(status)

// Flat add-on monthly installment: ((A * R * T) + A) / T.
export function monthlyInstallment(amount, monthlyRate, termMonths) {
  const A = Number(amount) || 0
  const R = Number(monthlyRate) || 0
  const T = Math.floor(Number(termMonths) || 0)
  if (!A || !T) return 0
  return round2((A * R * T + A) / T)
}

// Borrower-facing amortization preview: a uniform flat-add-on installment each
// month, with the one-time fees (processing + notarial + DST) folded into the
// first month. Remaining balance is the outstanding principal after each month.
export function buildRequestSchedule({
  amount,
  termMonths,
  monthlyRate,
  processingFee = PROCESSING_FEE,
  notarialFee = 0,
  dst = 0,
}) {
  const A = Number(amount) || 0
  const T = Math.floor(Number(termMonths) || 0)
  if (!A || !T) return []
  const monthly = monthlyInstallment(A, monthlyRate, T)
  const fees = round2((Number(processingFee) || 0) + (Number(notarialFee) || 0) + (Number(dst) || 0))
  const rows = []
  for (let m = 1; m <= T; m += 1) {
    rows.push({
      month: m,
      description: m === 1 ? 'Installment + Fees + DST' : 'Monthly Installment',
      totalPayment: round2(monthly + (m === 1 ? fees : 0)),
      remainingBalance: round2((A * (T - m)) / T),
    })
  }
  return rows
}

// Compact figures for the summary panel.
export function requestSummary({ amount, termMonths, monthlyRate, notarialFee, dst }) {
  const A = Number(amount) || 0
  const notarial = notarialFee != null ? round2(notarialFee) : computeNotarial(A)
  const dstAmount = dst != null ? round2(dst) : computeRequestDST(A)
  const monthly = monthlyInstallment(A, monthlyRate, termMonths)
  const firstMonthTotal = round2(monthly + PROCESSING_FEE + notarial + dstAmount)
  return { monthlyInstallment: monthly, firstMonthTotal, processing: PROCESSING_FEE, notarial, dst: dstAmount }
}
