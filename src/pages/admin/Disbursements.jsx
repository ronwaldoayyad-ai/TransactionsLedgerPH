import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useDisbursements } from '../../context/DisbursementsContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { useNotifications } from '../../context/NotificationsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Modal, inputClass } from '../../components/ui'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import {
  buildDeductionItems,
  computeDisbursement,
  disbursementStatusMeta,
  DISBURSEMENT_MODES,
  percentageOfTotal,
} from '../../lib/disbursement'
import {
  disbursementPdfAttachment,
  disbursementPdfBlobUrl,
  downloadDisbursementPdf,
} from '../../lib/disbursementPdf'

// Request statuses at/after which a disbursement may be generated.
const APPROVED_STATUSES = ['bank_approved', 'transfer', 'completed']

// Snapshot (DB camelCase) → the shape disbursementPdf expects, injecting the
// borrower's display name so the document reads correctly.
const toPdf = (d, borrowerName) => ({ ...d, billedToName: borrowerName, acknowledgedByName: borrowerName })

export default function Disbursements() {
  const { users, transactions, loans } = useApp()
  const {
    disbursements,
    createDisbursement,
    assignDisbursement,
    deleteDisbursement,
  } = useDisbursements()
  const { requests } = useLoanRequests()
  const { createNotification } = useNotifications()
  const today = toISODate(new Date())

  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id
  const loanLabelById = useMemo(
    () => Object.fromEntries((loans || []).map((l) => [l.id, l.label])),
    [loans],
  )

  // --- Generate form state ---
  const [userId, setUserId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [agreementDate, setAgreementDate] = useState('')
  const [valueDate, setValueDate] = useState(today)
  const [disbursementDate, setDisbursementDate] = useState(today)
  const [loanAccountNumber, setLoanAccountNumber] = useState('')
  const [mode, setMode] = useState('bank_transfer')
  const [dedSel, setDedSel] = useState(() => new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)

  const approvedRequests = useMemo(
    () => requests.filter((r) => r.userId === userId && APPROVED_STATUSES.includes(r.status)),
    [requests, userId],
  )
  const selectedRequest = useMemo(
    () => approvedRequests.find((r) => r.id === requestId) ?? null,
    [approvedRequests, requestId],
  )

  const deductionAll = useMemo(
    () => (userId ? buildDeductionItems(transactions, userId, today, loanLabelById) : []),
    [transactions, userId, today, loanLabelById],
  )
  const selectedItems = useMemo(
    () => deductionAll.filter((it) => dedSel.has(it.id)),
    [deductionAll, dedSel],
  )

  const fees = selectedRequest
    ? { processingFee: selectedRequest.processingFee, notarialFee: selectedRequest.notarialFee, dst: selectedRequest.dst }
    : { processingFee: 0, notarialFee: 0, dst: 0 }
  const sanctioned = selectedRequest ? selectedRequest.amount : Number(grossAmount) || 0
  const gross = Number(grossAmount) || 0
  // Fees (processing/notarial/DST) are NOT deducted from the disbursement — the
  // borrower pays them on the first amortization — so net = gross − deductions.
  const { totalDeductions, netProceeds, warning } = useMemo(
    () => computeDisbursement({ grossAmount: gross, deductionItems: selectedItems }),
    [gross, selectedItems],
  )

  const pickBorrower = (id) => {
    setUserId(id)
    setRequestId('')
    setGrossAmount('')
    setLoanAccountNumber('')
    setDedSel(new Set())
    setError('')
  }
  const pickRequest = (id) => {
    setRequestId(id)
    const r = approvedRequests.find((x) => x.id === id)
    if (r) {
      setGrossAmount(String(r.amount))
      setLoanAccountNumber(r.reference || '')
      setError('')
    }
  }
  const toggleDed = (id) =>
    setDedSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const resetForm = () => {
    setUserId('')
    setRequestId('')
    setGrossAmount('')
    setAgreementDate('')
    setValueDate(today)
    setDisbursementDate(today)
    setLoanAccountNumber('')
    setMode('bank_transfer')
    setDedSel(new Set())
    setError('')
  }

  const generate = async () => {
    if (!userId) return setError('Select a borrower.')
    if (!selectedRequest) return setError('Select an approved loan request.')
    if (!gross) return setError('Enter a gross disbursement amount.')
    setError('')
    setBusy(true)
    const { disbursement, error: err } = await createDisbursement({
      userId,
      requestId: selectedRequest.id,
      reference: selectedRequest.reference || '',
      agreementDate: agreementDate || null,
      loanAccountNumber,
      bankName: selectedRequest.bankName,
      bankAccountNumber: selectedRequest.bankAccountNumber,
      bankAccountName: selectedRequest.bankAccountName,
      totalSanctionedAmount: sanctioned,
      grossAmount: gross,
      percentageOfTotal: percentageOfTotal(gross, sanctioned),
      valueDate: valueDate || null,
      disbursementDate: disbursementDate || null,
      processingFee: fees.processingFee,
      notarialFee: fees.notarialFee,
      dst: fees.dst,
      totalDeductions,
      netProceeds,
      disbursementMode: mode,
      deductionItems: selectedItems,
    })
    setBusy(false)
    if (err) return setError(err)
    if (disbursement) {
      setPreview(disbursement)
      resetForm()
    }
  }

  const doAssign = async (d) => {
    setBusy(true)
    await assignDisbursement(d.id)
    // Notify the borrower with the generated PDF attached. Client-side (not a DB
    // trigger) because the PDF is rendered here; a failure here must not undo the
    // successful assignment.
    try {
      await createNotification({
        category: 'general',
        title: '💸 Loan Disbursement Ready',
        body: `Your loan disbursement ${d.disbursementNumber} (net ${formatPeso(d.netProceeds)}) is ready for your review and acceptance.`,
        audience: 'targeted',
        targetUserIds: [d.userId],
        attachments: [disbursementPdfAttachment(toPdf(d, nameOf(d.userId)))],
      })
    } catch (e) {
      console.error('[disbursements] ready notification failed:', e?.message ?? e)
    }
    setBusy(false)
    setPreview((p) => (p && p.id === d.id ? { ...p, status: 'assigned' } : p))
  }

  return (
    <>
      <PageHeader
        title="Loan Disbursements"
        subtitle="Generate a disbursement document from an approved loan request, with authorized deductions."
        action={<RefreshButton />}
      />

      {/* --- Generate --- */}
      <Card>
        <CardHeader title="Generate Disbursement" subtitle="Pick a borrower and their approved request, then authorize deductions." />
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Borrower" htmlFor="d-borrower">
              <select id="d-borrower" className={inputClass} value={userId} onChange={(e) => pickBorrower(e.target.value)}>
                <option value="">— Select a borrower —</option>
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Approved Loan Request" htmlFor="d-request">
              <select
                id="d-request"
                className={inputClass}
                value={requestId}
                onChange={(e) => pickRequest(e.target.value)}
                disabled={!userId}
              >
                <option value="">{userId ? '— Select an approved request —' : 'Select a borrower first'}</option>
                {approvedRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.reference} · {formatPeso(r.amount)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {selectedRequest && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Gross Amount (this tranche)" htmlFor="d-gross">
                  <input id="d-gross" type="number" min="0" step="0.01" className={inputClass} value={grossAmount} onChange={(e) => setGrossAmount(e.target.value)} />
                </Field>
                <Field label="Loan Account Number" htmlFor="d-loanacct">
                  <input id="d-loanacct" className={inputClass} value={loanAccountNumber} onChange={(e) => setLoanAccountNumber(e.target.value)} />
                </Field>
                <Field label="Mode of Disbursement" htmlFor="d-mode">
                  <select id="d-mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
                    {DISBURSEMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Agreement Date" htmlFor="d-agree">
                  <input id="d-agree" type="date" className={inputClass} value={agreementDate} onChange={(e) => setAgreementDate(e.target.value)} />
                </Field>
                <Field label="Value Date" htmlFor="d-value">
                  <input id="d-value" type="date" className={inputClass} value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
                </Field>
                <Field label="Disbursement Date" htmlFor="d-date">
                  <input id="d-date" type="date" className={inputClass} value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
                </Field>
              </div>

              {/* Deductions picker */}
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-800">
                  Authorized Deductions
                  <span className="ml-2 font-normal text-slate-500">
                    {selectedItems.length} selected · {formatPeso(totalDeductions)}
                  </span>
                </p>
                {deductionAll.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                    This borrower has no unpaid installments to deduct.
                  </p>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {deductionAll.map((it) => (
                      <label key={it.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-navy-50/40">
                        <input
                          type="checkbox"
                          checked={dedSel.has(it.id)}
                          onChange={() => toggleDed(it.id)}
                          className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                        />
                        <span className="min-w-0 flex-1 truncate text-slate-700">
                          {it.description}
                          {it.sourceLoanLabel ? <span className="text-slate-400"> · {it.sourceLoanLabel}</span> : null}
                        </span>
                        <span className="shrink-0 text-slate-500">{formatDate(it.dueDate)}</span>
                        <span className="shrink-0 w-28 text-right font-mono text-slate-900">{formatPeso(it.amount)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Live summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <Row label="Gross amount" value={formatPeso(gross)} />
                <Row label="Total deductions" value={`− ${formatPeso(totalDeductions)}`} />
                <div className="mt-1 flex items-center justify-between border-t border-slate-300 pt-2">
                  <span className="font-semibold text-navy-900">Net proceeds</span>
                  <span className={`font-mono text-base font-bold ${warning ? 'text-red-600' : 'text-navy-900'}`}>
                    {formatPeso(netProceeds)}
                  </span>
                </div>
                {warning && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    Deductions and fees exceed the gross amount — net proceeds are negative.
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={generate} disabled={busy || !selectedRequest}>
              {busy ? 'Generating…' : 'Generate Disbursement'}
            </Button>
          </div>
        </div>
      </Card>

      {/* --- Generated list --- */}
      <Card className="mt-6">
        <CardHeader
          title="Generated Disbursements"
          subtitle={`${disbursements.length} document${disbursements.length === 1 ? '' : 's'}`}
        />
        {disbursements.length === 0 ? (
          <EmptyState icon="file" title="No disbursements yet" body="Generate one above from an approved loan request." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Borrower</th>
                  <th className="px-4 py-3 text-right">Net Proceeds</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Accepted</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {disbursements.map((d) => {
                  const meta = disbursementStatusMeta(d.status)
                  return (
                    <tr key={d.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{d.disbursementNumber}</td>
                      <td className="px-4 py-2.5 text-slate-700">{nameOf(d.userId)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatPeso(d.netProceeds)}</td>
                      <td className="px-4 py-2.5"><Badge status={meta.badge}>{meta.label}</Badge></td>
                      <td className="px-4 py-2.5 text-xs">
                        {d.acknowledgedAt ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <Icon name="check" className="h-3.5 w-3.5" />
                            {formatDate(d.acknowledgedAt.slice(0, 10))}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <IconBtn title="View / Download" icon="file" onClick={() => setPreview(d)} />
                          {d.status === 'draft' && (
                            <button
                              onClick={() => doAssign(d)}
                              disabled={busy}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gold-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-gold-600 disabled:opacity-60"
                            >
                              <Icon name="check" className="h-3.5 w-3.5" />
                              Assign
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDel(d)}
                            aria-label="Delete disbursement"
                            title="Delete"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* --- Preview modal --- */}
      {preview && (
        <Modal open title={preview.disbursementNumber} onClose={() => setPreview(null)}>
          <div className="space-y-4">
            <iframe
              title="Disbursement preview"
              src={disbursementPdfBlobUrl(toPdf(preview, nameOf(preview.userId)))}
              className="h-[60vh] w-full rounded-lg border border-slate-200"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => downloadDisbursementPdf(toPdf(preview, nameOf(preview.userId)))}>
                Download PDF
              </Button>
              {preview.status === 'draft' && (
                <Button onClick={() => doAssign(preview)} disabled={busy}>
                  {busy ? 'Assigning…' : 'Assign to Borrower'}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* --- Delete confirm --- */}
      {confirmDel && (
        <Modal
          open
          title={`Delete ${confirmDel.disbursementNumber}`}
          onClose={() => (busy ? null : setConfirmDel(null))}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDel(null)} disabled={busy}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setBusy(true)
                  await deleteDisbursement(confirmDel.id)
                  setBusy(false)
                  setConfirmDel(null)
                }}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">This permanently deletes the disbursement document. This action cannot be undone.</p>
        </Modal>
      )}
    </>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono text-slate-700">{value}</span>
    </div>
  )
}

function IconBtn({ title, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  )
}
