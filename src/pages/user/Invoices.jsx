import { useMemo, useState } from 'react'
import { useInvoices } from '../../context/InvoicesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Modal, inputClass } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'
import { INVOICE_STATUS_META, invoiceStatusMeta } from '../../lib/invoice'
import { downloadInvoicePdf, invoicePdfBlobUrl } from '../../lib/invoicePdf'

const STATUS_RANK = { draft: 0, assigned: 1, upcoming: 2, partial: 3, past_due: 4, settled: 5 }

const toPdf = (inv) => ({
  invoiceNumber: inv.invoiceNumber,
  invoiceDate: inv.invoiceDate,
  dueDate: inv.dueDate,
  billedToName: inv.billedToName,
  lineItems: inv.lineItems,
  subtotal: inv.subtotal,
  amountPaid: inv.amountPaid,
  processingFee: inv.processingFee,
  totalDue: inv.totalDue,
})

// Borrower view: read-only list of invoices assigned to them, with preview and
// download. RLS guarantees they only ever receive their own ASSIGNED invoices.
export default function Invoices() {
  const { invoices } = useInvoices()
  const [preview, setPreview] = useState(null)

  // Search / filter / sort for the borrower's invoice list.
  const [query, setQuery] = useState('')
  const [statusSel, setStatusSel] = useState('all')
  const [sortKey, setSortKey] = useState('invoiceDate') // invoiceDate | dueDate | status
  const [sortDir, setSortDir] = useState('desc')
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return invoices
      .filter((inv) => {
        if (statusSel !== 'all' && inv.status !== statusSel) return false
        if (q && !String(inv.invoiceNumber).toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        let cmp
        if (sortKey === 'dueDate') cmp = String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
        else if (sortKey === 'status') cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
        else cmp = String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || ''))
        return (cmp || String(a.invoiceNumber).localeCompare(String(b.invoiceNumber))) * dir
      })
  }, [invoices, query, statusSel, sortKey, sortDir])

  return (
    <>
      <PageHeader
        title="My Invoices"
        subtitle="Invoices issued to your account. Open one to preview or download the PDF."
        action={<RefreshButton />}
      />

      <Card>
        <CardHeader
          title="Invoices"
          subtitle={invoices.length === visible.length ? `${invoices.length} issued` : `${visible.length} of ${invoices.length}`}
        />
        {invoices.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search invoice no…"
              aria-label="Search invoices"
              className={`${inputClass} sm:max-w-[16rem]`}
            />
            <select
              value={statusSel}
              onChange={(e) => setStatusSel(e.target.value)}
              aria-label="Filter by status"
              className={`${inputClass} sm:w-auto`}
            >
              <option value="all">All statuses</option>
              {Object.entries(INVOICE_STATUS_META)
                .filter(([value]) => value !== 'draft')
                .map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Sort</span>
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {[
                  ['invoiceDate', 'Invoice Date'],
                  ['dueDate', 'Due Date'],
                  ['status', 'Status'],
                ].map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleSort(k)}
                    aria-pressed={sortKey === k}
                    className={`min-h-8 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                      sortKey === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sortKey === k ? `${t} ${sortDir === 'asc' ? '↑' : '↓'}` : t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {invoices.length === 0 ? (
          <EmptyState
            icon="file"
            title="No invoices yet"
            body="When your administrator issues an invoice, it will appear here for you to view and download."
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="file" title="No matching invoices" body="Adjust the search, filter, or sort." />
        ) : (
          <>
          {/* Mobile: stacked cards so every value stays visible (no clipping). */}
          <div className="md:hidden">
            {visible.map((inv) => (
              <div key={inv.id} className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-semibold text-slate-900">{inv.invoiceNumber}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      Issued {formatDate(inv.invoiceDate)}
                      {inv.dueDate ? ` · Due ${formatDate(inv.dueDate)}` : ''}
                    </p>
                  </div>
                  <Badge status={invoiceStatusMeta(inv.status).badge}>
                    {invoiceStatusMeta(inv.status).label}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-semibold text-slate-900">{formatPeso(inv.totalDue)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setPreview(inv)}
                      title="View"
                      aria-label={`View ${inv.invoiceNumber}`}
                      className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                    >
                      <Icon name="file" className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => downloadInvoicePdf(toPdf(inv))}
                      title="Download PDF"
                      aria-label={`Download ${inv.invoiceNumber}`}
                      className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                    >
                      <Icon name="download" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Invoice No</th>
                  <th className="px-5 py-3">Invoice Date</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3 text-right">Total Amount Due</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-900">
                      {formatPeso(inv.totalDue)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge status={invoiceStatusMeta(inv.status).badge}>
                        {invoiceStatusMeta(inv.status).label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setPreview(inv)}
                          title="View"
                          aria-label={`View ${inv.invoiceNumber}`}
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="file" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadInvoicePdf(toPdf(inv))}
                          title="Download PDF"
                          aria-label={`Download ${inv.invoiceNumber}`}
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="download" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {preview && (
        <Modal
          open
          title={`Invoice ${preview.invoiceNumber}`}
          onClose={() => setPreview(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPreview(null)}>
                Close
              </Button>
              <Button variant="gold" onClick={() => downloadInvoicePdf(toPdf(preview))}>
                <Icon name="download" className="h-4 w-4" />
                Download PDF
              </Button>
            </>
          }
        >
          <iframe
            title={`Preview ${preview.invoiceNumber}`}
            src={invoicePdfBlobUrl(toPdf(preview))}
            className="h-[65vh] w-full rounded-lg border border-slate-200"
          />
        </Modal>
      )}
    </>
  )
}
