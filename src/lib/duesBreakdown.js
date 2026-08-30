// Borrower "Dues Overview" derivation. Pure + testable: given a borrower's own
// transactions (and optionally one loan), it produces everything the donut and
// its three insight cards need. Installment-only — Straight items live in their
// own tile and don't belong to a repayment schedule.
//
// Mirror of mobile/src/lib/duesBreakdown.ts. Keep the two in sync.
import { effectiveStatus } from './transactions'
import { parseISODate, toISODate } from './amortization'

// Fixed segment order + palette (mirrors the app's navy/gold/emerald brand).
const SEGMENT_META = [
  { key: 'paid', label: 'Paid', color: '#10b981' },
  { key: 'upcoming', label: 'Upcoming', color: '#2a5085' },
  { key: 'due', label: 'Due today', color: '#ca8a04' },
  { key: 'past_due', label: 'Past Due', color: '#dc2626' },
]

// Which donut segment a transaction belongs to. Refunded/cancelled fall out of
// the obligation entirely (return null) so they never inflate the denominator.
function segmentFor(t, today) {
  const s = effectiveStatus(t, today)
  if (s === 'paid') return 'paid'
  if (s === 'past_due') return 'past_due'
  if (s === 'unpaid') return t.dueDate === today ? 'due' : 'upcoming'
  return null // refunded / cancelled
}

const daysBetween = (fromISO, toISO) =>
  Math.round((parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / 86_400_000)

export function buildDuesBreakdown(transactions, today = toISODate(new Date()), loanId) {
  const items = transactions.filter(
    (t) => t.type === 'Installment' && (!loanId || t.loanId === loanId),
  )

  const totals = {
    paid: { amount: 0, count: 0 },
    upcoming: { amount: 0, count: 0 },
    due: { amount: 0, count: 0 },
    past_due: { amount: 0, count: 0 },
  }

  for (const t of items) {
    const key = segmentFor(t, today)
    if (!key) continue
    totals[key].amount += t.amount
    totals[key].count += 1
  }

  const segments = SEGMENT_META.map((m) => ({
    ...m,
    amount: totals[m.key].amount,
    count: totals[m.key].count,
  }))

  const totalAmount = segments.reduce((s, seg) => s + seg.amount, 0)
  const totalCount = segments.reduce((s, seg) => s + seg.count, 0)
  const paidAmount = totals.paid.amount
  const paidCount = totals.paid.count
  const remainingAmount = totalAmount - paidAmount
  const remainingCount = totalCount - paidCount

  // Next payment: the earliest still-owed due date, aggregated across any items
  // sharing it. Past due dates sort first, so the most urgent surfaces.
  const owed = items.filter((t) => {
    const s = effectiveStatus(t, today)
    return s === 'unpaid' || s === 'past_due'
  })
  let nextPayment = null
  if (owed.length > 0) {
    const dueDate = owed.reduce((min, t) => (t.dueDate < min ? t.dueDate : min), owed[0].dueDate)
    const onDate = owed.filter((t) => t.dueDate === dueDate)
    const daysUntil = daysBetween(today, dueDate)
    nextPayment = {
      dueDate,
      amount: onDate.reduce((s, t) => s + t.amount, 0),
      count: onDate.length,
      daysUntil,
      kind: daysUntil < 0 ? 'past_due' : daysUntil === 0 ? 'due' : 'upcoming',
    }
  }

  // On-time streak: walk paid installments newest-first by due date and count
  // how many in a row were settled on or before their due date. A missing
  // datePaid or the first late payment ends the streak.
  const paidItems = items
    .filter((t) => effectiveStatus(t, today) === 'paid')
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
  let streak = 0
  for (const t of paidItems) {
    if (t.datePaid && t.datePaid <= t.dueDate) streak += 1
    else break
  }

  // Payoff: last scheduled due date across the whole obligation.
  const payoffDate =
    items.length > 0
      ? items.reduce((max, t) => (t.dueDate > max ? t.dueDate : max), items[0].dueDate)
      : null

  return {
    segments,
    totalAmount,
    totalCount,
    paidAmount,
    paidCount,
    remainingAmount,
    remainingCount,
    paidPctAmount: totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0,
    paidPctCount: totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0,
    isEmpty: items.length === 0,
    allSettled: totalCount > 0 && remainingCount === 0,
    nextPayment,
    streak,
    payoff: {
      paidCount,
      totalCount,
      pct: totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0,
      payoffDate,
    },
  }
}
