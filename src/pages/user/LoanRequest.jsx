import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import StatusBadge from '../../components/loanrequest/StatusBadge'
import HistoryTimeline from '../../components/loanrequest/HistoryTimeline'
import { Button, Card, CardHeader, CurrencyInput, EmptyState, Field, inputClass } from '../../components/ui'
import { formatPeso } from '../../lib/amortization'
import {
  PROCESSING_FEE,
  TERMS,
  buildRequestSchedule,
  canCancel,
  computeNotarial,
  computeRequestDST,
  requestSummary,
} from '../../lib/loanRequest'

// createdAt is a full ISO timestamp — format it directly (formatDate expects a
// plain YYYY-MM-DD and would yield "Invalid Date").
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

// Common PH disbursement banks (borrower picks one for the transfer).
const BANKS = [
  'BDO Unibank',
  'Bank of the Philippine Islands (BPI)',
  'Metropolitan Bank & Trust Company (Metrobank)',
  'Land Bank of the Philippines (Landbank)',
  'Philippine National Bank (PNB)',
  'Security Bank',
  'UnionBank of the Philippines',
  'Rizal Commercial Banking Corporation (RCBC)',
  'China Banking Corporation (Chinabank)',
  'EastWest Bank',
  'GCash',
  'Maya',
]

function SummaryRow({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{label}</span>
      <span className={`font-mono text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  )
}

function RequestForm() {
  const { session } = useApp()
  const { ratesByTerm, submitRequest } = useLoanRequests()

  const [amount, setAmount] = useState(null)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState(session.user.name ?? '')
  const [term, setTerm] = useState(3)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const rate = ratesByTerm[term] ?? 0
  const notarial = amount ? computeNotarial(amount) : 0
  const dst = amount ? computeRequestDST(amount) : 0
  const summary = useMemo(
    () => (amount ? requestSummary({ amount, termMonths: term, monthlyRate: rate, notarialFee: notarial, dst }) : null),
    [amount, term, rate, notarial, dst],
  )
  const schedule = useMemo(
    () =>
      amount
        ? buildRequestSchedule({ amount, termMonths: term, monthlyRate: rate, notarialFee: notarial, dst })
        : [],
    [amount, term, rate, notarial, dst],
  )

  const canSubmit =
    amount > 0 && bankName && accountNumber.trim() && accountName.trim() && consent && !saving

  const submit = async () => {
    if (!amount || amount <= 0) return setError('Please enter your desired loan amount.')
    if (!bankName) return setError('Please select your bank.')
    if (!accountNumber.trim() || !accountName.trim())
      return setError('Please provide your bank account number and name.')
    if (!consent) return setError('Please confirm the details are correct.')
    setError('')
    setSaving(true)
    const { error: err } = await submitRequest({
      amount,
      termMonths: term,
      bankName,
      bankAccountNumber: accountNumber.trim(),
      bankAccountName: accountName.trim(),
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon name="check" className="h-7 w-7" />
          </span>
          <h3 className="text-lg font-bold text-slate-900">Request submitted!</h3>
          <p className="max-w-sm text-sm text-slate-600">
            Your loan request has been received and is now waiting to be picked up for processing. Track its
            status under <span className="font-medium text-navy-800">My Loan Requests</span>.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* Inputs */}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Loan Details" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Desired Loan Amount" htmlFor="lr-amount">
              <CurrencyInput id="lr-amount" value={amount} onValueChange={setAmount} placeholder="0.00" />
            </Field>
            <Field label="Bank Name" htmlFor="lr-bank">
              <select id="lr-bank" className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)}>
                <option value="">— Select your bank —</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bank Account Number" htmlFor="lr-acct-no">
              <input
                id="lr-acct-no"
                className={inputClass}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="1234567890"
              />
            </Field>
            <Field label="Bank Account Name" htmlFor="lr-acct-name">
              <input
                id="lr-acct-name"
                className={inputClass}
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Juan Dela Cruz"
              />
            </Field>
          </div>
        </Card>

        {/* Fee info banners */}
        <div className="space-y-2">
          {[
            ['Processing Fee', `A fixed processing fee of ${formatPeso(PROCESSING_FEE)} is billed one-time on the first monthly amortization.`],
            ['DST Requirement', 'Documentary Stamp Tax (DST) is auto-calculated at ₱1.50 per ₱200 of the loan amount, applied when the amount is ₱500,000 or more.'],
            ['Notarial Fee', 'A notarial fee of 0.35% of the loan amount is charged one-time on the first monthly amortization, applied when the amount is ₱500,000 or more.'],
          ].map(([title, body]) => (
            <div key={title} className="flex gap-3 rounded-lg border-l-4 border-gold-400 bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{title}:</span> {body}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader title="Select Payment Term" />
          <div className="grid grid-cols-2 gap-2 px-5 py-4 sm:grid-cols-3 lg:grid-cols-5">
            {TERMS.map((t) => {
              const active = term === t
              const r = ratesByTerm[t] ?? 0
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTerm(t)}
                  className={`relative rounded-lg border px-3 py-3 text-center transition-colors ${
                    active ? 'border-navy-400 bg-navy-50' : 'cursor-pointer border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  {active && (
                    <span className="absolute right-1.5 top-1.5 text-navy-700">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="block text-sm font-semibold text-slate-800">{t} Months</span>
                  <span className="mt-0.5 block font-mono text-xs text-slate-500">{(r * 100).toFixed(4)}%</span>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Summary + schedule */}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Cash Loan Summary" />
          <div className="px-5 py-4">
            {!amount ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Enter a loan amount to see your summary and amortization schedule.
              </p>
            ) : (
              <>
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <SummaryRow label="Desired Loan Amount" value={formatPeso(amount)} />
                  <SummaryRow label="Monthly Add-on Rate" value={`${(rate * 100).toFixed(4)}%`} />
                  <SummaryRow label="Processing Fee" value={formatPeso(PROCESSING_FEE)} />
                  <SummaryRow label="DST Amount" value={formatPeso(dst)} />
                  <SummaryRow label="Notarial Fee" value={formatPeso(notarial)} />
                  <SummaryRow label="Payment Terms" value={`${term} Months`} />
                </div>
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <SummaryRow label="Total Monthly Installment" value={formatPeso(summary.monthlyInstallment)} strong />
                </div>
              </>
            )}
          </div>
        </Card>

        {amount ? (
          <Card>
            <CardHeader title="Amortization Schedule" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Month</th>
                    <th className="px-4 py-3 text-right">Total Payment</th>
                    <th className="px-4 py-3 text-right">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.month} className="border-b border-slate-100">
                      <td className="px-4 py-2.5 text-slate-700">{row.month}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatPeso(row.totalPayment)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">{formatPeso(row.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
          />
          I confirm that I have read and agree to the terms and conditions, and that all details are correct.
        </label>

        <Button variant="gold" onClick={submit} disabled={!canSubmit} className="w-full">
          <Icon name="send" className="h-4 w-4" />
          {saving ? 'Submitting…' : 'Submit Request'}
        </Button>
      </div>
    </div>
  )
}

function RequestDetail({ request, onBack }) {
  const { eventsFor, cancelRequest } = useLoanRequests()
  const [busy, setBusy] = useState(false)
  const events = eventsFor(request.id)

  const cancel = async () => {
    setBusy(true)
    await cancelRequest(request.id, 'Canceled by borrower.')
    setBusy(false)
    onBack()
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        <Icon name="chevron" className="h-4 w-4 rotate-180" />
        Back to List
      </button>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div>
            <p className="font-mono text-sm font-bold text-slate-900">{request.reference}</p>
            <p className="text-xs text-slate-500">Submitted {fmtDate(request.createdAt)}</p>
          </div>
          <StatusBadge status={request.status} />
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-slate-100 px-5 py-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Amount</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{formatPeso(request.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Term</p>
            <p className="text-sm font-semibold text-slate-900">{request.termMonths} Months</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Rate</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{(request.monthlyRate * 100).toFixed(4)}%</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="History Timeline" />
        <div className="px-5 py-4">
          <HistoryTimeline events={events} />
        </div>
      </Card>

      {canCancel(request.status) && (
        <Button variant="danger" onClick={cancel} disabled={busy}>
          <Icon name="x" className="h-4 w-4" />
          {busy ? 'Canceling…' : 'Cancel Request'}
        </Button>
      )}
    </div>
  )
}

function MyRequests() {
  const { myRequests } = useLoanRequests()
  const [selectedId, setSelectedId] = useState(null)
  const selected = myRequests.find((r) => r.id === selectedId)

  if (selected) return <RequestDetail request={selected} onBack={() => setSelectedId(null)} />

  if (myRequests.length === 0) {
    return <EmptyState icon="file" title="No loan requests yet" body="Your submitted requests will appear here." />
  }

  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {myRequests.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setSelectedId(r.id)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-navy-50/50"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-slate-900">{r.reference}</p>
                <p className="text-xs text-slate-500">
                  {formatPeso(r.amount)} · {r.termMonths} months · {(r.monthlyRate * 100).toFixed(4)}% · {fmtDate(r.createdAt)}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function LoanRequest() {
  const { canRequest } = useLoanRequests()
  const [tab, setTab] = useState('new') // new | mine

  return (
    <>
      <PageHeader title="Cash Loan Request" subtitle="File a new loan request and track its status." />

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {[
          ['new', 'Request a New Loan'],
          ['mine', 'My Loan Requests'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        canRequest ? (
          <RequestForm />
        ) : (
          <EmptyState
            icon="lock"
            title="Loan requests aren't enabled for your account yet"
            body="Please contact your administrator to enable cash loan requests for your account."
          />
        )
      ) : (
        <MyRequests />
      )}
    </>
  )
}
