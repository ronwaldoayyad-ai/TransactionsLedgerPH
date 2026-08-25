import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useInvoices } from '../../context/InvoicesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, MultiSelect, inputClass } from '../../components/ui'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { borrowerDueDates, buildLineItems, computeInvoiceTotals } from '../../lib/invoice'
import { downloadInvoicePdf, invoicePdfBlobUrl } from '../../lib/invoicePdf'

// Snapshot (DB camelCase) → the shape invoicePdf expects. Same for a freshly
// created invoice and one loaded from the list, so previews are identical.
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

export default function Invoices() {
  const { users, transactions } = useApp()
  const { invoices, createInvoice, assignInvoice, deleteInvoice } = useInvoices()
  const today = toISODate(new Date())
  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id

  const [userId, setUserId] = useState('')
  const [dueSel, setDueSel] = useState(() => new Set())
  const [invoiceDueDate, setInvoiceDueDate] = useState(today) // header Due Date
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null) // invoice being previewed
  const [confirmDelete, setConfirmDelete] = useState(null)

  const dueOptions = useMemo(
    () => (userId ? borrowerDueDates(transactions, userId).map((d) => ({ value: d, label: formatDate(d) })) : []),
    [transactions, userId],
  )
  // Line items = only the installments on the selected due dates.
  const lineItems = useMemo(
    () => (userId ? buildLineItems(transactions, userId, today, [...dueSel]) : []),
    [transactions, userId, today, dueSel],
  )
  const totals = useMemo(() => computeInvoiceTotals(lineItems), [lineItems])

  const resetForm = () => {
    setUserId('')
    setDueSel(new Set())
    setInvoiceDueDate(today)
    setError('')
  }

  const generate = async () => {
    if (!userId) return setError('Select a borrower.')
    if (dueSel.size === 0) return setError('Select at least one due date to include.')
    if (!invoiceDueDate) return setError('Set the invoice Due Date.')
    if (lineItems.length === 0) return setError('No transactions match the selected due dates.')
    setError('')
    setBusy(true)
    const { invoice, error: err } = await createInvoice({
      userId,
      billedToName: nameOf(userId),
      dueDate: invoiceDueDate,
      selectedDueDates: [...dueSel].sort(),
      subtotal: totals.subtotal,
      amountPaid: totals.amountPaid,
      processingFee: 0,
      totalDue: totals.totalDue,
      lineItems,
    })
    setBusy(false)
    if (err) return setError(err)
    if (invoice) {
      setPreview(invoice)
      resetForm()
    }
  }

  const doAssign = async (inv) => {
    setBusy(true)
    await assignInvoice(inv.id)
    setBusy(false)
    setPreview((p) => (p && p.id === inv.id ? { ...p, status: 'assigned' } : p))
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Generate a borrower statement, preview the PDF, then assign it so the borrower can view and download it."
        action={<RefreshButton />}
      />

      {/* Generator */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card>
          <CardHeader title="Generate Invoice" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Borrower" htmlFor="inv-borrower">
              <select
                id="inv-borrower"
                className={inputClass}
                value={userId}
                onChange={(e) => {
                  setUserId(e.target.value)
                  setDueSel(new Set())
                  setError('')
                }}
              >
                <option value="">Select a borrower…</option>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Due Date(s) to include" htmlFor="inv-due" hint="Multi-select. Only installments on these due dates appear as line items.">
              <MultiSelect
                label="due dates"
                options={dueOptions}
                selected={dueSel}
                onChange={setDueSel}
                className="w-full"
              />
            </Field>

            <Field label="Invoice Due Date" htmlFor="inv-header-due" hint="Shown in the invoice header — the payment deadline you set.">
              <input
                id="inv-header-due"
                type="date"
                className={inputClass}
                value={invoiceDueDate ?? ''}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
              />
            </Field>

            {/* Live totals */}
            {userId && (
              <dl className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
                <Row k="Line items" v={`${lineItems.length}`} />
                <Row k="Subtotal (unpaid)" v={formatPeso(totals.subtotal)} />
                <Row k="Amount Paid to Date" v={formatPeso(totals.amountPaid)} />
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <dt className="font-semibold text-navy-900">Total Amount Due</dt>
                  <dd className="font-mono font-bold text-navy-900">{formatPeso(totals.totalDue)}</dd>
                </div>
              </dl>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button variant="gold" onClick={generate} disabled={busy} className="w-full">
              <Icon name="file" className="h-4 w-4" />
              {busy ? 'Generating…' : 'Generate & Preview'}
            </Button>
          </div>
        </Card>

        {/* Generated invoices list */}
        <Card>
          <CardHeader title="Generated Invoices" subtitle={`${invoices.length} total`} />
          {invoices.length === 0 ? (
            <EmptyState icon="file" title="No invoices yet" body="Generate one on the left to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Invoice No</th>
                    <th className="px-4 py-3">Borrower</th>
                    <th className="px-4 py-3">Invoice Date</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Total Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-800">{inv.billedToName || nameOf(inv.userId)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900">{formatPeso(inv.totalDue)}</td>
                      <td className="px-4 py-3">
                        {inv.status === 'assigned' ? (
                          <Badge status="paid">Assigned</Badge>
                        ) : (
                          <Badge status="upcoming">Draft</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Preview" onClick={() => setPreview(inv)} icon="file" />
                          <IconBtn title="Download PDF" onClick={() => downloadInvoicePdf(toPdf(inv))} icon="download" />
                          {inv.status === 'draft' && (
                            <IconBtn title="Assign to borrower" tone="emerald" onClick={() => doAssign(inv)} icon="check" />
                          )}
                          <IconBtn title="Delete" tone="red" onClick={() => setConfirmDelete(inv)} icon="trash" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Preview modal — the actual PDF in an iframe (== the download) */}
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
              <Button variant="secondary" onClick={() => downloadInvoicePdf(toPdf(preview))}>
                <Icon name="download" className="h-4 w-4" />
                Download
              </Button>
              {preview.status === 'draft' ? (
                <Button variant="gold" onClick={() => doAssign(preview)} disabled={busy}>
                  <Icon name="check" className="h-4 w-4" />
                  {busy ? 'Assigning…' : `Assign to ${preview.billedToName || nameOf(preview.userId)}`}
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  <Icon name="check" className="h-4 w-4" />
                  Assigned — visible to {preview.billedToName || nameOf(preview.userId)}
                </span>
              )}
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Review every figure before assigning. Once assigned, only{' '}
            <span className="font-medium text-slate-900">{preview.billedToName || nameOf(preview.userId)}</span>{' '}
            can view and download this invoice.
          </p>
          <iframe
            title={`Preview ${preview.invoiceNumber}`}
            src={invoicePdfBlobUrl(toPdf(preview))}
            className="h-[65vh] w-full rounded-lg border border-slate-200"
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal
          open
          title="Delete invoice"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await deleteInvoice(confirmDelete.id)
                  setConfirmDelete(null)
                }}
              >
                <Icon name="trash" className="h-4 w-4" />
                Delete permanently
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Permanently delete <span className="font-mono font-semibold">{confirmDelete.invoiceNumber}</span>? If it was
            assigned, the borrower will no longer see it. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-600">{k}</dt>
      <dd className="font-mono text-slate-900">{v}</dd>
    </div>
  )
}

function IconBtn({ title, onClick, icon, tone }) {
  const tones = {
    red: 'hover:bg-red-50 hover:text-red-600',
    emerald: 'hover:bg-emerald-50 hover:text-emerald-700',
    default: 'hover:bg-navy-50 hover:text-navy-800',
  }
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 ${tones[tone] ?? tones.default}`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}
