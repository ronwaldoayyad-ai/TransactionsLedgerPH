import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, EmptyState, Switch } from './ui'
import Icon from './Icon'
import { buildDuesBreakdown } from '../lib/duesBreakdown'
import { setPageEntry } from '../lib/pageStateStore'
import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { usePersistedState } from '../hooks/usePersistedState'

// Peso / count switch.
function ModeToggle({ mode, onChange }) {
  const opts = [
    { value: 'amount', label: '₱' },
    { value: 'count', label: '#' },
  ]
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1">
      {opts.map((o) => {
        const on = mode === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`cursor-pointer rounded-lg px-4 py-1 text-xs font-medium transition-colors duration-200 ${
              on ? 'bg-navy-800 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Insight({ icon, value, caption, accent = 'text-slate-900' }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <Icon name={icon} className={`mb-1.5 h-4 w-4 ${accent}`} />
      <p className={`text-sm font-semibold leading-5 ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{caption}</p>
    </div>
  )
}

export default function DuesOverview({
  myTxns,
  myLoans,
  title = 'Dues Overview',
  subtitle = 'Your overall payment status',
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState('amount')
  const [loanId, setLoanId] = useState('all')
  const [hidePaidLoans, setHidePaidLoans] = usePersistedState('duesOverview.hidePaidLoans', true)
  const today = toISODate(new Date())

  // A loan is "settled" (hidden by the toggle) when it has installment records
  // and every one is paid, refunded, or cancelled.
  const fullyPaidIds = useMemo(() => {
    const ids = new Set()
    const SETTLED = ['paid', 'refunded', 'cancelled']
    for (const l of myLoans) {
      const t = myTxns.filter((x) => x.loanId === l.id && x.type === 'Installment')
      if (t.length > 0 && t.every((x) => SETTLED.includes(x.status))) ids.add(l.id)
    }
    return ids
  }, [myLoans, myTxns])
  const hasFullyPaid = fullyPaidIds.size > 0

  // When hiding, drop fully-paid loans from the aggregation, the chips, and any
  // stale drill-down selection.
  const visibleLoans = hidePaidLoans ? myLoans.filter((l) => !fullyPaidIds.has(l.id)) : myLoans
  const effectiveLoanId = hidePaidLoans && fullyPaidIds.has(loanId) ? 'all' : loanId
  const scopedTxns = useMemo(
    () => (hidePaidLoans ? myTxns.filter((t) => !fullyPaidIds.has(t.loanId)) : myTxns),
    [hidePaidLoans, myTxns, fullyPaidIds],
  )

  const b = useMemo(
    () => buildDuesBreakdown(scopedTxns, today, effectiveLoanId === 'all' ? undefined : effectiveLoanId),
    [scopedTxns, today, effectiveLoanId],
  )

  // When a specific loan is selected, surface its transaction date + principal.
  const selectedLoan = effectiveLoanId === 'all' ? null : myLoans.find((l) => l.id === effectiveLoanId)
  const selectedLoanTxnDate = selectedLoan
    ? (myTxns.find((t) => t.loanId === selectedLoan.id)?.txnDate ?? selectedLoan.txnDate ?? null)
    : null

  // Segment → Consolidated ledger, prefiltered by borrower status (same
  // page-state seeding the dashboard tiles already use).
  const goStatus = (key) => {
    setPageEntry('consolidated.statusSel', new Set([key]))
    setPageEntry('consolidated.dueDateSel', new Set())
    setPageEntry('consolidated.typeSel', new Set(['Installment']))
    setPageEntry('consolidated.hideSettled', key !== 'paid')
    navigate('/portal/consolidated')
  }

  const paidPct = mode === 'amount' ? b.paidPctAmount : b.paidPctCount
  const centerCaption = b.allSettled
    ? 'All settled'
    : mode === 'amount'
      ? `${formatPeso(b.remainingAmount)} left`
      : `${b.remainingCount} of ${b.totalCount} left`

  const pieData = b.segments
    .map((s) => ({ ...s, value: mode === 'amount' ? s.amount : s.count }))
    .filter((s) => s.value > 0)

  const np = b.nextPayment
  const nextAccent =
    np?.kind === 'past_due'
      ? 'text-red-600'
      : np?.kind === 'due'
        ? 'text-gold-600'
        : 'text-navy-700'
  const nextValue = np ? formatPeso(np.amount) : '—'
  const nextCaption = !np
    ? 'No payment due'
    : np.kind === 'past_due'
      ? `Overdue by ${Math.abs(np.daysUntil)} day${Math.abs(np.daysUntil) === 1 ? '' : 's'}`
      : np.kind === 'due'
        ? `Due today · ${formatDate(np.dueDate)}`
        : `Due in ${np.daysUntil} day${np.daysUntil === 1 ? '' : 's'}`

  const loanChips = [
    { id: 'all', label: 'All loans' },
    ...visibleLoans.map((l) => ({ id: l.id, label: l.label })),
  ]

  const allHidden = hidePaidLoans && hasFullyPaid && b.isEmpty

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {hasFullyPaid && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
                <Switch
                  checked={hidePaidLoans}
                  onChange={setHidePaidLoans}
                  label="Hide fully paid loans"
                />
                Hide fully paid
              </label>
            )}
            <ModeToggle mode={mode} onChange={setMode} />
          </div>
        }
      />

      {b.isEmpty ? (
        <EmptyState
          icon={allHidden ? 'check' : 'chart'}
          title={allHidden ? 'All loans fully paid' : 'No installment loans yet'}
          body={
            allHidden
              ? 'Turn off “Hide fully paid” to see your completed loans.'
              : 'Once you have an installment loan schedule, your dues breakdown will appear here.'
          }
        />
      ) : (
        <div className="p-5">
          {/* Loan drill-down chips (only when more than one loan is visible). */}
          {visibleLoans.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {loanChips.map((c) => {
                const on = effectiveLoanId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLoanId(c.id)}
                    className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors duration-200 ${
                      on ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Selected-loan details: transaction date (left) + principal (right). */}
          {selectedLoan && (
            <div className="mb-4 flex items-start justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-xs text-slate-500">Transaction date</p>
                <p className="text-sm font-medium text-slate-900">{formatDate(selectedLoanTxnDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total principal</p>
                <p className="font-mono text-sm font-semibold text-slate-900">
                  {formatPeso(selectedLoan.principal)}
                </p>
              </div>
            </div>
          )}

          <div className="grid items-center gap-6 sm:grid-cols-2">
            {/* Donut with centered figure. */}
            <div className="relative mx-auto h-56 w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="70%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    paddingAngle={pieData.length > 1 ? 1.5 : 0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pieData.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-4xl font-semibold text-slate-900">{paidPct}%</span>
                <span className="mt-0.5 text-xs text-slate-500">Paid · {centerCaption}</span>
              </div>
            </div>

            {/* Legend — each row taps through to the filtered ledger. */}
            <div className="flex flex-col gap-0.5">
              {b.segments.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goStatus(s.key)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-200 hover:bg-slate-50 ${
                    s.count === 0 ? 'opacity-45' : ''
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{s.label}</span>
                  <span className="text-right">
                    <span className="block font-mono text-sm font-semibold text-slate-900">
                      {mode === 'amount' ? formatPeso(s.amount) : s.count}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {mode === 'amount'
                        ? `${s.count} item${s.count === 1 ? '' : 's'}`
                        : formatPeso(s.amount)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Insight cards. */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Insight icon="clock" value={nextValue} caption={nextCaption} accent={nextAccent} />
            <Insight
              icon="check"
              value={b.streak > 0 ? `${b.streak} on-time` : 'No streak yet'}
              caption={b.streak > 0 ? 'Consecutive on-time payments' : 'Pay on time to start a streak'}
              accent={b.streak > 0 ? 'text-slate-900' : 'text-slate-500'}
            />
            <Insight
              icon="trendingUp"
              value={`${b.payoff.pct}% of term`}
              caption={
                b.payoff.payoffDate
                  ? `${b.payoff.paidCount}/${b.payoff.totalCount} · ends ${formatDate(b.payoff.payoffDate)}`
                  : `${b.payoff.paidCount}/${b.payoff.totalCount} paid`
              }
              accent="text-navy-700"
            />
          </div>
        </div>
      )}
    </Card>
  )
}
