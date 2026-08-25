import { useState } from 'react'
import { useInvoices } from '../../context/InvoicesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Button, Card, CardHeader, EmptyState, Modal } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'
import { downloadInvoicePdf, invoicePdfBlobUrl } from '../../lib/invoicePdf'

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

  return (
    <>
      <PageHeader
        title="My Invoices"
        subtitle="Invoices issued to your account. Open one to preview or download the PDF."
        action={<RefreshButton />}
      />

      <Card>
        <CardHeader title="Invoices" subtitle={`${invoices.length} issued`} />
        {invoices.length === 0 ? (
          <EmptyState
            icon="file"
            title="No invoices yet"
            body="When your administrator issues an invoice, it will appear here for you to view and download."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Invoice No</th>
                  <th className="px-5 py-3">Invoice Date</th>
                  <th className="px-5 py-3">Due Date</th>
                  <th className="px-5 py-3 text-right">Total Amount Due</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-900">
                      {formatPeso(inv.totalDue)}
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
