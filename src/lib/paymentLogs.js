// Pure logic for the Payment Logs ledger (admin records payments received from
// borrowers). Independent of the amortization ledger — these helpers only READ
// transactions to compute how much a borrower owes; they never mutate them.
import { formatDate } from './amortization'
import { isReceivable } from './transactions'

export const PAY_LOG_METHODS = ['GCash', 'Maya', 'Bank Transfer', 'Cash']

// Allocation statuses. Settled/Overpayment/Underpayment are computed by
// `allocate`; "Credited" is set manually by the admin when editing a log.
export const PAY_LOG_STATUSES = ['Settled', 'Overpayment', 'Underpayment', 'Credited']

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
