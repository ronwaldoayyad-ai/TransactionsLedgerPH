// Pure logic for the Invoice feature. Builds invoice line items from a
// borrower's amortization ledger and computes the totals per the spec:
//   Subtotal            = sum of UNPAID amounts (upcoming + past due)
//   Amount Paid to Date = sum of PAID amounts
//   Total Amount Due    = Subtotal + Processing/Admin Fee
// Line items are the borrower's FULL schedule; the due-date multi-select only
// sets the invoice header Due Date (latest selected).
import { effectiveStatus } from './transactions'
import { toISODate } from './amortization'

// Fixed issuer ("Billed From") details, per the template.
export const BILLED_FROM = {
  name: 'LoanLedger PH',
  tagline: 'FINANCIAL SERVICES & MANAGEMENT',
  address: ['26 Road 13, Bagong Pag-asa', 'Quezon City, Metro Manila, Philippines'],
  email: 'support@ronwaldo.com',
  contact: '+639760032493',
  tin: '306-712-666',
}

// Invoice lifecycle statuses. `draft` is pre-assignment (admin-only, never shown
// to the borrower); the rest are visible to the billed borrower. `badge` maps to
// a key in the shared Badge component's palette.
export const INVOICE_STATUS_META = {
  draft: { label: 'Draft', badge: 'upcoming' },
  assigned: { label: 'Assigned', badge: 'invited' },
  upcoming: { label: 'Upcoming', badge: 'upcoming' },
  settled: { label: 'Settled', badge: 'paid' },
  past_due: { label: 'Past Due', badge: 'past_due' },
  partial: { label: 'Partially Paid', badge: 'due' },
}

// The statuses an admin may set on an already-assigned invoice, in display order.
export const EDITABLE_INVOICE_STATUSES = ['assigned', 'upcoming', 'partial', 'past_due', 'settled']

export const invoiceStatusMeta = (status) => INVOICE_STATUS_META[status] ?? INVOICE_STATUS_META.draft

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Display label for a ledger row on the invoice. Matches the template's
// vocabulary: Paid / Past Due / Upcoming / Scheduled / Refunded / Cancelled.
// `nextUnpaidDate` is the earliest upcoming due date across the schedule — rows
// on that date read "Upcoming", later unpaid rows read "Scheduled".
export function invoiceStatusLabel(txn, today, nextUnpaidDate) {
  // A negative amortization amount is a credit / overpayment — always Paid.
  if ((Number(txn.amount) || 0) < 0) return 'Paid'
  const s = effectiveStatus(txn, today)
  if (s === 'paid') return 'Paid'
  if (s === 'refunded') return 'Refunded'
  if (s === 'cancelled') return 'Cancelled'
  if (s === 'past_due') return 'Past Due'
  // unpaid (future)
  return nextUnpaidDate && txn.dueDate === nextUnpaidDate ? 'Upcoming' : 'Scheduled'
}

// The borrower's ledger rows to invoice, sorted by due date, tagged with an
// invoice status label. `dueDates` (array of ISO dates) filters the line items
// to only those installments due on the admin-selected dates; pass null/empty
// to include the borrower's full schedule.
export function buildLineItems(transactions, userId, today = toISODate(new Date()), dueDates = null) {
  const dueSet = dueDates && dueDates.length ? new Set(dueDates) : null
  const mine = transactions
    .filter((t) => t.userId === userId && !t.archivedAt && (!dueSet || dueSet.has(t.dueDate)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || String(a.id).localeCompare(String(b.id)))

  const nextUnpaidDate = mine
    .filter((t) => (Number(t.amount) || 0) >= 0 && effectiveStatus(t, today) === 'unpaid')
    .reduce((min, t) => (min == null || t.dueDate < min ? t.dueDate : min), null)

  return mine.map((t) => ({
    id: t.id,
    description: t.description,
    txnDate: t.txnDate,
    dueDate: t.dueDate,
    datePaid: t.datePaid ?? null,
    amount: t.amount,
    status: invoiceStatusLabel(t, today, nextUnpaidDate),
  }))
}

// Totals per the spec. `status` labels come from invoiceStatusLabel above.
//   Subtotal            = sum of UNPAID amounts (Upcoming + Scheduled + Past Due)
//   Amount Paid to Date = sum of PAID amounts, including the magnitude of negative
//                         amounts (a negative is a payment by the borrower)
//   Total Amount Due    = Subtotal minus PARTIAL PAYMENTS only — i.e. PAID line
//                         items whose description contains "Partial Payment".
//                         Regular paid installments do not reduce the total.
const isPartialPayment = (r) =>
  r.status === 'Paid' && /partial\s*payment/i.test(String(r.description || ''))

export function computeInvoiceTotals(lineItems) {
  const subtotal = round2(
    lineItems
      .filter((r) => r.status === 'Upcoming' || r.status === 'Scheduled' || r.status === 'Past Due')
      .reduce((s, r) => s + (Number(r.amount) || 0), 0),
  )
  const amountPaid = round2(
    lineItems.filter((r) => r.status === 'Paid').reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0),
  )
  const partialPayments = round2(
    lineItems.filter(isPartialPayment).reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0),
  )
  const totalDue = round2(subtotal - partialPayments)
  return { subtotal, amountPaid, totalDue }
}

// The distinct due dates a borrower has, for the admin's multi-select.
export function borrowerDueDates(transactions, userId) {
  return [
    ...new Set(transactions.filter((t) => t.userId === userId && !t.archivedAt).map((t) => t.dueDate)),
  ].sort()
}
