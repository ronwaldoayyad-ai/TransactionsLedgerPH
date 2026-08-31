// Pure logic for the Payment Logs ledger (admin records payments received from
// borrowers). Independent of the amortization ledger — these helpers only READ
// transactions to compute how much a borrower owes; they never mutate them.
import { formatDate, formatManilaDateTime, formatPeso } from './amortization'
import { isReceivable } from './transactions'

// "Manual Credit" = the borrower's overpayment is credited against their amount
// due rather than received as new funds.
export const PAY_LOG_METHODS = ['GCash', 'Maya', 'Bank Transfer', 'Cash', 'Manual Credit']

// Allocation statuses. Settled/Overpayment/Underpayment are computed by
// `allocate`; "Credited" is set manually by the admin when editing a log.
export const PAY_LOG_STATUSES = ['Settled', 'Overpayment', 'Underpayment', 'Credited']

// Per-status copy for the borrower notification fired when an admin records a
// payment. Keyed by allocStatus; the amounts are appended by paymentLogNotification.
const PAY_LOG_STATUS_COPY = {
  Settled: {
    emoji: '✅',
    label: 'Payment Received',
    lead: 'We have received your payment and applied it in full — your balance for this bill is fully settled.',
  },
  Overpayment: {
    emoji: '💰',
    label: 'Payment Received (Overpayment)',
    lead: 'We have received your payment. It covers the amount due in full, and the excess has been credited to your account for your next bill.',
  },
  Underpayment: {
    emoji: '⚠️',
    label: 'Partial Payment Received',
    lead: 'We have received your payment, but it is short of the amount due. A remaining balance is carried to your next bill.',
  },
  Credited: {
    emoji: '🧾',
    label: 'Credit Applied',
    lead: 'A credit has been applied to your account against the amount due.',
  },
}

// Build the borrower notification for a recorded payment log. Message is dynamic
// per allocation status and includes the key figures (funds applied, remaining
// balance) plus the reference/subject so the borrower can reconcile it.
export function paymentLogNotification(log, at = new Date()) {
  const copy = PAY_LOG_STATUS_COPY[log.allocStatus] ?? {
    emoji: '🧾',
    label: 'Payment Recorded',
    lead: 'A payment has been recorded on your account.',
  }
  const lines = [
    copy.lead,
    '',
    `Funds Applied: ${formatPeso(log.fundsApplied)}`,
    `Remaining Balance: ${formatPeso(log.remainingBalance)}`,
  ]
  if (log.reference) lines.push(`Reference: ${log.reference}`)
  if (log.subject) lines.push(`Subject: ${log.subject}`)
  const stamp = formatManilaDateTime(at)
  if (stamp) lines.push(`Recorded: ${stamp}`)
  return {
    category: 'payment',
    title: `${copy.emoji} ${copy.label}`,
    body: lines.join('\n'),
  }
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Editable default for the Subject field (3).
export function defaultSubject(dueDate) {
  return `Payment Acknowledgement for ${dueDate ? formatDate(dueDate) : '—'}`
}

// (4) Amount Owed = sum of a borrower's still-receivable installments
// (unpaid + past due) with a due date on or before the chosen cutoff.
export function computeAmountOwed(transactions, userId, dueDate, today) {
  if (!userId) return 0
  const sum = transactions
    .filter(
      (t) =>
        t.userId === userId &&
        isReceivable(t, today) &&
        (!dueDate || t.dueDate <= dueDate),
    )
    .reduce((s, t) => s + Number(t.amount || 0), 0)
  return round2(sum)
}

// Pre-filled, editable Amount Owed: sum of receivables up to the cutoff date.
// (No "carried forward" netting — that behavior has been removed.)
export function suggestedAmountOwed(transactions, userId, dueDate, today) {
  return computeAmountOwed(transactions, userId, dueDate, today)
}

// (7) Remaining Balance + Allocation Status from Amount Owed vs Funds Applied.
//  funds == owed → Settled (0.00)
//  funds  > owed → Overpayment (excess, positive)
//  funds  < owed → Underpayment (shortfall, negative)
export function allocate(amountOwed, fundsApplied) {
  const remaining = round2(Number(fundsApplied || 0) - Number(amountOwed || 0))
  const status = remaining > 0 ? 'Overpayment' : remaining < 0 ? 'Underpayment' : 'Settled'
  return { remaining, status }
}
