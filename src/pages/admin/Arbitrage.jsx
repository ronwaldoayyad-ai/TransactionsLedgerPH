import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Button, Card, CardHeader, CurrencyInput, EmptyState, Field, Modal, StatCard, inputClass } from '../../components/ui'
import { formatPeso, toISODate } from '../../lib/amortization'
import {
  DEFAULT_PROCESSING_FEE,
  autoDST,
  byBorrower,
  computeArbitrage,
  lastPaymentDate,
  summarize,
} from '../../lib/arbitrage'

// Admin-only Arbitrage / Interest Earnings tracker. Logs the lending spread per
// borrower loan (borrower interest vs the admin's cost) plus collected fees, and
// rolls it up per loan, per borrower, and overall. Standalone records — never
// touches the amortization ledger.
export default function Arbitrage() {
  const {
    users,
    arbitrageLoans,
    interestRates,
    createArbitrageLoan,
    deleteArbitrageLoan,
    addInterestRate,
    deleteInterestRate,
  } = useApp()
  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const today = toISODate(new Date())
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id

  const borrowerRates = useMemo(
    () => interestRates.filter((r) => r.kind === 'borrower').sort((a, b) => a.rate - b.rate),
    [interestRates],
  )
  const costRates = useMemo(
    () => interestRates.filter((r) => r.kind === 'cost').sort((a, b) => a.rate - b.rate),
    [interestRates],
  )

  const [tab, setTab] = useState('ledger') // ledger | summary
  const [saving, setSaving] = useState(false)
  const [ratesOpen, setRatesOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const blank = {
    userId: '',
    principal: 0,
    txnDate: today,
    durationMonths: '',
    firstPaymentDate: '',
    borrowerRate: borrowerRates[0] ? String(borrowerRates[0].rate) : '',
    costRate: costRates[0] ? String(costRates[0].rate) : '',
    dst: 0,
    processingFee: DEFAULT_PROCESSING_FEE,
    notarialFee: 0,
    dstTouched: false,
  }
  const [form, setForm] = useState(blank)

  // Setting principal re-derives DST unless the admin has overridden it.
  const update = (patch) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      if ('principal' in patch && !next.dstTouched) next.dst = autoDST(next.principal)
      return next
    })

  const lastPay = lastPaymentDate(form.firstPaymentDate, form.durationMonths)
  const calc = computeArbitrage(form)
  const overall = useMemo(() => summarize(arbitrageLoans), [arbitrageLoans])
  const perBorrower = useMemo(() => byBorrower(arbitrageLoans, users), [arbitrageLoans, users])

  const ledger = useMemo(
    () =>
      [...arbitrageLoans].sort((a, b) =>
        String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
      ),
    [arbitrageLoans],
  )

  const canSave =
    form.userId &&
    Number(form.principal) > 0 &&
    Math.floor(Number(form.durationMonths)) >= 1 &&
    form.txnDate &&
    form.firstPaymentDate

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await createArbitrageLoan({
      userId: form.userId,
      principal: Number(form.principal),
      txnDate: form.txnDate,
      firstPaymentDate: form.firstPaymentDate,
      durationMonths: Math.floor(Number(form.durationMonths)),
      lastPaymentDate: lastPay,
      borrowerRate: Number(form.borrowerRate) || 0,
      costRate: Number(form.costRate) || 0,
      dst: Number(form.dst) || 0,
      processingFee: Number(form.processingFee) || 0,
      notarialFee: Number(form.notarialFee) || 0,
    })
    setSaving(false)
    setForm({ ...blank })
  }

  return (
    <>
      <PageHeader
        title="Interest / Arbitrage"
        subtitle="Your private record of lending spread — what borrowers pay in interest vs. your cost, plus fees. Not visible to borrowers."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <Button variant="secondary" onClick={() => setRatesOpen(true)}>
              <Icon name="pencil" className="h-4 w-4" />
              Manage rates
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="chart"
          label="Total Borrower Interest"
          value={formatPeso(overall.borrowerInterest)}
          accent="text-blue-700 bg-blue-50"
        />
        <StatCard
          icon="alert"
          label="Total Your Interest Cost"
          value={formatPeso(overall.interestCost)}
          accent="text-red-700 bg-red-50"
        />
        <StatCard
          icon="wallet"
          label="Total Fees Collected"
          value={formatPeso(overall.fees)}
          accent="text-sky-700 bg-sky-50"
        />
        <StatCard
          icon="chart"
          label="Overall Net Gain"
          value={formatPeso(overall.netGain)}
          accent="text-emerald-700 bg-emerald-50"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Form */}
        <Card>
          <CardHeader title="Log New Arbitrage Loan" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Borrower Name" htmlFor="arb-borrower">
              <select
                id="arb-borrower"
                className={inputClass}
                value={form.userId}
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

            <Field label="Principal Amount (₱)" htmlFor="arb-principal">
              <CurrencyInput
                id="arb-principal"
                value={form.principal}
                onValueChange={(v) => update({ principal: v ?? 0 })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Transaction Date" htmlFor="arb-txndate">
                <input
                  id="arb-txndate"
                  type="date"
                  className={inputClass}
                  value={form.txnDate ?? ''}
                  onChange={(e) => update({ txnDate: e.target.value })}
                />
              </Field>
              <Field label="Duration (Months)" htmlFor="arb-duration">
                <input
                  id="arb-duration"
                  type="number"
                  min="1"
                  className={inputClass}
                  value={form.durationMonths}
                  onChange={(e) => update({ durationMonths: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="First Payment Date" htmlFor="arb-firstpay">
                <input
                  id="arb-firstpay"
                  type="date"
                  className={inputClass}
                  value={form.firstPaymentDate ?? ''}
                  onChange={(e) => update({ firstPaymentDate: e.target.value })}
                />
              </Field>
              <Field label="Last Payment Date" htmlFor="arb-lastpay" hint="Auto-filled.">
                <input
                  id="arb-lastpay"
                  type="date"
                  className={inputClass}
                  value={lastPay ?? ''}
                  readOnly
                  disabled
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Borrower Rate/Mo (%)" htmlFor="arb-brate">
                <input
                  id="arb-brate"
                  type="number"
                  step="0.0001"
                  list="arb-borrower-rates"
                  className={inputClass}
                  value={form.borrowerRate}
                  onChange={(e) => update({ borrowerRate: e.target.value })}
                />
                <datalist id="arb-borrower-rates">
                  {borrowerRates.map((r) => (
                    <option key={r.id} value={r.rate.toFixed(4)} />
                  ))}
                </datalist>
              </Field>
              <Field label="Your Cost Rate/Mo (%)" htmlFor="arb-crate">
                <input
                  id="arb-crate"
                  type="number"
                  step="0.0001"
                  list="arb-cost-rates"
                  className={inputClass}
                  value={form.costRate}
                  onChange={(e) => update({ costRate: e.target.value })}
                />
                <datalist id="arb-cost-rates">
                  {costRates.map((r) => (
                    <option key={r.id} value={r.rate.toFixed(4)} />
                  ))}
                </datalist>
              </Field>
            </div>

            <p className="border-t border-slate-100 pt-3 text-sm font-semibold text-navy-700">
              Additional Fees Charged to Borrower (₱)
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="DST"
                htmlFor="arb-dst"
                hint="Auto at ≥ ₱500k (1.50/200)."
              >
                <CurrencyInput
                  id="arb-dst"
                  value={form.dst}
                  onValueChange={(v) => setForm((f) => ({ ...f, dst: v ?? 0, dstTouched: true }))}
                />
              </Field>
              <Field label="Processing Fee" htmlFor="arb-proc">
                <CurrencyInput
                  id="arb-proc"
                  value={form.processingFee}
                  onValueChange={(v) => update({ processingFee: v ?? 0 })}
                />
              </Field>
            </div>

            <Field label="Notarial Fee" htmlFor="arb-notarial">
              <CurrencyInput
                id="arb-notarial"
                value={form.notarialFee}
                onValueChange={(v) => update({ notarialFee: v ?? 0 })}
              />
            </Field>

            <div className="space-y-1 rounded-lg border-l-4 border-navy-600 bg-slate-50/70 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Borrower Interest:</span>
                <span className="font-mono text-blue-700">{formatPeso(calc.borrowerInterest)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Your Interest Cost:</span>
                <span className="font-mono text-red-600">- {formatPeso(calc.interestCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Fees (DST, Proc, Notarial):</span>
                <span className="font-mono text-sky-700">+ {formatPeso(calc.fees)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5">
                <span className="font-semibold text-slate-800">Projected Net Gain:</span>
                <span className="font-mono font-semibold text-emerald-700">{formatPeso(calc.netGain)}</span>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Save Loan Record'}
            </Button>
          </div>
        </Card>

        {/* Tables */}
        <Card>
          <div className="flex gap-6 border-b border-slate-100 px-5 pt-3">
            <button
              onClick={() => setTab('ledger')}
              className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors duration-200 ${tab === 'ledger' ? 'border-navy-700 text-navy-700' : 'cursor-pointer border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Per Loan (Ledger)
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`-mb-px border-b-2 pb-2.5 text-sm font-medium transition-colors duration-200 ${tab === 'summary' ? 'border-navy-700 text-navy-700' : 'cursor-pointer border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Per Borrower Summary
            </button>
          </div>

          {arbitrageLoans.length === 0 ? (
            <EmptyState
              icon="chart"
              title="No arbitrage records yet"
              body="Log an arbitrage loan to start tracking your interest spread and net gain."
            />
          ) : tab === 'ledger' ? (
            <div className="overflow-x-auto px-1 py-2">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Borrower</th>
                    <th className="px-3 py-2">Dates (First – Last)</th>
                    <th className="px-3 py-2 text-right">Principal</th>
                    <th className="px-3 py-2 text-right">Interest Gained</th>
                    <th className="px-3 py-2 text-right">Interest Cost</th>
                    <th className="px-3 py-2 text-right">Fees</th>
                    <th className="px-3 py-2 text-right">Net Gain</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r) => {
                    const c = computeArbitrage(r)
                    return (
                      <tr key={r.id} className="border-b border-slate-50">
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-800">{nameOf(r.userId)}</div>
                          <div className="text-xs text-slate-500">Tx: {r.txnDate}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div>{r.firstPaymentDate}</div>
                          <div className="text-xs text-slate-500">to {r.lastPaymentDate}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatPeso(r.principal)}</td>
                        <td className="px-3 py-2 text-right font-mono text-blue-700">{formatPeso(c.borrowerInterest)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">{formatPeso(c.interestCost)}</td>
                        <td className="px-3 py-2 text-right font-mono text-sky-700">{formatPeso(c.fees)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{formatPeso(c.netGain)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setConfirmDelete(r.id)}
                            aria-label="Delete record"
                            className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto px-1 py-2">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Borrower Name</th>
                    <th className="px-3 py-2">Active Loans</th>
                    <th className="px-3 py-2 text-right">Total Principal</th>
                    <th className="px-3 py-2 text-right">Total Net Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {perBorrower.map((b) => (
                    <tr key={b.userId} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-800">{b.name}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                          {b.loanCount} Loan(s)
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(b.totalPrincipal)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">{formatPeso(b.totalNetGain)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ManageRatesModal
        open={ratesOpen}
        onClose={() => setRatesOpen(false)}
        borrowerRates={borrowerRates}
        costRates={costRates}
        addInterestRate={addInterestRate}
        deleteInterestRate={deleteInterestRate}
      />

      <Modal
        open={!!confirmDelete}
        title="Delete arbitrage record?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteArbitrageLoan(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently removes the arbitrage record. It does not affect the loan ledger.
        </p>
      </Modal>
    </>
  )
}

function RateList({ title, kind, rates, addInterestRate, deleteInterestRate }) {
  const [value, setValue] = useState('')
  const add = async () => {
    const ok = await addInterestRate(kind, value)
    if (ok) setValue('')
  }
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      <div className="space-y-1.5">
        {rates.length === 0 && <p className="text-xs text-slate-400">No rates yet.</p>}
        {rates.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5">
            <span className="font-mono text-sm text-slate-700">{r.rate.toFixed(4)}%</span>
            <button
              onClick={() => deleteInterestRate(r.id)}
              aria-label={`Remove ${r.rate.toFixed(4)}%`}
              className="cursor-pointer rounded p-1 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          step="0.0001"
          min="0"
          placeholder="e.g. 1.7900"
          className={inputClass}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="secondary" onClick={add} disabled={value === ''}>
          Add
        </Button>
      </div>
    </div>
  )
}

function ManageRatesModal({ open, onClose, borrowerRates, costRates, addInterestRate, deleteInterestRate }) {
  return (
    <Modal
      open={open}
      title="Manage interest rates"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        These rates populate the dropdowns on this page and the Loan Calculator. You can still type a
        custom rate directly into any field.
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RateList
          title="Borrower rates"
          kind="borrower"
          rates={borrowerRates}
          addInterestRate={addInterestRate}
          deleteInterestRate={deleteInterestRate}
        />
        <RateList
          title="Your cost rates"
          kind="cost"
          rates={costRates}
          addInterestRate={addInterestRate}
          deleteInterestRate={deleteInterestRate}
        />
      </div>
    </Modal>
  )
}
