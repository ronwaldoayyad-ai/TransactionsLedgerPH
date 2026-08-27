import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useInvoices } from '../../context/InvoicesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, MultiSelect, inputClass } from '../../components/ui'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import {
  borrowerDueDates,
  buildLineItems,
  computeInvoiceTotals,
  EDITABLE_INVOICE_STATUSES,
  INVOICE_STATUS_META,
  invoiceStatusMeta,
} from '../../lib/invoice'
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
  const { invoices, createInvoice, assignInvoice, updateInvoiceStatus, deleteInvoice } = useInvoices()
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
  const [statusEdit, setStatusEdit] = useState(null) // invoice whose status is being edited
  const [statusDraft, setStatusDraft] = useState('assigned')
  const [statusErr, setStatusErr] = useState('')

  // --- List filters / search / sort (the "Generated Invoices" table).
  const [listQuery, setListQuery] = useState('')
  const [listBorrower, setListBorrower] = useState('all')
  const [listStatus, setListStatus] = useState('all')
  const [listSortKey, setListSortKey] = useState('invoiceDate') // borrower | dueDate | status | invoiceDate
  const [listSortDir, setListSortDir] = useState('desc')
  const toggleListSort = (k) => {
    if (listSortKey === k) setListSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setListSortKey(k)
      setListSortDir('asc')
    }
  }
  const STATUS_RANK = { draft: 0, assigned: 1, upcoming: 2, partial: 3, past_due: 4, settled: 5 }
  const visibleInvoices = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    const dir = listSortDir === 'asc' ? 1 : -1
    return invoices
      .filter((inv) => {
        if (listBorrower !== 'all' && inv.userId !== listBorrower) return false
        if (listStatus !== 'all' && inv.status !== listStatus) return false
        if (q) {
          const hay = `${inv.billedToName || nameOf(inv.userId)} ${inv.invoiceNumber}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        let cmp
        if (listSortKey === 'borrower')
          cmp = (a.billedToName || nameOf(a.userId)).localeCompare(b.billedToName || nameOf(b.userId))
        else if (listSortKey === 'dueDate') cmp = String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
        else if (listSortKey === 'status') cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
        else cmp = String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || ''))
        return (cmp || String(a.invoiceNumber).localeCompare(String(b.invoiceNumber))) * dir
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
  }, [invoices, listQuery, listBorrower, listStatus, listSortKey, listSortDir, users])

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

  const openStatusEdit = (inv) => {
    setStatusEdit(inv)
    setStatusDraft(inv.status === 'draft' ? 'assigned' : inv.status)
    setStatusErr('')
  }

  const saveStatus = async () => {
    if (!statusEdit) return
    setBusy(true)
    const { error: err } = await updateInvoiceStatus(statusEdit.id, statusDraft)
    setBusy(false)
    if (err) return setStatusErr(err)
    setPreview((p) => (p && p.id === statusEdit.id ? { ...p, status: statusDraft } : p))
    setStatusEdit(null)
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
          <CardHeader
            title="Generated Invoices"
            subtitle={
              invoices.length === visibleInvoices.length
                ? `${invoices.length} total`
                : `${visibleInvoices.length} of ${invoices.length}`
            }
          />
          {invoices.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
              <input
                type="search"
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Search borrower or invoice no…"
                aria-label="Search invoices"
                className={`${inputClass} sm:max-w-[16rem]`}
              />
              <select
                value={listBorrower}
                onChange={(e) => setListBorrower(e.target.value)}
                aria-label="Filter by borrower"
                className={`${inputClass} sm:w-auto`}
              >
                <option value="all">All borrowers</option>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select
                value={listStatus}
                onChange={(e) => setListStatus(e.target.value)}
                aria-label="Filter by status"
                className={`${inputClass} sm:w-auto`}
              >
                <option value="all">All statuses</option>
                {Object.entries(INVOICE_STATUS_META).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Sort</span>
                <div className="flex rounded-lg border border-slate-300 p-0.5">
                  {[
                    ['borrower', 'Borrower'],
                    ['dueDate', 'Due Date'],
                    ['status', 'Status'],
                  ].map(([k, t]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleListSort(k)}
                      aria-pressed={listSortKey === k}
                      className={`min-h-8 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                        listSortKey === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {listSortKey === k ? `${t} ${listSortDir === 'asc' ? '↑' : '↓'}` : t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {invoices.length === 0 ? (
            <EmptyState icon="file" title="No invoices yet" body="Generate one on the left to get started." />
          ) : visibleInvoices.length === 0 ? (
            <EmptyState icon="file" title="No matching invoices" body="Adjust the search, filter, or sort." />
          ) : (
            <>
            {/* Mobile: stacked cards so every value stays visible (no clipping). */}
            <div className="md:hidden">
              {visibleInvoices.map((inv) => (
                <div key={inv.id} className="border-b border-slate-100 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] font-semibold text-slate-900">{inv.invoiceNumber}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                        {inv.billedToName || nameOf(inv.userId)} · Issued {formatDate(inv.invoiceDate)}
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
                      <IconBtn title="Preview" onClick={() => setPreview(inv)} icon="file" />
                      <IconBtn title="Download PDF" onClick={() => downloadInvoicePdf(toPdf(inv))} icon="download" />
                      {inv.status === 'draft' ? (
                        <IconBtn title="Assign to borrower" tone="emerald" onClick={() => doAssign(inv)} icon="check" />
                      ) : (
                        <IconBtn title="Update status" onClick={() => openStatusEdit(inv)} icon="pencil" />
                      )}
                      <IconBtn title="Delete" tone="red" onClick={() => setConfirmDelete(inv)} icon="trash" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop / tablet: full table. */}
            <div className="hidden overflow-x-auto md:block">
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
                  {visibleInvoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-800">{inv.billedToName || nameOf(inv.userId)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900">{formatPeso(inv.totalDue)}</td>
                      <td className="px-4 py-3">
                        <Badge status={invoiceStatusMeta(inv.status).badge}>
                          {invoiceStatusMeta(inv.status).label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <IconBtn title="Preview" onClick={() => setPreview(inv)} icon="file" />
                          <IconBtn title="Download PDF" onClick={() => downloadInvoicePdf(toPdf(inv))} icon="download" />
                          {inv.status === 'draft' ? (
                            <IconBtn title="Assign to borrower" tone="emerald" onClick={() => doAssign(inv)} icon="check" />
                          ) : (
                            <IconBtn title="Update status" onClick={() => openStatusEdit(inv)} icon="pencil" />
                          )}
                          <IconBtn title="Delete" tone="red" onClick={() => setConfirmDelete(inv)} icon="trash" />
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
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    <Icon name="check" className="h-4 w-4" />
                    {invoiceStatusMeta(preview.status).label} — visible to {preview.billedToName || nameOf(preview.userId)}
                  </span>
                  <Button variant="secondary" onClick={() => openStatusEdit(preview)}>
                    <Icon name="pencil" className="h-4 w-4" />
                    Update status
                  </Button>
                </>
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

      {/* Update status */}
      {statusEdit && (
        <Modal
          open
          title={`Update status — ${statusEdit.invoiceNumber}`}
          onClose={() => setStatusEdit(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setStatusEdit(null)}>
                Cancel
              </Button>
              <Button variant="gold" onClick={saveStatus} disabled={busy || statusDraft === statusEdit.status}>
                <Icon name="check" className="h-4 w-4" />
                {busy ? 'Saving…' : 'Save status'}
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">
            Set the status for{' '}
            <span className="font-medium text-slate-900">{statusEdit.billedToName || nameOf(statusEdit.userId)}</span>. The
            borrower sees this on their <span className="font-medium">My Invoices</span> tab but cannot change it.
          </p>
          <Field label="Status" htmlFor="inv-status">
            <select
              id="inv-status"
              className={inputClass}
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
            >
              {EDITABLE_INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {invoiceStatusMeta(s).label}
                </option>
              ))}
            </select>
          </Field>
          {statusErr && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {statusErr}
            </p>
          )}
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
