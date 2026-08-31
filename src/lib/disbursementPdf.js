// Renders a loan-disbursement snapshot to a PDF with jsPDF + autotable. The same
// doc is used for the admin preview, the download, and the borrower's attached
// copy, so what the admin issues is exactly what the borrower receives.
//
// `d` is the camelCase snapshot plus two display-only names the page injects:
//   { disbursementNumber, reference, disbursementDate, agreementDate,
//     loanAccountNumber, billedToName, bankName, bankAccountNumber,
//     bankAccountName, totalSanctionedAmount, grossAmount, percentageOfTotal,
//     valueDate, processingFee, notarialFee, dst, totalDeductions, netProceeds,
//     disbursementMode, deductionItems, acknowledgedAt, acknowledgedByName }
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { LENDER, DISBURSEMENT_MODES } from './disbursement'

const NAVY = [30, 58, 138]
const SLATE = [100, 116, 139]
const DARK = [15, 23, 42]

// PDF core fonts lack the ₱ glyph, so amounts read "PHP 12,500.00".
const php = (n) =>
  'PHP ' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const prettyDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const prettyDateTime = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return Number.isNaN(d.getTime())
    ? ts
    : d.toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Large diagonal anti-forgery watermark. jsPDF can't Gaussian-blur vector text,
// so we stack many slightly-offset, very-low-opacity copies.
function drawWatermark(doc) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const text = 'LOANLEDGER PH DISBURSEMENT'

  doc.setFont('helvetica', 'bold').setTextColor(...NAVY)
  const margin = 34
  doc.setFontSize(60)
  const k = (doc.getTextWidth(text) || 1) / 60
  const fs = (Math.SQRT2 * (W - 2 * margin)) / (k + 0.95)
  doc.setFontSize(fs)
  const tw = doc.getTextWidth(text)

  const rad = Math.PI / 4
  const cx = W / 2 - (tw / 2) * Math.cos(rad)
  const cy = H / 2 + (tw / 2) * Math.sin(rad)

  const offsets = [[0, 0]]
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i
    offsets.push([Math.cos(a) * 1.8, Math.sin(a) * 1.8])
    offsets.push([Math.cos(a) * 3.6, Math.sin(a) * 3.6])
  }
  const hasGState = typeof doc.setGState === 'function' && typeof doc.GState === 'function'
  if (hasGState) doc.setGState(new doc.GState({ opacity: 0.012 }))
  offsets.forEach(([dx, dy]) => doc.text(text, cx + dx, cy + dy, { angle: 45 }))
  if (hasGState) doc.setGState(new doc.GState({ opacity: 1 }))
}

export function buildDisbursementDoc(d) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40
  let y = 48

  // --- Header: issuer (left) + LOAN DISBURSEMENT with stacked meta (right) ---
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY)
  doc.text(LENDER.name.toUpperCase(), M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...SLATE)
  doc.text(LENDER.tagline, M, y + 12)

  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...NAVY)
  doc.text('LOAN DISBURSEMENT', W - M, y + 6, { align: 'right' })

  const meta = [
    ['Loan Reference No:', d.reference || d.disbursementNumber || '—'],
    ['Disbursement No:', d.disbursementNumber || '—'],
    ['Disbursement Date:', prettyDate(d.disbursementDate)],
  ]
  let my = y + 30
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(...DARK)
    const vw = doc.getTextWidth(v)
    doc.text(v, W - M, my, { align: 'right' })
    doc.setFont('helvetica', 'normal').setTextColor(...SLATE)
    doc.text(k, W - M - vw - 6, my, { align: 'right' })
    my += 14
  })

  y = my + 4
  doc.setDrawColor(226, 232, 240).setLineWidth(0.5).line(M, y, W - M, y)

  // --- Lender / Borrower ---
  y += 22
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...SLATE)
  doc.text('LENDER', M, y)
  doc.text('BORROWER', W / 2 + 10, y)
  const partyColW = W / 2 - M - 12
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
  const lenderLines = [
    LENDER.name,
    LENDER.address,
    `Email: ${LENDER.email}`,
    `Contact: ${LENDER.contact}`,
    `TIN: ${LENDER.tin}`,
  ]
  // Advance a real cursor: long lines (e.g. the address) wrap to several lines,
  // so the ones after must not sit at fixed offsets or they overlap the wrap.
  let ly = y + 14
  lenderLines.forEach((l) => {
    const wrapped = doc.splitTextToSize(l, partyColW)
    doc.text(wrapped, M, ly)
    ly += wrapped.length * 12
  })

  const borrowerLines = [
    d.billedToName || '—',
    d.bankName || '—',
    d.bankAccountNumber ? `Account No: ${d.bankAccountNumber}` : '',
    d.bankAccountName ? `Account Name: ${d.bankAccountName}` : '',
  ].filter(Boolean)
  let by = y + 14
  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text(borrowerLines[0], W / 2 + 10, by)
  by += 14
  doc.setFont('helvetica', 'normal').setFontSize(9)
  borrowerLines.slice(1).forEach((l) => {
    doc.text(l, W / 2 + 10, by)
    by += 12
  })

  // Continue below whichever column ran taller.
  y = Math.max(ly, by) + 6

  // --- Preamble ---
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
  const preamble = `This Disbursement Document is issued pursuant to, and is governed by, the Loan Agreement dated ${prettyDate(
    d.agreementDate,
  )} (the "Agreement").`
  const pLines = doc.splitTextToSize(preamble, W - 2 * M)
  doc.text(pLines, M, y)
  y += pLines.length * 12 + 4
  // Measure the bold label's width BEFORE switching to the (narrower) normal
  // weight — otherwise the value lands too far left and overlaps the label.
  doc.setFont('helvetica', 'bold').text('Loan Account Number: ', M, y)
  const lanW = doc.getTextWidth('Loan Account Number: ')
  doc.setFont('helvetica', 'normal').text(d.loanAccountNumber || '—', M + lanW + 4, y)
  y += 13
  doc.setFont('helvetica', 'bold').text('Total Loan Amount: ', M, y)
  const tlaW = doc.getTextWidth('Total Loan Amount: ')
  doc.setFont('helvetica', 'normal').text(php(d.totalSanctionedAmount), M + tlaW + 4, y)

  // --- Section helpers ---
  const section = (title) => {
    doc.setFont('helvetica', 'bold').setFontSize(10.5).setTextColor(...NAVY)
    doc.text(title, M, y)
    y += 15
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
  }
  const bullet = (label, value) => {
    doc.setFont('helvetica', 'normal').setTextColor(...SLATE).text(`${label}:`, M + 6, y)
    doc.setTextColor(...DARK).text(String(value), M + 6 + doc.getTextWidth(`${label}:  `) + 4, y)
    y += 13
  }

  // --- A. Gross Disbursement Amount ---
  y += 26
  section('A. Gross Disbursement Amount')
  bullet('Gross Amount Disbursed Under This Tranche', php(d.grossAmount))
  bullet('Percentage of Total Loan', `${(Number(d.percentageOfTotal) || 0).toFixed(2)}%`)
  bullet('Value Date', prettyDate(d.valueDate))

  // --- B. Deductions from Disbursement ---
  y += 12
  section('B. Deductions from Disbursement')
  const bText = doc.splitTextToSize(
    'The following amounts are authorized to be deducted from the gross disbursement before payment of the net amount. The Borrower acknowledges and agrees to these deductions.',
    W - 2 * M,
  )
  doc.text(bText, M, y)
  y += bText.length * 12 + 6

  const items = d.deductionItems || []
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['TXN DATE', 'ITEM DESCRIPTION', 'PAYMENT DUE DATE', 'TOTAL AMORTIZATION']],
    body: items.length
      ? items.map((it) => [prettyDate(it.txnDate), it.description || '—', prettyDate(it.dueDate), php(it.amount)])
      : [['', 'No deductions authorized.', '', php(0)]],
    foot: [['', '', 'Total Deductions', php(d.totalDeductions)]],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: DARK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [241, 245, 249], textColor: DARK, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' } },
  })
  y = (doc.lastAutoTable?.finalY ?? y) + 22

  // --- C. Net Disbursement Amount + Mode ---
  const H = doc.internal.pageSize.getHeight()
  if (y + 130 > H - 52) {
    doc.addPage()
    y = 56
  }
  section('C. Net Disbursement Amount')
  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...NAVY)
  doc.text('Net Amount to be Disbursed:', M + 6, y)
  doc.text(php(d.netProceeds), W - M, y, { align: 'right' })
  y += 12
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...SLATE)
  doc.text('(Gross Amount minus Total Deductions)', M + 6, y)
  y += 20

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...DARK)
  doc.text('Mode of Disbursement:', M + 6, y)
  y += 14
  const colW = (W - 2 * M) / DISBURSEMENT_MODES.length
  DISBURSEMENT_MODES.forEach((m, i) => {
    const cx = M + 6 + colW * i
    const box = d.disbursementMode === m.value ? '[X]' : '[  ]'
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
    doc.text(`${box} ${m.label}`, cx, y)
  })
  y += 24

  // --- D. Instructions & Special Conditions ---
  if (y + 120 > H - 52) {
    doc.addPage()
    y = 56
  }
  section('D. Instructions & Special Conditions')
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
  const conditions = [
    'The Borrower authorizes the Lender to deduct the amounts listed in Section B from the gross disbursement. These deductions may include, but are not limited to, payoff of existing debts and fees as specified in the Loan Agreement or related documents.',
    'If deductions include payoff of existing loans, the Borrower confirms that the account numbers and payoff amounts are accurate and instructs the Lender to remit payment directly to the respective receiving account.',
  ]
  conditions.forEach((c, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${c}`, W - 2 * M - 6)
    doc.text(lines, M + 6, y)
    y += lines.length * 12 + 4
  })

  // --- Acknowledgment & Authorization ---
  y += 12
  if (y + 60 > H - 52) {
    doc.addPage()
    y = 56
  }
  section('Acknowledgment & Authorization')
  const ack = d.acknowledgedAt
    ? `Acknowledged electronically by ${d.acknowledgedByName || d.billedToName || 'the Borrower'} on ${prettyDateTime(
        d.acknowledgedAt,
      )}. The Borrower acknowledges the gross disbursement amount, the itemized deductions, and the net amount payable, and confirms that all pre-disbursement conditions have been met.`
    : 'Pending borrower acknowledgment. By accepting in the LoanLedger PH portal, the Borrower acknowledges the gross disbursement amount, the itemized deductions, and the net amount payable, and confirms that all pre-disbursement conditions have been met.'
  const ackLines = doc.splitTextToSize(ack, W - 2 * M)
  doc.setFont('helvetica', d.acknowledgedAt ? 'bold' : 'normal')
  doc.setTextColor(...(d.acknowledgedAt ? NAVY : SLATE))
  doc.text(ackLines, M, y)

  // --- Footer ---
  const fy = doc.internal.pageSize.getHeight() - 40
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...SLATE)
  doc.text(
    `Thank you for trusting ${LENDER.name}. For questions regarding this document, contact ${LENDER.email}`,
    W / 2,
    fy,
    { align: 'center', maxWidth: W - 2 * M },
  )

  drawWatermark(doc)
  return doc
}

export const disbursementPdfBlobUrl = (d) => buildDisbursementDoc(d).output('bloburl')
export const downloadDisbursementPdf = (d) =>
  buildDisbursementDoc(d).save(`${d.disbursementNumber || 'disbursement'}.pdf`)

// Notification-attachment shape: a clean base64 data URL + name/type/size,
// matching what fileToAttachment produces for manually-added files.
export function disbursementPdfAttachment(d) {
  const raw = buildDisbursementDoc(d).output('datauristring')
  const b64 = raw.slice(raw.indexOf(',') + 1)
  return {
    name: `${d.disbursementNumber || 'disbursement'}.pdf`,
    type: 'application/pdf',
    size: Math.round((b64.length * 3) / 4),
    dataUrl: `data:application/pdf;base64,${b64}`,
  }
}
