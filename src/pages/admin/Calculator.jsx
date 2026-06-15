import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { usePersistedState } from '../../hooks/usePersistedState'
import { adminUser } from '../../data/mock'
import { PageHeader } from '../../components/AppShell'
import ScheduleTable from '../../components/ScheduleTable'
import Icon from '../../components/Icon'
import {
  Button,
  Card,
  CardHeader,
  CurrencyInput,
  EmptyState,
  Field,
  inputClass,
} from '../../components/ui'
import {
  computeDST,
  computeDeductions,
  downloadCSV,
  formatPeso,
  generateSchedule,
  scheduleToCSV,
  toISODate,
} from '../../lib/amortization'

// Dynamic Loan Amortization & Disclosure Module (Admin only).
// All outputs are reactive to the inputs — no "Calculate" button needed.
export default function Calculator() {
  const { session, users, assignLoan, unassignLoan } = useApp()
  const borrowers = users.filter((u) => u.role === 'user')

  // All calculator inputs survive navigating to other sections; they change
  // only when edited here (or after Refresh, which resets to defaults).
  const [txnType, setTxnType] = usePersistedState('calc.txnType', 'installment') // installment | straight
  const [principal, setPrincipal] = usePersistedState('calc.principal', 50000)
  const [ratePct, setRatePct] = usePersistedState('calc.ratePct', '0')
  const [duration, setDuration] = usePersistedState('calc.duration', '6')
  const [txnDate, setTxnDate] = usePersistedState('calc.txnDate', () => toISODate(new Date()))
  const [firstPaymentDate, setFirstPaymentDate] = usePersistedState('calc.firstPaymentDate', () => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return toISODate(d)
  })
  const [dstOverride, setDstOverride] = usePersistedState('calc.dstOverride', null) // { forPrincipal, value }
  const [applyDST, setApplyDST] = usePersistedState('calc.applyDST', true)
  const [processingFee, setProcessingFee] = usePersistedState('calc.processingFee', 1500)
  const [addProcessingFee, setAddProcessingFee] = usePersistedState('calc.addProcessingFee', false)
  const [notarialFee, setNotarialFee] = usePersistedState('calc.notarialFee', 0)
  const [deductFromProceeds, setDeductFromProceeds] = usePersistedState('calc.deductFromProceeds', true)
  const [label, setLabel] = usePersistedState('calc.label', 'Cash Loan')
  const [assigneeId, setAssigneeId] = usePersistedState('calc.assigneeId', '')
  const [assigned, setAssigned] = useState(null) // { message, loanId } — loanId enables Undo
  const [shareNote, setShareNote] = useState('')

  const P = principal ?? 0
  const monthlyRate = (Number(ratePct) || 0) / 100
  // Straight transactions are settled in a single payment on the first
  // payment date; only installments spread over a duration.
  const effectiveDuration = txnType === 'straight' ? 1 : duration

  // Switching the transaction type applies that type's defaults. Everything
  // remains manually editable afterwards.
  const handleTypeChange = (value) => {
    setTxnType(value)
    setRatePct('0')
    if (value === 'straight') {
      setLabel('Purchased Item')
      setPrincipal(0)
      setApplyDST(false)
      setDeductFromProceeds(false)
    } else {
      setLabel('Cash Loan')
      setApplyDST(true)
      setDeductFromProceeds(true)
    }
  }

  // DST tracks the BIR formula but stays a regular editable field: a manual
  // edit holds only for the principal it was entered against, so changing the
  // principal re-syncs the auto-calculated amount.
  const dst =
    dstOverride && dstOverride.forPrincipal === P ? dstOverride.value : computeDST(P)
  const setDst = (value) => setDstOverride({ forPrincipal: P, value })

  // Checkbox-gated fees: unchecked means the fee is excluded entirely (0.00).
  const effectiveDst = applyDST ? (dst ?? 0) : 0 // cleared field counts as zero, not "recalculate"
  const effectiveProcessingFee = addProcessingFee ? (processingFee ?? 0) : 0

  const deductions = useMemo(
    () =>
      computeDeductions({
        principal: P,
        processingFee: effectiveProcessingFee,
        notarialFee,
        dst: effectiveDst,
        deductFromProceeds,
      }),
    [P, effectiveProcessingFee, notarialFee, effectiveDst, deductFromProceeds],
  )

  const schedule = useMemo(
    () =>
      generateSchedule({
        principal: P,
        monthlyRate,
        durationMonths: effectiveDuration,
        firstPaymentDate,
        upfrontFees: deductFromProceeds ? 0 : deductions.totalDeductions,
      }),
    [P, monthlyRate, effectiveDuration, firstPaymentDate, deductFromProceeds, deductions.totalDeductions],
  )

  const handleAssign = async () => {
    if (!schedule || !assigneeId) return
    const inputs = {
      userId: assigneeId,
      label,
      txnType,
      principal: P,
      monthlyRate,
      durationMonths: Number(effectiveDuration),
      txnDate,
      firstPaymentDate,
      dst: deductions.dst,
      processingFee: effectiveProcessingFee,
      notarialFee: notarialFee ?? 0,
      deductFromProceeds,
    }
    const loan = await assignLoan({
      ...inputs,
      disclosure: { ...inputs, ...deductions, schedule },
    })
    if (!loan) {
      setAssigned({ message: 'Assignment failed — please check the inputs and try again.', loanId: null })
      return
    }
    const borrower = borrowers.find((b) => b.id === assigneeId)
    // Stays visible (no timeout) so Undo remains available until dismissed.
    setAssigned({
      message: `Schedule ${loan.id} pushed live to ${borrower?.name}'s dashboard and added to Overall Transactions.`,
      loanId: loan.id,
    })
  }

  const handleUndoAssign = async () => {
    const ok = await unassignLoan(assigned.loanId)
    setAssigned({
      message: ok
        ? 'Assignment undone — the schedule and its Overall Transactions records were removed.'
        : 'Undo failed — please retry.',
      loanId: ok ? null : assigned.loanId,
    })
    if (ok) setTimeout(() => setAssigned(null), 6000)
  }

  const selectedBorrower = borrowers.find((b) => b.id === assigneeId)
  const firstName = (name) => name.split(' ')[0]
  // The borrower grid is titled with the selected assignee's first name so the
  // admin sees exactly whose view is being previewed.
  const borrowerViewName = selectedBorrower ? firstName(selectedBorrower.name) : 'General User'
  const adminViewName = firstName(session?.user?.name ?? adminUser.name)

  const buildUserScheduleText = () => {
    const lines = [
      `AMORTIZATION SCHEDULE — ${label}`,
      `Net Proceeds: ${formatPeso(deductions.netProceeds)}`,
      '',
      ...schedule.rows.map((r) => `${r.n}. ${r.date} — ${formatPeso(r.total)}`),
      `TOTAL REPAYABLE: ${formatPeso(schedule.totals.total)}`,
    ]
    return lines.join('\n')
  }

  const handleEmail = (view) => {
    const subject = `Loan Disclosure Statement — ${label}`
    const body = view === 'admin' ? buildShareText() : buildUserScheduleText()
    const to = view === 'user' && selectedBorrower ? selectedBorrower.email : ''
    window.location.assign(
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    )
  }

  const buildShareText = () => {
    const lines = [
      'LOAN DISCLOSURE STATEMENT',
      `Type: ${txnType === 'straight' ? 'Straight' : 'Installment'}`,
      `Principal: ${formatPeso(P)}`,
      `Monthly Add-on Rate: ${(Number(ratePct) || 0).toFixed(4)}%`,
      `Duration: ${effectiveDuration} month${Number(effectiveDuration) === 1 ? '' : 's'}`,
      `DST: ${formatPeso(deductions.dst)} | Processing: ${formatPeso(effectiveProcessingFee)} | Notarial: ${formatPeso(notarialFee ?? 0)}`,
      `Total Deductions: ${formatPeso(deductions.totalDeductions)}`,
      deductFromProceeds
        ? 'Fees are deducted from the loan proceeds.'
        : 'Fees are collected with the first payment (not deducted from proceeds).',
      `NET PROCEEDS: ${formatPeso(deductions.netProceeds)}`,
      '',
      'AMORTIZATION SCHEDULE',
      ...schedule.rows.map((r) => `${r.n}. ${r.date} — ${formatPeso(r.total)}`),
      `TOTAL REPAYABLE: ${formatPeso(schedule.totals.total)}`,
    ]
    return lines.join('\n')
  }

  const handleShare = async () => {
    const text = buildShareText()
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Loan Disclosure Statement', text })
        return
      } catch {
        /* user cancelled — fall through to clipboard */
      }
    }
    await navigator.clipboard.writeText(text)
    setShareNote('Statement copied to clipboard — paste into Email, WhatsApp, Telegram, or SMS.')
    setTimeout(() => setShareNote(''), 5000)
  }

  return (
    <>
      <PageHeader
        title="Loan Calculator & Disclosure"
        subtitle="Generate a Philippine-compliant disclosure statement and amortization schedule."
      />

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Inputs column */}
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Core Inputs" />
            <div className="space-y-4 px-5 py-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Transaction Type
                </span>
                <div
                  role="group"
                  aria-label="Transaction type"
                  className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
                >
                  {[
                    ['installment', 'Installment'],
                    ['straight', 'Straight'],
                  ].map(([value, typeLabel]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={txnType === value}
                      onClick={() => handleTypeChange(value)}
                      className={`min-h-9 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                        txnType === value
                          ? 'bg-navy-800 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                    >
                      {typeLabel}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {txnType === 'installment'
                    ? 'Repaid in equal monthly amortizations over the duration.'
                    : 'Settled in a single payment on the first payment date.'}
                </p>
              </div>
              <Field label="Description" htmlFor="calc-label">
                <input
                  id="calc-label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Principal Amount (P)" htmlFor="calc-principal">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                    ₱
                  </span>
                  <CurrencyInput
                    id="calc-principal"
                    value={principal}
                    onValueChange={setPrincipal}
                    className="pl-7"
                  />
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Monthly Add-on Rate (R)" htmlFor="calc-rate">
                  <div className="relative">
                    <input
                      id="calc-rate"
                      type="number"
                      min="0"
                      step="0.0001"
                      inputMode="decimal"
                      value={ratePct}
                      onChange={(e) => setRatePct(e.target.value)}
                      className={`${inputClass} pr-8 font-mono`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                      %
                    </span>
                  </div>
                </Field>
                <Field
                  label="Duration (D, months)"
                  htmlFor="calc-duration"
                  hint={txnType === 'straight' ? 'Fixed at 1 for Straight transactions.' : undefined}
                >
                  <input
                    id="calc-duration"
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    inputMode="numeric"
                    value={effectiveDuration}
                    onChange={(e) => setDuration(e.target.value)}
                    disabled={txnType === 'straight'}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Transaction Date"
                  htmlFor="calc-txn-date"
                  hint="Captured on every ledger record when pushed live."
                >
                  <input
                    id="calc-txn-date"
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="First Payment Date"
                  htmlFor="calc-first-date"
                  hint="Anchors the schedule; end-of-month dates roll over safely."
                >
                  <input
                    id="calc-first-date"
                    type="date"
                    value={firstPaymentDate}
                    onChange={(e) => setFirstPaymentDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Fees & Deductions" subtitle="Updates live with the principal" />
            <div className="space-y-4 px-5 py-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="calc-dst" className="text-sm font-medium text-slate-700">
                    Documentary Stamp Tax (DST)
                  </label>
                  <label
                    htmlFor="calc-apply-dst"
                    className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600"
                  >
                    <input
                      id="calc-apply-dst"
                      type="checkbox"
                      checked={applyDST}
                      onChange={(e) => setApplyDST(e.target.checked)}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#1e3a8a]"
                    />
                    Apply DST
                  </label>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                    ₱
                  </span>
                  <CurrencyInput
                    id="calc-dst"
                    value={effectiveDst}
                    onValueChange={setDst}
                    disabled={!applyDST}
                    className="pl-7"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {applyDST
                    ? 'Auto-calculated per BIR mandate (₱1.50 per ₱200 of principal, or fraction). Editable — re-syncs when the principal changes.'
                    : 'DST excluded — amount is ₱0.00.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="calc-processing" className="text-sm font-medium text-slate-700">
                      Processing Fee
                    </label>
                    <label
                      htmlFor="calc-add-processing"
                      className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600"
                    >
                      <input
                        id="calc-add-processing"
                        type="checkbox"
                        checked={addProcessingFee}
                        onChange={(e) => {
                          setAddProcessingFee(e.target.checked)
                          if (e.target.checked) setProcessingFee(1500)
                        }}
                        className="h-3.5 w-3.5 cursor-pointer accent-[#1e3a8a]"
                      />
                      Add
                    </label>
                  </div>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                      ₱
                    </span>
                    <CurrencyInput
                      id="calc-processing"
                      value={effectiveProcessingFee}
                      onValueChange={setProcessingFee}
                      disabled={!addProcessingFee}
                      className="pl-7"
                    />
                  </div>
                </div>
                <Field label="Notarial Fee" htmlFor="calc-notarial">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                      ₱
                    </span>
                    <CurrencyInput
                      id="calc-notarial"
                      value={notarialFee}
                      onValueChange={setNotarialFee}
                      className="pl-7"
                    />
                  </div>
                </Field>
              </div>

              <label
                htmlFor="calc-deduct"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors duration-200 hover:border-navy-300"
              >
                <input
                  id="calc-deduct"
                  type="checkbox"
                  checked={deductFromProceeds}
                  onChange={(e) => setDeductFromProceeds(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">
                    Deduct from the Loan Proceeds
                  </span>
                  <span className="block text-xs text-slate-500">
                    Checked: fees are taken out of the principal before release. Unchecked: the
                    borrower receives the full principal and the fees are collected with the first
                    amortization payment.
                  </span>
                </span>
              </label>

              <dl className="space-y-2 rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-600">Total Deductions</dt>
                  <dd className="font-mono font-medium text-slate-900">
                    {formatPeso(deductions.totalDeductions)}
                  </dd>
                </div>
                {!deductFromProceeds && (
                  <div className="flex justify-between text-sm">
                    <dt className="text-slate-600">Added to first payment</dt>
                    <dd className="font-mono font-medium text-amber-700">
                      {formatPeso(deductions.totalDeductions)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2">
                  <dt className="text-sm font-semibold text-navy-900">Net Proceeds to Borrower</dt>
                  <dd className="font-mono text-lg font-bold text-emerald-700">
                    {formatPeso(deductions.netProceeds)}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Distribution" subtitle="Assign in-app or share externally" />
            <div className="space-y-4 px-5 py-4">
              <Field label="Assign to borrower" htmlFor="calc-assignee">
                <select
                  id="calc-assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select a borrower…</option>
                  {borrowers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.email})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleAssign} disabled={!schedule || !assigneeId} className="flex-1">
                  <Icon name="send" className="h-4 w-4" />
                  Assign & push live
                </Button>
                <Button variant="secondary" onClick={handleShare} disabled={!schedule} className="flex-1">
                  <Icon name="share" className="h-4 w-4" />
                  Share statement
                </Button>
              </div>
              {assigned && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
                >
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="flex-1">{assigned.message}</span>
                  {assigned.loanId && (
                    <button
                      onClick={handleUndoAssign}
                      className="cursor-pointer font-semibold text-emerald-800 underline underline-offset-2 transition-colors duration-200 hover:text-emerald-950"
                    >
                      Undo
                    </button>
                  )}
                  <button
                    onClick={() => setAssigned(null)}
                    aria-label="Dismiss"
                    className="cursor-pointer text-emerald-600 transition-colors duration-200 hover:text-emerald-900"
                  >
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                </div>
              )}
              {shareNote && (
                <p role="status" className="rounded-lg bg-sky-50 px-3 py-2.5 text-sm text-sky-700">
                  {shareNote}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Output column */}
        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader
              title={`Amortization Schedule — ${borrowerViewName}`}
              subtitle={
                schedule
                  ? `What ${selectedBorrower ? firstName(selectedBorrower.name) : 'the borrower'} sees on their dashboard: payment dates and totals only`
                  : 'Enter valid inputs to generate the schedule'
              }
              action={
                schedule && (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        downloadCSV(`amortization-schedule-borrower-${P}.csv`, scheduleToCSV(schedule, 'user'))
                      }
                    >
                      <Icon name="download" className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button variant="secondary" onClick={() => handleEmail('user')}>
                      <Icon name="mail" className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                )
              }
            />
            {schedule ? (
              <ScheduleTable schedule={schedule} view="user" />
            ) : (
              <EmptyState
                icon="calculator"
                title="Awaiting valid inputs"
                body="Provide a principal amount, duration, and first payment date to generate the schedule."
              />
            )}
          </Card>

          {schedule && (
            <Card>
              <CardHeader
                title={`Amortization Schedule — ${adminViewName}`}
                subtitle="Admin view: full breakdown with principal and interest spreads"
                action={
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        downloadCSV(`amortization-schedule-${P}.csv`, scheduleToCSV(schedule, 'admin'))
                      }
                    >
                      <Icon name="download" className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button variant="secondary" onClick={() => handleEmail('admin')}>
                      <Icon name="mail" className="h-4 w-4" />
                      Email
                    </Button>
                  </div>
                }
              />
              <ScheduleTable schedule={schedule} view="admin" />
            </Card>
          )}

          {schedule && (
            <Card>
              <CardHeader
                title="Disclosure Summary"
                subtitle="Truth in Lending Act (RA 3765) figures"
              />
              <div className="grid gap-px overflow-hidden rounded-b-xl bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Principal', formatPeso(P)],
                  ['Net Proceeds', formatPeso(deductions.netProceeds)],
                  ['Total Interest', formatPeso(schedule.totals.interest)],
                  ['Total Repayable', formatPeso(schedule.totals.total)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-white px-5 py-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</p>
                    <p className="mt-1 font-mono text-lg font-semibold text-slate-900">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
