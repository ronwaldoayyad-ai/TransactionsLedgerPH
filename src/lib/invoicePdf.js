// Renders an invoice snapshot to a PDF with jsPDF + autotable. The same doc is
// used for the admin preview (shown in an iframe) and the download, so what the
// admin approves is exactly what the borrower gets. `invoice` is the camelCase
// snapshot: { invoiceNumber, invoiceDate, dueDate, billedToName, lineItems,
// subtotal, amountPaid, processingFee, totalDue }.
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BILLED_FROM } from './invoice'

const NAVY = [30, 58, 138] // #1e3a8a
const SLATE = [100, 116, 139]
const DARK = [15, 23, 42]

// Whole-row fill by status.
const STATUS_FILL = {
  Paid: [46, 204, 113], // #2ecc71
  Refunded: [77, 116, 153], // #4D7499
  Cancelled: [108, 114, 147], // #6C7293
}
// Font-only status (row stays white; the text takes the color).
const STATUS_FONT = {
  'Past Due': [231, 76, 60], // #e74c3c
}
// Upcoming / Scheduled: no color coding.
// Auto-contrast text for a fill: dark on light fills, white on dark ones.
const textOn = ([r, g, b]) =>
  (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? [15, 23, 42] : [255, 255, 255]

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

// Large diagonal anti-forgery watermark. jsPDF can't Gaussian-blur vector text,
// so we stack many slightly-offset, very-low-opacity copies — the overlap
// softens the edges into a blurred security mark that spans the page.
function drawWatermark(doc) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const text = 'LOANLEDGER PH INVOICE'
  const diag = Math.sqrt(W * W + H * H)

  doc.setFont('helvetica', 'bold').setTextColor(30, 58, 138)
  let fs = 60
  doc.setFontSize(fs)
  fs *= (diag * 0.86) / (doc.getTextWidth(text) || 1) // fit ~86% of the diagonal
  doc.setFontSize(fs)

  // Concentric rings of offsets → soft, blurred edges.
  const offsets = [[0, 0]]
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i
    offsets.push([Math.cos(a) * 1.8, Math.sin(a) * 1.8])
    offsets.push([Math.cos(a) * 3.6, Math.sin(a) * 3.6])
  }
  const hasGState = typeof doc.setGState === 'function' && typeof doc.GState === 'function'
  if (hasGState) doc.setGState(new doc.GState({ opacity: 0.012 }))
  offsets.forEach(([dx, dy]) =>
    doc.text(text, W / 2 + dx, H / 2 + dy, { align: 'center', baseline: 'middle', angle: 45 }),
  )
  if (hasGState) doc.setGState(new doc.GState({ opacity: 1 }))
}

export function buildInvoiceDoc(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40 // margin
  let y = 48

  // --- Header: issuer (left) + INVOICE with stacked meta (right) ---
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY)
  doc.text(BILLED_FROM.name.toUpperCase(), M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...SLATE)
  doc.text(BILLED_FROM.tagline, M, y + 12)

  doc.setFont('helvetica', 'bold').setFontSize(26).setTextColor(...NAVY)
  doc.text('INVOICE', W - M, y + 6, { align: 'right' })

  // Right-aligned, stacked meta under the title: label (slate) + bold value.
  const meta = [
    ['Invoice No:', invoice.invoiceNumber || '—'],
    ['Invoice Date:', prettyDate(invoice.invoiceDate)],
    ['Due Date:', prettyDate(invoice.dueDate)],
  ]
  let my = y + 32
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...DARK)
    const vw = doc.getTextWidth(v)
    doc.text(v, W - M, my, { align: 'right' })
    doc.setFont('helvetica', 'normal').setTextColor(...SLATE)
    doc.text(k, W - M - vw - 6, my, { align: 'right' })
    my += 15
  })

  // Divider below the whole header block.
  y = my + 4
  doc.setDrawColor(226, 232, 240).setLineWidth(0.5).line(M, y, W - M, y)

  // --- Billed From / Billed To ---
  y += 22
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...SLATE)
  doc.text('BILLED FROM', M, y)
  doc.text('BILLED TO', W / 2 + 10, y)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...DARK)
  const fromLines = [
    BILLED_FROM.name,
    ...BILLED_FROM.address,
    `Email: ${BILLED_FROM.email}`,
    `Contact: ${BILLED_FROM.contact}`,
    `TIN: ${BILLED_FROM.tin}`,
  ]
  fromLines.forEach((l, i) => doc.text(l, M, y + 14 + i * 12))
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text(invoice.billedToName || '—', W / 2 + 10, y + 16)

  // --- Line items table ---
  const tableTop = y + 14 + fromLines.length * 12 + 12
  autoTable(doc, {
    startY: tableTop,
    margin: { left: M, right: M },
    head: [['ITEM DESCRIPTION', 'TXN DATE', 'PAYMENT DUE DATE', 'PAYMENT DATE', 'TOTAL AMORTIZATION', 'STATUS']],
    body: (invoice.lineItems || []).map((r) => [
      r.description,
      r.txnDate || '—',
      r.dueDate || '—',
      r.datePaid || '--',
      php(r.amount),
      String(r.status || '').toUpperCase(),
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: DARK, lineColor: [255, 255, 255], lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'center' },
    },
    // Status coloring: full-row fill for Paid/Refunded/Cancelled, font-only for
    // Past Due, nothing for Upcoming/Scheduled.
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const status = (invoice.lineItems || [])[data.row.index]?.status
      const fill = STATUS_FILL[status]
      if (fill) {
        data.cell.styles.fillColor = fill
        data.cell.styles.textColor = textOn(fill)
      } else if (STATUS_FONT[status]) {
        data.cell.styles.textColor = STATUS_FONT[status]
      }
    },
  })

  // --- Totals block (right aligned) ---
  let ty = (doc.lastAutoTable?.finalY ?? tableTop) + 18
  const rows = [
    ['Subtotal', php(invoice.subtotal)],
    ['Amount Paid to Date', php(invoice.amountPaid)],
  ]
  doc.setFontSize(9)
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal').setTextColor(...SLATE).text(k, W - M - 170, ty, { align: 'left' })
    doc.setTextColor(...DARK).text(v, W - M, ty, { align: 'right' })
    ty += 16
  })
  doc.setDrawColor(...NAVY).setLineWidth(1).line(W - M - 210, ty - 6, W - M, ty - 6)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...NAVY)
  doc.text('Total Amount Due', W - M - 210, ty + 8, { align: 'left' })
  doc.text(php(invoice.totalDue), W - M, ty + 8, { align: 'right' })

  // --- Footer ---
  const fy = doc.internal.pageSize.getHeight() - 40
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...SLATE)
  doc.text(
    `Thank you for trusting ${BILLED_FROM.name}. For questions regarding this invoice, contact ${BILLED_FROM.email}`,
    W / 2,
    fy,
    { align: 'center', maxWidth: W - 2 * M },
  )

  // Anti-forgery watermark drawn last, over the content.
  drawWatermark(doc)
  return doc
}

export const invoicePdfBlobUrl = (invoice) => buildInvoiceDoc(invoice).output('bloburl')
export const downloadInvoicePdf = (invoice) =>
  buildInvoiceDoc(invoice).save(`${invoice.invoiceNumber || 'invoice'}.pdf`)
