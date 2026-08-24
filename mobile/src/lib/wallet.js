// Pure logic for the admin-only Card & Bills Wallet. Self-contained — no
// dependency on the loan/transaction domain.
import { parseISODate } from './amortization'

export const NETWORKS = ['Visa', 'Mastercard', 'Amex', 'JCB', 'Discover', 'Diners Club', 'UnionPay']
export const TIERS = ['Classic', 'Gold', 'Platinum', 'Signature', 'World', 'World Elite', 'Infinite', 'Prestige']
export const CATEGORIES = ['Cashback', 'Travel', 'Rewards']

// Income categories for the Accounts "Add Income" flow.
export const INCOME_CATEGORIES = ['Salary', 'Funds Transfer', 'Business Profit', 'Dividends', 'Others']

// Last 4 digits of an account number (e.g. "7890"), used as a compact account label.
export function accountLast4(a) {
  const digits = String(a?.accountNumber || '').replace(/\s/g, '')
  return digits.slice(-4) || '••••'
}

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

// ----- Accounts -----

// Masked account label for dropdowns/tiles, e.g. "BPI******1234".
export function accountMask(a) {
  if (!a) return ''
  const code = (a.bankCode || a.bankName || '').toUpperCase()
  const digits = String(a.accountNumber || '').replace(/\s/g, '')
  const last4 = digits.slice(-4) || '••••'
  return `${code}******${last4}`
}

// Deterministic gradient pair from a seed (accounts carry no color fields), so
// each bank's tile looks distinct.
const ACCOUNT_PALETTE = [
  ['#0f766e', '#14b8a6'], ['#1e3a8a', '#3b82f6'], ['#7c2d12', '#ea580c'],
  ['#581c87', '#a855f7'], ['#0c4a6e', '#0ea5e9'], ['#134e4a', '#10b981'],
  ['#3f3f46', '#71717a'], ['#7f1d1d', '#dc2626'],
]
export function accountColors(seed) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ACCOUNT_PALETTE[h % ACCOUNT_PALETTE.length]
}

// Totals across accounts. "deducted" = sum of bill payments sourced from an
// account (those carrying an accountId).
export function accountTotals(accounts, payments) {
  const available = accounts.reduce((s, a) => s + (Number(a.availableBalance) || 0), 0)
  const deducted = payments.filter((p) => p.accountId).reduce((s, p) => s + (Number(p.amount) || 0), 0)
  return { count: accounts.length, available: round2(available), deducted: round2(deducted) }
}

// Group account-sourced deductions by 'account' | 'bank' | 'month'.
export function groupDeducted(payments, accounts, by) {
  const byId = (id) => accounts.find((a) => a.id === id)
  const groups = new Map()
  payments
    .filter((p) => p.accountId)
    .forEach((p) => {
      const a = byId(p.accountId)
      let key
      let label
      if (by === 'bank') {
        // Group/label by bank code (fall back to bank name only if no code).
        key = (a?.bankCode || a?.bankName || 'Unknown').trim() || 'Unknown'
        label = key
      } else if (by === 'month') {
        key = String(p.paidOn || '').slice(0, 7)
        label = key
      } else {
        // Label accounts by their last 4 digits only.
        key = p.accountId
        label = a ? accountLast4(a) : 'Unknown account'
      }
      const cur = groups.get(key) ?? { key, label, amount: 0 }
      cur.amount = round2(cur.amount + (Number(p.amount) || 0))
      groups.set(key, cur)
    })
  const arr = [...groups.values()]
  return by === 'month'
    ? arr.sort((x, y) => y.key.localeCompare(x.key))
    : arr.sort((x, y) => y.amount - x.amount)
}

export { round2 as walletRound2 }
