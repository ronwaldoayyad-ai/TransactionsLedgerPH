// Pure calculation module for the Dynamic Loan Amortization & Disclosure
// engine. No UI dependencies — intended to be ported as-is to the backend.

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
})

export function formatPeso(value) {
  if (value == null || Number.isNaN(value)) return '—'
  return peso.format(value)
}

// Plain amount formatting for input fields: comma thousands separator,
// always 2 decimals, no currency symbol (e.g. 1,500.00).
const amount = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatAmount(value) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return ''
  return amount.format(Number(value))
}

export function parseAmount(text) {
  if (text == null || String(text).trim() === '') return null
  const n = Number(String(text).replaceAll(',', ''))
  return Number.isNaN(n) ? null : n
}

export function formatDate(date) {
  if (!date) return '—'
  const d = typeof date === 'string' ? parseISODate(date) : date
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Parse 'YYYY-MM-DD' as a local date (avoids UTC off-by-one from new Date(str)).
export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// Documentary Stamp Tax per BIR mandate: PHP 1.50 per PHP 200 (or fraction).
export function computeDST(principal) {
  if (!principal || principal <= 0) return 0
  return Math.ceil(principal / 200) * 1.5
}

// `dst` may be passed to override the auto-calculated BIR amount.
// When `deductFromProceeds` is false, fees are not taken out of the principal;
// the borrower receives the full principal and the fees are collected as part
// of the first amortization payment instead.
export function computeDeductions({
  principal,
  processingFee = 1500,
  notarialFee = 0,
  dst,
  deductFromProceeds = true,
}) {
  const dstAmount = dst != null ? round2(Number(dst) || 0) : computeDST(principal)
  const totalDeductions = round2(
    dstAmount + (Number(processingFee) || 0) + (Number(notarialFee) || 0),
  )
  const P = round2(Number(principal) || 0)
  const netProceeds = deductFromProceeds ? round2(P - totalDeductions) : P
  return { dst: dstAmount, totalDeductions, netProceeds }
}

// Add n months to an anchor date, clamping to the last day of shorter months
// (e.g. Jan 31 anchor -> Feb 28/29 -> Mar 31). Always clamps against the
// original anchor day, not the previously rolled-over date.
export function addMonthsClamped(anchor, n) {
  const y = anchor.getFullYear()
  const m = anchor.getMonth() + n
  const lastDay = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(anchor.getDate(), lastDay))
}

/**
 * Generate the amortization schedule.
 *
 * - Monthly Principal Portion: P / D (rounded to cents; the final month
 *   absorbs the fractional-cent remainder so principal sums exactly to P)
 * - Monthly Interest Amount: P * R (flat add-on rate)
 * - Total Monthly Amortization: principal portion + interest
 * - `upfrontFees` > 0 (fees not deducted from proceeds) is collected with the
 *   first payment: row 1 carries a `fees` component added to its total.
 */
export function generateSchedule({
  principal,
  monthlyRate,
  durationMonths,
  firstPaymentDate,
  upfrontFees = 0,
}) {
  const P = Number(principal)
  const R = Number(monthlyRate)
  const D = Math.floor(Number(durationMonths))
  if (!P || P <= 0 || !D || D <= 0 || R < 0 || !firstPaymentDate) return null

  const anchor =
    typeof firstPaymentDate === 'string' ? parseISODate(firstPaymentDate) : firstPaymentDate

  const basePrincipal = round2(P / D)
  const interest = round2(P * R)

  const fees = round2(Number(upfrontFees) || 0)

  const rows = []
  let principalPaid = 0
  for (let i = 0; i < D; i += 1) {
    const isLast = i === D - 1
    const principalPortion = isLast ? round2(P - principalPaid) : basePrincipal
    principalPaid = round2(principalPaid + principalPortion)
    const rowFees = i === 0 ? fees : 0
    rows.push({
      n: i + 1,
      date: toISODate(addMonthsClamped(anchor, i)),
      principal: principalPortion,
      interest,
      fees: rowFees,
      total: round2(principalPortion + interest + rowFees),
    })
  }

  const totals = {
    principal: round2(rows.reduce((s, r) => s + r.principal, 0)),
    interest: round2(rows.reduce((s, r) => s + r.interest, 0)),
    fees,
    total: round2(rows.reduce((s, r) => s + r.total, 0)),
  }

  return { rows, totals, upfrontFees: fees }
}

export function buildDisclosure(inputs) {
  const {
    principal,
    monthlyRate,
    durationMonths,
    firstPaymentDate,
    processingFee,
    notarialFee,
    dst,
    deductFromProceeds = true,
  } = inputs
  const deductions = computeDeductions({
    principal,
    processingFee,
    notarialFee,
    dst,
    deductFromProceeds,
  })
  const schedule = generateSchedule({
    principal,
    monthlyRate,
    durationMonths,
    firstPaymentDate,
    upfrontFees: deductFromProceeds ? 0 : deductions.totalDeductions,
  })
  if (!schedule) return null
  return { ...inputs, deductFromProceeds, ...deductions, schedule }
}

// `view="user"` exports only the payment dates and totals, matching what the
// borrower sees on their dashboard.
export function scheduleToCSV(schedule, view = 'admin') {
  if (view === 'user') {
    const header = 'No.,Date,Total Amortization'
    const lines = schedule.rows.map((r) => `${r.n},${r.date},${r.total.toFixed(2)}`)
    lines.push(`TOTALS,,${schedule.totals.total.toFixed(2)}`)
    return [header, ...lines].join('\n')
  }
  const header = 'No.,Date,Principal,Interest,Total Amortization'
  const lines = schedule.rows.map(
    (r) => `${r.n},${r.date},${r.principal.toFixed(2)},${r.interest.toFixed(2)},${r.total.toFixed(2)}`,
  )
  lines.push(
    `TOTALS,,${schedule.totals.principal.toFixed(2)},${schedule.totals.interest.toFixed(2)},${schedule.totals.total.toFixed(2)}`,
  )
  return [header, ...lines].join('\n')
}

export function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
