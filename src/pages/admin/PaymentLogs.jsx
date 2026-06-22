import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, CurrencyInput, EmptyState, Field, Modal, inputClass } from '../../components/ui'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import {
  PAY_LOG_METHODS,
  PAY_LOG_STATUSES,
  allocate,
  defaultSubject,
  suggestedAmountOwed,
} from '../../lib/paymentLogs'

// Settled & Credited render green; Overpayment blue; Underpayment red.
const allocBadge = {
  Settled: 'paid',
  Overpayment: 'refunded',
  Underpayment: 'past_due',
  Credited: 'active',
}

// Admin Payment Logs: a dedicated ledger of payments received from borrowers.
// Independent of the amortization ledger — recording a payment never writes the
// transactions table. Over/under payments produce a separate carry entry that
// auto-nets into the next log.
export default function PaymentLogs() {
  const { users, transactions, paymentLogs, createPaymentLog, updatePaymentLog, deletePaymentLog } =
    useApp()
  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const today = toISODate(new Date())
  const nameOf = (userId) => users.find((u) => u.id === userId)?.name ?? userId

  const [filterBorrower, setFilterBorrower] = useState('all')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null) // null = creating
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // log id
  const blank = {
    userId: '',
    txnDate: today,
    reference: '',
    subject: '',
    dueDate: today,
    amountOwed: 0,
    method: PAY_LOG_METHODS[0],
    fundsApplied: 0,
    statusOverride: null, // null = use the computed allocation status
    subjectTouched: false,
    owedTouched: false,
  }
  const [form, setForm] = useState(blank)

  const { remaining, status: computedStatus } = allocate(form.amountOwed, form.fundsApplied)
  const effectiveStatus = form.statusOverride ?? computedStatus

  const openForm = () => {
    setForm(blank)
    setEditingId(null)
    setOpen(true)
  }

  const openEdit = (l) => {
    setForm({
      userId: l.userId,
      txnDate: l.txnDate,
      reference: l.reference,
      subject: l.subject,
      dueDate: l.dueDate,
      amountOwed: l.amountOwed,
      method: l.method ?? PAY_LOG_METHODS[0],
      fundsApplied: l.fundsApplied,
      statusOverride: l.allocStatus,
      subjectTouched: true,
      owedTouched: true,
    })
    setEditingId(l.id)
    setOpen(true)
  }

  // When borrower or due date changes, refresh the auto-filled fields the admin
  // hasn't manually overridden yet.
  const recompute = (next) => {
    const owed = next.owedTouched
      ? next.amountOwed
      : suggestedAmountOwed(transactions, next.userId, next.dueDate, today)
    const subject = next.subjectTouched ? next.subject : defaultSubject(next.dueDate)
    return { ...next, amountOwed: owed, subject }
  }
  const update = (patch) => setForm((f) => recompute({ ...f, ...patch }))

  const handleSave = async () => {
    if (!form.userId) return
    setSaving(true)
    if (editingId) {
      await updatePaymentLog(editingId, {
        txnDate: form.txnDate,
        reference: form.reference,
        subject: form.subject,
        dueDate: form.dueDate,
        amountOwed: form.amountOwed,
        method: form.method,
        fundsApplied: form.fundsApplied,
        remainingBalance: remaining,
        allocStatus: effectiveStatus,
      })
    } else {
      await createPaymentLog({
        userId: form.userId,
        txnDate: form.txnDate,
        reference: form.reference,
        subject: form.subject,
        dueDate: form.dueDate,
        amountOwed: form.amountOwed,
        method: form.method,
        fundsApplied: form.fundsApplied,
        status: effectiveStatus,
      })
    }
    setSaving(false)
    setOpen(false)
  }

  const rows = useMemo(() => {
    // Only acknowledgement rows — there are no "carried forward" entries.
    const list = paymentLogs.filter(
      (l) => l.kind === 'payment' && (filterBorrower === 'all' || l.userId === filterBorrower),
    )
    return [...list].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  }, [paymentLogs, filterBorrower])

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, l) => ({
          amountOwed: a.amountOwed + (Number(l.amountOwed) || 0),
          fundsApplied: a.fundsApplied + (Number(l.fundsApplied) || 0),
          remaining: a.remaining + (Number(l.remainingBalance) || 0),
        }),
        { amountOwed: 0, fundsApplied: 0, remaining: 0 },
      ),
    [rows],
  )

  return (
    <>
      <PageHeader
        title="Payment Logs"
        subtitle="Record payments received from borrowers. Over/underpayments carry forward to the next log. This ledger is separate from the amortization schedule."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <Button variant="gold" onClick={openForm}>
              <Icon name="plus" className="h-4 w-4" />
              Record Payment
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader
          title="Recorded payments"
          subtitle={`${rows.filter((r) => r.kind === 'payment').length} payment${rows.filter((r) => r.kind === 'payment').length === 1 ? '' : 's'} logged`}
          action={
            <select
              aria-label="Filter by borrower"
              className={`${inputClass} max-w-56`}
              value={filterBorrower}
              onChange={(e) => setFilterBorrower(e.target.value)}
            >
              <option value="all">All borrowers</option>
              {borrowers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            icon="scroll"
            title="No payment logs yet"
            body="Use Record Payment to acknowledge a payment received from a borrower."
          />
        ) : (
          <div className="overflow-x-auto px-1 py-2">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Txn Date</th>
                  <th className="px-3 py-2">Borrower</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Amount Owed</th>
                  <th className="px-3 py-2 text-right">Funds Applied</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const isCarry = l.kind === 'carry'
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-slate-50 ${isCarry ? 'bg-slate-50/60 text-slate-500' : ''} ${l.consumed ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.txnDate)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{nameOf(l.userId)}</td>
                      <td className="px-3 py-2">{l.reference || '—'}</td>
                      <td className="px-3 py-2">
                        {isCarry && <Icon name="list" className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />}
                        {l.subject}
                        {l.consumed && <span className="ml-1 text-xs italic">(applied)</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.method ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {isCarry ? '—' : formatPeso(l.amountOwed)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {isCarry ? '—' : formatPeso(l.fundsApplied)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(l.remainingBalance)}</td>
                      <td className="px-3 py-2">
                        <Badge status={allocBadge[l.allocStatus] ?? 'upcoming'}>{l.allocStatus}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {!isCarry && (
                          <button
                            onClick={() => openEdit(l)}
                            aria-label="Edit log"
                            className="mr-1 cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-navy-700"
                          >
                            <Icon name="pencil" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDelete(l.id)}
                          aria-label="Delete log"
                          className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-navy-50/70 text-xs font-semibold text-navy-900">
                  <td className="px-3 py-2" colSpan={5}>
                    Totals ({rows.length} payment{rows.length === 1 ? '' : 's'})
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatPeso(totals.amountOwed)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPeso(totals.fundsApplied)}</td>
                  <td className="px-3 py-2 text-right font-mono">{formatPeso(totals.remaining)}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title={editingId ? 'Edit Payment Log' : 'Record Payment'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={handleSave} disabled={!form.userId || saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save log'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Borrower" htmlFor="pl-borrower">
            <select
              id="pl-borrower"
              className={inputClass}
              value={form.userId}
              disabled={!!editingId}
              onChange={(e) => update({ userId: e.target.value })}
            >
              <option value="">Select a borrower…</option>
              {borrowers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Transaction Date" htmlFor="pl-txndate">
              <input
                id="pl-txndate"
                type="date"
                className={inputClass}
                value={form.txnDate ?? ''}
                onChange={(e) => update({ txnDate: e.target.value })}
              />
            </Field>
            <Field
              label="Due Date"
              htmlFor="pl-duedate"
              hint="Amount Owed sums unpaid + past-due up to this date."
            >
              <input
                id="pl-duedate"
                type="date"
                className={inputClass}
                value={form.dueDate ?? ''}
                onChange={(e) => update({ dueDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Transaction Reference #" htmlFor="pl-ref">
            <input
              id="pl-ref"
              type="text"
              className={inputClass}
              placeholder="e.g. GC-20260617-001"
              value={form.reference}
              onChange={(e) => update({ reference: e.target.value })}
            />
          </Field>

          <Field label="Subject" htmlFor="pl-subject">
            <input
              id="pl-subject"
              type="text"
              className={inputClass}
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value, subjectTouched: true }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount Owed" htmlFor="pl-owed" hint="Auto-filled; editable.">

              <CurrencyInput
                id="pl-owed"
                value={form.amountOwed}
                onValueChange={(v) => setForm((f) => ({ ...f, amountOwed: v ?? 0, owedTouched: true }))}
              />
            </Field>
            <Field label="Payment Method" htmlFor="pl-method">
              <select
                id="pl-method"
                className={inputClass}
                value={form.method}
                onChange={(e) => update({ method: e.target.value })}
              >
                {PAY_LOG_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Funds Applied" htmlFor="pl-funds">
              <CurrencyInput
                id="pl-funds"
                value={form.fundsApplied}
                onValueChange={(v) => update({ fundsApplied: v ?? 0 })}
              />
            </Field>
            <Field
              label="Status"
              htmlFor="pl-status"
              hint="Auto from amounts; override to Credited if applicable."
            >
              <select
                id="pl-status"
                className={inputClass}
                value={effectiveStatus}
                onChange={(e) => setForm((f) => ({ ...f, statusOverride: e.target.value }))}
              >
                {PAY_LOG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Remaining Balance</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{formatPeso(remaining)}</p>
            </div>
            <Badge status={allocBadge[effectiveStatus] ?? 'upcoming'}>{effectiveStatus}</Badge>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmDelete}
        title="Delete payment log?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deletePaymentLog(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently removes the log entry. Any carry it generated stays for the record but is
          detached. This does not affect the amortization ledger.
        </p>
      </Modal>
    </>
  )
}
