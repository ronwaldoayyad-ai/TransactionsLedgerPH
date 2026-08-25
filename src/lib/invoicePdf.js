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

export function buildInvoiceDoc(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 40 // margin
  let y = 48

  // --- Header: issuer (left) + INVOICE (right) ---
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...NAVY)
  doc.text(BILLED_FROM.name.toUpperCase(), M, y)
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...SLATE)
  doc.text(BILLED_FROM.tagline, M, y + 14)
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...DARK)
  doc.text('INVOICE', W - M, y, { align: 'right' })

  // --- Invoice meta line ---
  y += 40
  doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...DARK)
  doc.setDrawColor(226, 232, 240).line(M, y - 12, W - M, y - 12)
  const meta = [
    ['Invoice No:', invoice.invoiceNumber || '—'],
    ['Invoice Date:', prettyDate(invoice.invoiceDate)],
    ['Due Date:', prettyDate(invoice.dueDate)],
  ]
  let mx = M
  meta.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold').setTextColor(...SLATE).text(k, mx, y)
    const kw = doc.getTextWidth(k)
    doc.setFont('helvetica', 'normal').setTextColor(...DARK).text(` ${v}`, mx + kw, y)
    mx += kw + doc.getTextWidth(` ${v}`) + 24
  })

  // --- Billed From / Billed To ---
  y += 26
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
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, textColor: DARK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'center' },
    },
  })

  // --- Totals block (right aligned) ---
  let ty = (doc.lastAutoTable?.finalY ?? tableTop) + 18
  const rows = [
    ['Subtotal', php(invoice.subtotal)],
    ['Amount Paid to Date', php(invoice.amountPaid)],
    ['Processing / Admin Fee', php(invoice.processingFee)],
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
  return doc
}

export const invoicePdfBlobUrl = (invoice) => buildInvoiceDoc(invoice).output('bloburl')
export const downloadInvoicePdf = (invoice) =>
  buildInvoiceDoc(invoice).save(`${invoice.invoiceNumber || 'invoice'}.pdf`)
