import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Button, Card, CardHeader, CurrencyInput, EmptyState, Field, Modal, inputClass } from '../../components/ui'
import { usePersistedState } from '../../hooks/usePersistedState'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import {
  BANKS,
  computeLoan,
  isFullyPaid,
  lastPaymentDate,
  portfolioSummary,
} from '../../lib/loanTracker'

// Bank logo via Clearbit, with a colored-initials fallback when the image is
// missing or fails to load.
function BankLogo({ domain, acronym, color, size = 36, rounded = 'rounded-lg' }) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }
  if (!domain || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center ${rounded} font-bold text-white`}
        style={{ ...dim, backgroundColor: color || '#1e3a8a', fontSize: size * 0.32 }}
      >
        {acronym || '—'}
      </span>
    )
  }
  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={acronym}
      onError={() => setFailed(true)}
      className={`shrink-0 border border-slate-200 bg-white object-contain ${rounded}`}
      style={{ ...dim, padding: size * 0.12 }}
    />
  )
}

// One of the three summary tiles: a grand total plus a per-bank breakdown of
// the given metric.
function SummaryTile({ label, total, byBank, metric }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-3xl font-bold text-slate-900">{formatPeso(total)}</p>
      <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        {byBank.length === 0 ? (
          <p className="text-xs text-slate-400">No loans yet.</p>
        ) : (
          byBank.map((b) => (
            <div key={b.name} className="flex items-center gap-2 text-sm">
              <BankLogo domain={b.domain} acronym={b.acronym} color={b.color} size={22} />
              <span className="min-w-0 flex-1 truncate text-slate-600">{b.name}</span>
              <span className="font-mono text-slate-800">{formatPeso(b[metric])}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

function StatusBadge({ outstanding }) {
  return outstanding ? (
    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
      Outstanding
    </span>
  ) : (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
      Fully Paid
    </span>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={strong ? 'font-mono font-semibold text-slate-900' : 'font-mono text-slate-800'}>
        {value}
      </span>
    </div>
  )
}

function LoanCard({ loan, today, collapsed, onToggleCollapse, onDelete }) {
  const c = computeLoan(loan)
  const last = lastPaymentDate(loan.firstPaymentDate, loan.durationMonths)
  const outstanding = !isFullyPaid(loan, today)
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <BankLogo domain={loan.bankDomain} acronym={loan.bankAcronym} color={loan.bankColor} size={40} />
        <span className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">{loan.bankName}</span>
        <StatusBadge outstanding={outstanding} />
        <button
          onClick={() => onToggleCollapse(loan.id)}
          aria-label={collapsed ? 'Expand loan details' : 'Collapse loan details'}
          aria-expanded={!collapsed}
          className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
        </button>
        <button
          onClick={() => onDelete(loan.id)}
          aria-label="Delete tracked loan"
          className="cursor-pointer rounded-md p-1.5 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      {collapsed ? (
        // Collapsed: bank stays visible in the header; show only the principal.
        <div className="mt-3">
          <Row label="Principal:" value={formatPeso(loan.principal)} strong />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <Row label="Transaction Date:" value={formatDate(loan.txnDate)} />
            <Row label="Principal:" value={formatPeso(loan.principal)} />
            <Row label="Processing Fee:" value={formatPeso(loan.processingFee)} />
            <Row label="Duration:" value={`${loan.durationMonths} Months`} />
            <Row label="Add-on Rate:" value={`${Number(loan.monthlyRate).toFixed(2)}%`} />
          </div>

          <div className="my-3 border-t border-dashed border-slate-200" />
          <Row label="Total Interest:" value={formatPeso(c.interest)} />
          <div className="flex items-center justify-between py-1 text-sm">
            <span className="text-slate-500">Total Repayment:</span>
            <span className="font-mono text-base font-bold text-blue-700">{formatPeso(c.repayment)}</span>
          </div>

          <div className="my-3 border-t border-dashed border-slate-200" />
          <Row label="First Payment:" value={formatDate(loan.firstPaymentDate)} />
          <Row label="Last Payment:" value={formatDate(last)} />

          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Monthly Payment:</span>
            <span className="rounded-md bg-white px-3 py-1 font-mono text-base font-bold text-slate-900 shadow-sm">
              {formatPeso(c.monthly)}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}

// Admin-only "Loan Portfolio Dashboard": the admin's personal record of loans
// availed from banks. Separate table; affects no other records.
export default function LoanTracker() {
  const { trackedLoans, createTrackedLoan, deleteTrackedLoan } = useApp()
  const today = toISODate(new Date())

  const blank = {
    bank: `${BANKS[0].name}|${BANKS[0].acronym}|${BANKS[0].color}|${BANKS[0].domain}`,
    principal: 0,
    processingFee: 0,
    monthlyRate: '',
    durationMonths: '',
    txnDate: today,
    firstPaymentDate: '',
  }
  // Form + collapse state survive navigating to other tabs; reset only on Refresh.
  const [form, setForm] = usePersistedState('trk.form', blank)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  // Per-card collapse: ids in the set are collapsed (header + principal only).
  const [collapsedIds, setCollapsedIds] = usePersistedState('trk.collapsed', () => new Set())
  const update = (patch) => setForm((f) => ({ ...f, ...patch }))

  const toggleCollapse = (id) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allCollapsed = trackedLoans.length > 0 && trackedLoans.every((l) => collapsedIds.has(l.id))
  const toggleAll = () =>
    setCollapsedIds(allCollapsed ? new Set() : new Set(trackedLoans.map((l) => l.id)))

  const summary = useMemo(() => portfolioSummary(trackedLoans), [trackedLoans])

  const { outstanding, paid } = useMemo(() => {
    const sorted = [...trackedLoans].sort((a, b) =>
      String(b.txnDate ?? '').localeCompare(String(a.txnDate ?? '')),
    )
    return {
      outstanding: sorted.filter((l) => !isFullyPaid(l, today)),
      paid: sorted.filter((l) => isFullyPaid(l, today)),
    }
  }, [trackedLoans, today])

  // Combined monthly obligation across loans still being repaid.
  const outstandingMonthly =
    Math.round(outstanding.reduce((s, l) => s + computeLoan(l).monthly, 0) * 100) / 100

  const canSave =
    form.bank &&
    Number(form.principal) > 0 &&
    Math.floor(Number(form.durationMonths)) >= 1 &&
    form.txnDate &&
    form.firstPaymentDate

  const handleSave = async () => {
    if (!canSave) return
    const [bankName, bankAcronym, bankColor, bankDomain] = form.bank.split('|')
    setSaving(true)
    await createTrackedLoan({
      bankName,
      bankAcronym,
      bankColor,
      bankDomain,
      principal: Number(form.principal),
      processingFee: Number(form.processingFee) || 0,
      monthlyRate: Number(form.monthlyRate) || 0,
      durationMonths: Math.floor(Number(form.durationMonths)),
      txnDate: form.txnDate,
      firstPaymentDate: form.firstPaymentDate,
    })
    setSaving(false)
    setForm({ ...blank })
  }

  return (
    <>
      <PageHeader
        title="Loan Portfolio Dashboard"
        subtitle="Your private record of loans availed from banks. Not visible to borrowers."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">As of {formatDate(today)}</span>
            <RefreshButton />
          </div>
        }
      />

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryTile label="Total Principal Availed" total={summary.principal} byBank={summary.byBank} metric="principal" />
        <SummaryTile label="Total Interest" total={summary.interest} byBank={summary.byBank} metric="interest" />
        <SummaryTile label="Total Repayment" total={summary.repayment} byBank={summary.byBank} metric="repayment" />
      </div>

      {/* Split: form + grids */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="space-y-4 self-start">
          <Card>
          <CardHeader title="Add New Loan" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Bank" htmlFor="trk-bank">
              <select
                id="trk-bank"
                className={inputClass}
                value={form.bank}
                onChange={(e) => update({ bank: e.target.value })}
              >
                {BANKS.map((b) => (
                  <option key={b.domain} value={`${b.name}|${b.acronym}|${b.color}|${b.domain}`}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Principal Amount (PHP)" htmlFor="trk-principal">
              <CurrencyInput id="trk-principal" value={form.principal} onValueChange={(v) => update({ principal: v ?? 0 })} />
            </Field>
            <Field label="Processing Fee (PHP)" htmlFor="trk-proc">
              <CurrencyInput id="trk-proc" value={form.processingFee} onValueChange={(v) => update({ processingFee: v ?? 0 })} />
            </Field>
            <Field label="Monthly Add-on Rate (%)" htmlFor="trk-rate">
              <input
                id="trk-rate"
                type="number"
                step="0.0001"
                min="0"
                placeholder="e.g., 1.15"
                className={inputClass}
                value={form.monthlyRate}
                onChange={(e) => update({ monthlyRate: e.target.value })}
              />
            </Field>
            <Field label="Duration (Months)" htmlFor="trk-duration">
              <input
                id="trk-duration"
                type="number"
                min="1"
                placeholder="e.g., 36"
                className={inputClass}
                value={form.durationMonths}
                onChange={(e) => update({ durationMonths: e.target.value })}
              />
            </Field>
            <Field label="Transaction Date" htmlFor="trk-txndate">
              <input
                id="trk-txndate"
                type="date"
                className={inputClass}
                value={form.txnDate ?? ''}
                onChange={(e) => update({ txnDate: e.target.value })}
              />
            </Field>
            <Field label="First Payment Date" htmlFor="trk-firstpay">
              <input
                id="trk-firstpay"
                type="date"
                className={inputClass}
                value={form.firstPaymentDate ?? ''}
                onChange={(e) => update({ firstPaymentDate: e.target.value })}
              />
            </Field>
            <Button className="w-full" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Saving…' : 'Track Loan'}
            </Button>
          </div>
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-slate-500">Total Monthly Payment (Outstanding)</p>
            <p className="mt-1 font-mono text-2xl font-bold text-blue-700">{formatPeso(outstandingMonthly)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Across {outstanding.length} outstanding loan{outstanding.length === 1 ? '' : 's'}
            </p>
          </Card>
        </div>

        <div className="space-y-8">
          {trackedLoans.length > 0 && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={toggleAll}>
                <Icon name="chevron" className={`h-4 w-4 transition-transform duration-200 ${allCollapsed ? '' : 'rotate-180'}`} />
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            </div>
          )}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Outstanding Loans</h2>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {outstanding.length}
              </span>
            </div>
            {outstanding.length === 0 ? (
              <Card>
                <EmptyState icon="check" title="No outstanding loans" body="Loans still being repaid will appear here." />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {outstanding.map((l) => (
                  <LoanCard
                    key={l.id}
                    loan={l}
                    today={today}
                    collapsed={collapsedIds.has(l.id)}
                    onToggleCollapse={toggleCollapse}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Fully Paid Loans</h2>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {paid.length}
              </span>
            </div>
            {paid.length === 0 ? (
              <Card>
                <EmptyState icon="scroll" title="No fully paid loans" body="Loans whose last payment date has passed will appear here." />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {paid.map((l) => (
                  <LoanCard
                    key={l.id}
                    loan={l}
                    today={today}
                    collapsed={collapsedIds.has(l.id)}
                    onToggleCollapse={toggleCollapse}
                    onDelete={setConfirmDelete}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={!!confirmDelete}
        title="Delete tracked loan?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteTrackedLoan(confirmDelete)
                setConfirmDelete(null)
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently removes the tracked loan from your personal portfolio. It does not affect
          any other records.
        </p>
      </Modal>
    </>
  )
}
