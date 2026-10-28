import { billState } from './wallet.js'

const cents = value => Math.round((Number(value) || 0) * 100)
const emptySummary = () => ({ count: 0, billed: 0, paid: 0, remaining: 0, amount: 0 })
export const billMonthKey = date => /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(String(date)) ? date.slice(0, 7) : 'undated'
const ordinal = month => /^\d{4}-\d{2}$/.test(month) ? Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1 : Infinity

export function billMonthLabel(month) {
  if (month === 'undated') return 'No due date'
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

// Presentation only: reuse the existing bill/payment calculation and never write records.
export function buildBillTrackerModel(bills, payments, today) {
  const paymentsByBill = new Map()
  for (const payment of payments) {
    if (!paymentsByBill.has(payment.billId)) paymentsByBill.set(payment.billId, [])
    paymentsByBill.get(payment.billId).push(payment)
  }
  const summary = { pending: emptySummary(), past_due: emptySummary(), paid: emptySummary() }
  const months = { pending: new Map(), past_due: new Map(), paid: new Map() }
  const add = (total, row) => {
    total.count++
    total.billed += cents(row.bill.amountDue)
    total.paid += cents(row.paid)
    total.remaining += cents(row.remaining)
    total.amount += cents(row.status === 'paid' ? row.paid : row.remaining)
  }
  for (const bill of bills) {
    const ownPayments = paymentsByBill.get(bill.id) || []
    const row = { id: bill.id, bill, ...billState(bill, ownPayments, today) }
    row.lastPaid = ownPayments.reduce((last, payment) => !last || String(payment.paidOn).localeCompare(String(last.paidOn)) > 0 ? payment : last, null)
    const key = billMonthKey(bill.dueDate), map = months[row.status]
    if (!map.has(key)) map.set(key, { key, label: billMonthLabel(key), rows: [], summary: emptySummary() })
    const group = map.get(key)
    group.rows.push(row)
    add(group.summary, row)
    add(summary[row.status], row)
  }
  const money = total => ({ ...total, billed: total.billed / 100, paid: total.paid / 100, remaining: total.remaining / 100, amount: total.amount / 100 })
  const groups = {}
  for (const status of Object.keys(summary)) {
    summary[status] = money(summary[status])
    groups[status] = [...months[status].values()].sort((a, b) => {
      if (a.key === 'undated') return 1
      if (b.key === 'undated') return -1
      return status === 'paid' ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)
    }).map(group => ({ ...group, summary: money(group.summary), rows: group.rows.sort((a, b) => String(a.bill.dueDate).localeCompare(String(b.bill.dueDate)) || String(a.id).localeCompare(String(b.id))) }))
  }
  return { summary, groups }
}

export function defaultBillMonth(groups, today) {
  const current = ordinal(String(today).slice(0, 7))
  return groups.reduce((best, group) => {
    if (!best) return group
    const distance = Math.abs(ordinal(group.key) - current), previous = Math.abs(ordinal(best.key) - current)
    return distance < previous || (distance === previous && group.key < best.key) ? group : best
  }, null)?.key
}
