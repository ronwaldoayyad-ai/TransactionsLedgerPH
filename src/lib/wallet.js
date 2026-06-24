// Pure logic for the admin-only Card & Bills Wallet. Self-contained — no
// dependency on the loan/transaction domain.
import { parseISODate } from './amortization'

export const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'Discover', 'Diners Club', 'UnionPay']
export const TIERS = ['Classic', 'Gold', 'Platinum', 'Signature', 'World', 'World Elite', 'Infinite', 'Prestige']
export const CATEGORIES = ['Cashback', 'Travel', 'Rewards']

// Card-network logos from public Wikimedia Commons SVGs (FR1.6). If a URL fails
// to load the UI hides it entirely — there is no text fallback.
export const NETWORK_SVG = {
  Visa: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Visa_Inc._logo_%282021%E2%80%93present%29.svg',
  Mastercard: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg',
  Amex: 'https://upload.wikimedia.org/wikipedia/commons/3/30/American_Express_logo.svg',
  JCB: 'https://upload.wikimedia.org/wikipedia/commons/4/40/JCB_logo.svg',
  Discover: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Discover_Card_logo.svg',
  'Diners Club': 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Diners_Club_Logo3.svg',
  UnionPay: 'https://upload.wikimedia.org/wikipedia/commons/1/1b/UnionPay_logo.svg',
}
export const cardNetworkSvg = (network) => NETWORK_SVG[network] ?? null

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Whole days from today (ISO) to a due date (ISO). Negative = overdue.
export function daysUntil(dueDate, today) {
  if (!dueDate) return 0
  const a = parseISODate(today)
  const b = parseISODate(dueDate)
  return Math.round((b - a) / 86400000)
}

// Bill lifecycle (FR2.3) from its payments:
//   paid     → remaining <= 0
//   past_due → remaining > 0 and due date passed
//   pending  → remaining > 0 and due date in the future/today
// `partial` is a flag (some paid, still owing) used by the analytics donut.
export function billState(bill, payments, today) {
  const paid = round2(
    payments.filter((p) => p.billId === bill.id).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
  const remaining = round2((Number(bill.amountDue) || 0) - paid)
  let status
  if (remaining <= 0) status = 'paid'
  else if (bill.dueDate < today) status = 'past_due'
  else status = 'pending'
  return { paid, remaining: Math.max(0, remaining), status, partial: paid > 0 && remaining > 0 }
}

// Dynamic urgency badge (FR2.4).
export function urgencyBadge(bill, today) {
  const d = daysUntil(bill.dueDate, today)
  if (d < 0) return { tone: 'red', label: `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} overdue` }
  if (d <= 5) return { tone: 'orange', label: d === 0 ? 'Due today' : `${d} day${d === 1 ? '' : 's'} left` }
  return { tone: 'blue', label: `${d} days left` }
}

// How long the card has been held — measured from the activation date to
// today (the expiry date is deliberately ignored).
export function cardAge(activationDate, today) {
  if (!activationDate) return null
  const a = parseISODate(activationDate)
  const t = parseISODate(today)
  if (a > t) return { years: 0, months: 0 }
  let months = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth())
  if (t.getDate() < a.getDate()) months -= 1
  if (months < 0) months = 0
  return { years: Math.floor(months / 12), months: months % 12 }
}

export function cardAgeLabel(activationDate, today) {
  const age = cardAge(activationDate, today)
  if (!age) return '—'
  const parts = []
  if (age.years) parts.push(`${age.years} year${age.years === 1 ? '' : 's'}`)
  parts.push(`${age.months} month${age.months === 1 ? '' : 's'}`)
  return parts.join(', ')
}

// Global portfolio totals across all cards (FR3.1).
export function portfolioTotals(cards) {
  return cards.reduce(
    (a, c) => ({
      creditLimit: round2(a.creditLimit + (Number(c.creditLimit) || 0)),
      availableLimit: round2(a.availableLimit + (Number(c.availableLimit) || 0)),
    }),
    { creditLimit: 0, availableLimit: 0 },
  )
}

export { round2 as walletRound2 }
