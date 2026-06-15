import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import BorrowerScheduleTable from '../../components/BorrowerScheduleTable'
import RefreshButton from '../../components/RefreshButton'
import Icon from '../../components/Icon'
import { Button, Card, CardHeader, inputClass } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'

// Uncontrolled disclosure field that commits to updateLoan only on blur.
// `key={value}` keeps it synced when the committed value changes externally.
function EditField({ type = 'text', value, onCommit, ...props }) {
  return (
    <input
      key={String(value ?? '')}
      type={type}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        if (String(e.target.value) !== String(value ?? '')) onCommit(e.target.value)
      }}
      className={`${inputClass} !min-h-8 !w-40 !px-2 !py-1 text-right font-mono !text-xs`}
      {...props}
    />
  )
}

export default function LoanDetail() {
  const { loanId } = useParams()
  const { session, realSession, isViewingAs, loans, transactions, updateLoan, updateTransaction } =
    useApp()
  const [emailNote, setEmailNote] = useState('')
  const loan = loans.find((l) => l.id === loanId && l.userId === session.user.id)
  // The grid is driven by the shared transactions store, so admin edits here
  // (and in Overall Transactions) stay in sync. A loan whose records were all
  // deleted by the admin is gone for the borrower.
  const loanTxns = transactions
    .filter((t) => t.loanId === loanId)
    .sort((a, b) => a.n - b.n)
  if (!loan || loanTxns.length === 0) return <Navigate to="/portal" replace />
  // Straight transactions have no loan & disclosure view.
  if (loan.txnType === 'straight') return <Navigate to="/portal/straight" replace />

  // Admin (via "view as borrower") gets read/write; the borrower is read-only.
  const canEdit = isViewingAs
  const d = loan.disclosure
  const paidCount = loanTxns.filter((t) => t.status === 'paid').length
  const fullyPaid = loanTxns.every((t) => t.status === 'paid')
  const feesRolledIn = d.deductFromProceeds === false

  // Editable disclosure inputs (value getter + commit transform per field).
  const editFields = [
    { label: 'Transaction Date', type: 'date', value: loan.txnDate, commit: (v) => updateLoan(loan.id, { txnDate: v }) },
    { label: 'Principal Amount', type: 'number', step: '0.01', value: loan.principal, commit: (v) => updateLoan(loan.id, { principal: Number(v) || 0 }) },
    { label: 'Monthly Add-on Rate', type: 'number', step: '0.0001', value: (loan.monthlyRate * 100).toFixed(4), commit: (v) => updateLoan(loan.id, { monthlyRate: (Number(v) || 0) / 100 }) },
    { label: 'Duration (months)', type: 'number', step: '1', value: loan.durationMonths, commit: (v) => updateLoan(loan.id, { durationMonths: Number(v) || 1 }) },
    { label: 'First Payment Date', type: 'date', value: loan.firstPaymentDate, commit: (v) => updateLoan(loan.id, { firstPaymentDate: v }) },
    { label: 'Documentary Stamp Tax', type: 'number', step: '0.01', value: loan.dst, commit: (v) => updateLoan(loan.id, { dst: Number(v) || 0 }) },
    { label: 'Processing Fee', type: 'number', step: '0.01', value: loan.processingFee, commit: (v) => updateLoan(loan.id, { processingFee: Number(v) || 0 }) },
    { label: 'Notarial Fee', type: 'number', step: '0.01', value: loan.notarialFee, commit: (v) => updateLoan(loan.id, { notarialFee: Number(v) || 0 }) },
  ]

  // Read-only display rows (borrower view).
  const facts = [
    ['Transaction Date', formatDate(loan.txnDate)],
    ['Principal Amount', formatPeso(loan.principal)],
    ['Monthly Add-on Rate', `${(loan.monthlyRate * 100).toFixed(4)}%`],
    ['Duration', `${loan.durationMonths} months`],
    ['First Payment Date', formatDate(loan.firstPaymentDate)],
    ['Documentary Stamp Tax', formatPeso(d.dst)],
    ['Processing Fee', formatPeso(Number(loan.processingFee))],
    ['Notarial Fee', formatPeso(Number(loan.notarialFee))],
  ]
  const deductionsLabel = feesRolledIn ? 'Fees & Deductions (with 1st payment)' : 'Total Deductions'

  const handleEmail = () => {
    const borrower = session.user
    const lines = [
      `LOAN DISCLOSURE STATEMENT — ${loan.label}`,
      `Borrower: ${borrower.name}`,
      '',
      `Transaction Date: ${formatDate(loan.txnDate)}`,
      `Principal: ${formatPeso(loan.principal)}`,
      `Monthly Add-on Rate: ${(loan.monthlyRate * 100).toFixed(4)}%`,
      `Duration: ${loan.durationMonths} months`,
      `First Payment Date: ${formatDate(loan.firstPaymentDate)}`,
      `DST: ${formatPeso(d.dst)} | Processing: ${formatPeso(Number(loan.processingFee))} | Notarial: ${formatPeso(Number(loan.notarialFee))}`,
      `${deductionsLabel}: ${formatPeso(d.totalDeductions)}`,
      `NET PROCEEDS: ${formatPeso(d.netProceeds)}`,
      '',
      'AMORTIZATION SCHEDULE',
      ...loanTxns.map((t) => `${t.n}. ${formatDate(t.dueDate)} — ${formatPeso(t.amount)}`),
      `TOTAL REPAYABLE: ${formatPeso(loanTxns.reduce((s, t) => s + t.amount, 0))}`,
    ]
    const subject = `Loan Disclosure Statement — ${loan.label}`
    const to = borrower.email ?? ''
    const cc = realSession?.user?.email ?? ''
    window.location.assign(
      `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`,
    )
    setEmailNote(`Opening your email client — addressed to ${borrower.name}, cc ${cc}.`)
    setTimeout(() => setEmailNote(''), 6000)
  }

  return (
    <>
      <Link
        to="/portal"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
      >
        ← Back to dashboard
      </Link>
      <PageHeader
        title={loan.label}
        subtitle={
          canEdit
            ? `Loan ${loan.id} · editing as ${session.user.name} — changes sync to the borrower`
            : `Loan ${loan.id} · read-only disclosure`
        }
        action={
          canEdit && (
            <div className="flex flex-wrap gap-2">
              <RefreshButton />
              <Button variant="secondary" onClick={handleEmail}>
                <Icon name="mail" className="h-4 w-4" />
                Email statement
              </Button>
            </div>
          )
        }
      />

      {canEdit && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 backdrop-blur-xl">
          <Icon name="pencil" className="h-4 w-4 shrink-0" />
          Admin edit mode — disclosure and schedule values are editable and save to the database.
        </div>
      )}

      {emailNote && (
        <p role="status" className="mb-6 flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-700">
          <Icon name="mail" className="h-4 w-4" />
          {emailNote}
        </p>
      )}

      {fullyPaid && !canEdit && (
        <div
          role="status"
          className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-emerald-100/60 px-5 py-4"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Icon name="check" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-900">Congratulations — this loan is Fully Paid!</p>
            <p className="text-xs text-emerald-700">
              All {loanTxns.length} installments have been verified as paid. No further payments are due on this loan.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Loan Disclosure Statement" subtitle="Republic Act No. 3765 (Truth in Lending Act)" />
          <dl className="divide-y divide-slate-100">
            {canEdit
              ? editFields.map((f) => (
                  <div key={f.label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <dt className="text-sm text-slate-600">{f.label}</dt>
                    <dd>
                      <EditField type={f.type} step={f.step} value={f.value} onCommit={f.commit} />
                    </dd>
                  </div>
                ))
              : facts.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-5 py-3">
                    <dt className="text-sm text-slate-600">{label}</dt>
                    <dd className="font-mono text-sm font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
            <div className="flex items-center justify-between px-5 py-3">
              <dt className="text-sm text-slate-600">{deductionsLabel}</dt>
              <dd className="font-mono text-sm font-medium text-slate-900">{formatPeso(d.totalDeductions)}</dd>
            </div>
            <div className="flex items-center justify-between bg-navy-50/70 px-5 py-3.5">
              <dt className="text-sm font-semibold text-navy-900">Net Proceeds</dt>
              <dd className="font-mono text-base font-bold text-navy-900">{formatPeso(d.netProceeds)}</dd>
            </div>
          </dl>
          {canEdit && (
            <p className="px-5 py-3 text-xs text-slate-500">
              Total Deductions and Net Proceeds recompute automatically from the fields above.
            </p>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Amortization Schedule"
            subtitle={
              canEdit
                ? 'Editable — amount, dates, description, and status save to the database'
                : fullyPaid
                  ? 'Fully paid — all installments verified'
                  : `${paidCount} of ${loanTxns.length} payments verified`
            }
          />
          <BorrowerScheduleTable
            transactions={loanTxns}
            editable={canEdit}
            onUpdate={updateTransaction}
          />
        </Card>
      </div>
    </>
  )
}
