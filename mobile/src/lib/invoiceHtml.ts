import { BILLED_FROM } from './invoice'

// Builds the invoice as an HTML string. Used two ways on mobile: rendered in a
// WebView for the preview, and passed to expo-print to produce the PDF. Using
// HTML gives us the ₱ symbol, real per-status row colors, and a genuine CSS
// blurred watermark. `invoice` is the camelCase snapshot:
// { invoiceNumber, invoiceDate, dueDate, billedToName, lineItems, subtotal,
//   amountPaid, totalDue }.

const php = (n: any) =>
  '₱ ' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const prettyDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Full-row fill for these; Past Due colors the font only; Upcoming/Scheduled none.
const ROW_STYLE: Record<string, string> = {
  Paid: 'background:#2ecc71;color:#0f172a;',
  Refunded: 'background:#4D7499;color:#ffffff;',
  Cancelled: 'background:#6C7293;color:#ffffff;',
  'Past Due': 'color:#e74c3c;',
}

const esc = (s: any) =>
  String(s ?? '').replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

export function buildInvoiceHtml(invoice: any): string {
  const rows = (invoice.lineItems || [])
    .map((r: any) => {
      const style = ROW_STYLE[r.status] || ''
      return `<tr style="${style}">
        <td>${esc(r.description)}</td>
        <td class="c">${esc(r.txnDate || '—')}</td>
        <td class="c">${esc(r.dueDate || '—')}</td>
        <td class="c">${esc(r.datePaid || '--')}</td>
        <td class="r mono">${php(r.amount)}</td>
        <td class="c">${esc(String(r.status || '').toUpperCase())}</td>
      </tr>`
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; padding:36px 34px; position:relative; }
  .mono { font-variant-numeric: tabular-nums; }
  .r { text-align:right; } .c { text-align:center; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; }
  .brand { font-size:22px; font-weight:800; color:#1e3a8a; letter-spacing:.5px; }
  .tagline { font-size:9px; color:#64748b; letter-spacing:1px; }
  .invoice-title { font-size:34px; font-weight:800; color:#1e3a8a; text-align:right; }
  .meta { text-align:right; margin-top:6px; font-size:12px; }
  .meta div { margin-top:2px; }
  .meta .k { color:#64748b; } .meta .v { font-weight:700; }
  .rule { border-top:1px solid #e2e8f0; margin:14px 0; }
  .parties { display:flex; gap:24px; }
  .parties .col { flex:1; }
  .label { font-size:9px; font-weight:700; color:#64748b; letter-spacing:1px; }
  .from { font-size:11px; line-height:1.5; margin-top:6px; }
  .to { font-size:14px; font-weight:700; margin-top:8px; }
  table { width:100%; border-collapse:collapse; margin-top:18px; font-size:11px; }
  thead th { background:#1e3a8a; color:#fff; font-size:9px; letter-spacing:.4px; text-align:left; padding:7px 8px; }
  thead th:nth-child(n+2) { text-align:center; } thead th:nth-child(5){ text-align:right; }
  tbody td { padding:7px 8px; border-bottom:1px solid #eef2f7; }
  .totals { margin-top:16px; margin-left:auto; width:280px; font-size:12px; }
  .totals .row { display:flex; justify-content:space-between; padding:3px 0; }
  .totals .row .k { color:#64748b; }
  .totals .grand { border-top:2px solid #1e3a8a; margin-top:6px; padding-top:8px; font-size:15px; font-weight:800; color:#1e3a8a; }
  .footer { position:fixed; bottom:24px; left:0; right:0; text-align:center; font-size:9px; font-style:italic; color:#64748b; }
  .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-45deg);
    font-size:46px; font-weight:800; color:#1e3a8a; opacity:.10; filter:blur(2.2px);
    white-space:nowrap; z-index:0; pointer-events:none; }
  .content { position:relative; z-index:1; }
</style></head>
<body>
  <div class="watermark">LOANLEDGER PH INVOICE</div>
  <div class="content">
    <div class="head">
      <div>
        <div class="brand">${esc(BILLED_FROM.name).toUpperCase()}</div>
        <div class="tagline">${esc(BILLED_FROM.tagline)}</div>
      </div>
      <div>
        <div class="invoice-title">INVOICE</div>
        <div class="meta">
          <div><span class="k">Invoice No:</span> <span class="v">${esc(invoice.invoiceNumber || '—')}</span></div>
          <div><span class="k">Invoice Date:</span> <span class="v">${prettyDate(invoice.invoiceDate)}</span></div>
          <div><span class="k">Due Date:</span> <span class="v">${prettyDate(invoice.dueDate)}</span></div>
        </div>
      </div>
    </div>
    <div class="rule"></div>
    <div class="parties">
      <div class="col">
        <div class="label">BILLED FROM</div>
        <div class="from">${esc(BILLED_FROM.name)}<br/>${BILLED_FROM.address.map(esc).join('<br/>')}<br/>Email: ${esc(BILLED_FROM.email)}<br/>Contact: ${esc(BILLED_FROM.contact)}<br/>TIN: ${esc(BILLED_FROM.tin)}</div>
      </div>
      <div class="col">
        <div class="label">BILLED TO</div>
        <div class="to">${esc(invoice.billedToName || '—')}</div>
      </div>
    </div>
    <table>
      <thead><tr>
        <th>ITEM DESCRIPTION</th><th>TXN DATE</th><th>PAYMENT DUE DATE</th><th>PAYMENT DATE</th><th>TOTAL AMORTIZATION</th><th>STATUS</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span class="k">Subtotal</span><span class="mono">${php(invoice.subtotal)}</span></div>
      <div class="row"><span class="k">Amount Paid to Date</span><span class="mono">${php(invoice.amountPaid)}</span></div>
      <div class="row grand"><span>Total Amount Due</span><span class="mono">${php(invoice.totalDue)}</span></div>
    </div>
  </div>
  <div class="footer">Thank you for trusting ${esc(BILLED_FROM.name)}. For questions regarding this invoice, contact ${esc(BILLED_FROM.email)}</div>
</body></html>`
}
