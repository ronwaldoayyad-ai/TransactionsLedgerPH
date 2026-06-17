// Pure logic for the admin-only Loan Tracker (the admin's personal record of
// loans availed from banks). Standalone — independent of every other table.
import { addMonthsClamped, parseISODate, toISODate } from './amortization'

// Active universal/commercial banks in the Philippines. Each entry carries a
// full name, short acronym, brand color, and website domain (for Clearbit
// logos with an initials fallback).
export const BANKS = [
  { name: 'BDO Unibank', acronym: 'BDO', color: '#003B7A', domain: 'bdo.com.ph' },
  { name: 'Bank of the Philippine Islands', acronym: 'BPI', color: '#A6192E', domain: 'bpi.com.ph' },
  { name: 'Metrobank', acronym: 'MBT', color: '#004A99', domain: 'metrobank.com.ph' },
  { name: 'Land Bank of the Philippines', acronym: 'LBP', color: '#017A3D', domain: 'landbank.com' },
  { name: 'China Banking Corporation', acronym: 'CBC', color: '#E2231A', domain: 'chinabank.ph' },
  { name: 'RCBC', acronym: 'RCBC', color: '#003594', domain: 'rcbc.com' },
  { name: 'Security Bank', acronym: 'SECB', color: '#C8102E', domain: 'securitybank.com' },
  { name: 'Philippine National Bank', acronym: 'PNB', color: '#00529B', domain: 'pnb.com.ph' },
  { name: 'Development Bank of the Philippines', acronym: 'DBP', color: '#1B3A6B', domain: 'dbp.ph' },
  { name: 'UnionBank of the Philippines', acronym: 'UBP', color: '#F58220', domain: 'unionbankph.com' },
  { name: 'EastWest Bank', acronym: 'EW', color: '#00539B', domain: 'eastwestbanker.com' },
  { name: 'Asia United Bank', acronym: 'AUB', color: '#DA291C', domain: 'aub.com.ph' },
  { name: 'Bank of Commerce', acronym: 'BNCOM', color: '#E03A3E', domain: 'bankcom.com.ph' },
  { name: 'Maybank Philippines', acronym: 'MAY', color: '#FFC72C', domain: 'maybank.com.ph' },
  { name: 'HSBC Philippines', acronym: 'HSBC', color: '#DB0011', domain: 'hsbc.com.ph' },
  { name: 'Philtrust Bank', acronym: 'PTC', color: '#1A4789', domain: 'philtrustbank.com' },
  { name: 'Philippine Veterans Bank', acronym: 'PVB', color: '#00563F', domain: 'veteransbank.com.ph' },
]

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Flat add-on interest, same engine as the borrower disclosures.
//  interest  = principal × rate%/100 × months
//  repayment = principal + interest
//  monthly   = repayment / months
export function computeLoan({ principal, monthlyRate, durationMonths }) {
  const P = Number(principal) || 0
  const months = Math.floor(Number(durationMonths) || 0)
  const interest = round2(P * ((Number(monthlyRate) || 0) / 100) * months)
  const repayment = round2(P + interest)
  const monthly = months > 0 ? round2(repayment / months) : 0
  return { interest, repayment, monthly }
}

// Last Payment Date = First Payment Date + (Duration − 1) months.
export function lastPaymentDate(firstPaymentDate, durationMonths) {
  const d = Math.floor(Number(durationMonths) || 0)
  if (!firstPaymentDate || d < 1) return null
  return toISODate(addMonthsClamped(parseISODate(firstPaymentDate), d - 1))
}

// Fully paid once the last payment date is strictly before today.
export function isFullyPaid(loan, today) {
  const last = lastPaymentDate(loan.firstPaymentDate, loan.durationMonths)
  return !!last && last < today
}

// Grand totals plus a per-bank breakdown for the three summary tiles.
export function portfolioSummary(loans) {
  let principal = 0
  let interest = 0
  let repayment = 0
  const banks = new Map()
  for (const l of loans) {
    const c = computeLoan(l)
    principal = round2(principal + (Number(l.principal) || 0))
    interest = round2(interest + c.interest)
    repayment = round2(repayment + c.repayment)
    const b = banks.get(l.bankName) ?? {
      name: l.bankName,
      acronym: l.bankAcronym,
      color: l.bankColor,
      domain: l.bankDomain,
      principal: 0,
      interest: 0,
      repayment: 0,
    }
    b.principal = round2(b.principal + (Number(l.principal) || 0))
    b.interest = round2(b.interest + c.interest)
    b.repayment = round2(b.repayment + c.repayment)
    banks.set(l.bankName, b)
  }
  const byBank = [...banks.values()].sort((a, b) => b.principal - a.principal)
  return { principal, interest, repayment, byBank }
}
