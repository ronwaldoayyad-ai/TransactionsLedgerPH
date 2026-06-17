// Pure logic for the admin-only Arbitrage / Interest Earnings tracker. The
// admin lends at a monthly add-on rate while sourcing funds at a lower cost
// rate; the spread plus collected fees is the net gain. Standalone records —
// independent of the amortization ledger.
import { addMonthsClamped, computeDST, parseISODate, toISODate } from './amortization'

export const DEFAULT_PROCESSING_FEE = 1500

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// DST is auto-calculated only when the principal is PHP 500,000 or more, at
// PHP 1.50 per PHP 200 (or fraction). Editable afterward.
export function autoDST(principal) {
  const P = Number(principal) || 0
  return P >= 500000 ? computeDST(P) : 0
}

// Last Payment Date is the First Payment Date advanced by the full duration
// (matches the tracker's convention: a 24-month loan first paid 2026-06-25
// ends 2028-06-25).
export function lastPaymentDate(firstPaymentDate, durationMonths) {
  const d = Math.floor(Number(durationMonths) || 0)
  if (!firstPaymentDate || d <= 0) return null
  return toISODate(addMonthsClamped(parseISODate(firstPaymentDate), d))
}

// Core figures. Rates are entered as percent-per-month (e.g. 1.79 → 1.79%).
//  borrowerInterest = principal × rate%/100 × months
//  interestCost     = principal × cost%/100 × months
//  fees   = dst + processingFee + notarialFee
//  netGain = borrowerInterest − interestCost + fees  (fees are pocketed)
export function computeArbitrage({
  principal,
  borrowerRate,
  costRate,
  durationMonths,
  dst = 0,
  processingFee = 0,
  notarialFee = 0,
}) {
  const P = Number(principal) || 0
  const months = Math.floor(Number(durationMonths) || 0)
  const borrowerInterest = round2(P * ((Number(borrowerRate) || 0) / 100) * months)
  const interestCost = round2(P * ((Number(costRate) || 0) / 100) * months)
  const fees = round2((Number(dst) || 0) + (Number(processingFee) || 0) + (Number(notarialFee) || 0))
  const netGain = round2(borrowerInterest - interestCost + fees)
  return { borrowerInterest, interestCost, fees, netGain }
}

// Overall totals across every record (drives the four stat cards).
export function summarize(records) {
  return records.reduce(
    (acc, r) => {
      const c = computeArbitrage(r)
      acc.borrowerInterest = round2(acc.borrowerInterest + c.borrowerInterest)
      acc.interestCost = round2(acc.interestCost + c.interestCost)
      acc.fees = round2(acc.fees + c.fees)
      acc.netGain = round2(acc.netGain + c.netGain)
      return acc
    },
    { borrowerInterest: 0, interestCost: 0, fees: 0, netGain: 0 },
  )
}

// Per-borrower aggregates for the summary tab.
export function byBorrower(records, users) {
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id
  const map = new Map()
  for (const r of records) {
    const c = computeArbitrage(r)
    const cur = map.get(r.userId) ?? {
      userId: r.userId,
      name: nameOf(r.userId),
      loanCount: 0,
      totalPrincipal: 0,
      totalNetGain: 0,
    }
    cur.loanCount += 1
    cur.totalPrincipal = round2(cur.totalPrincipal + (Number(r.principal) || 0))
    cur.totalNetGain = round2(cur.totalNetGain + c.netGain)
    map.set(r.userId, cur)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
