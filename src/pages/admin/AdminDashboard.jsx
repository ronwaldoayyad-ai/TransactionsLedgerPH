import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import { Badge, Button, Card, CardHeader, EmptyState, MultiSelect, StatCard, Switch, inputClass } from '../../components/ui'
import Icon from '../../components/Icon'
import PaymentList from '../../components/PaymentList'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import RefreshButton from '../../components/RefreshButton'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus, isReceivable } from '../../lib/transactions'

const sum = (txns) => txns.reduce((s, t) => s + t.amount, 0)

// Shared with the Analytics view so status colours read consistently.
const STATUS_COLORS = {
  paid: '#10b981',
  unpaid: '#f59e0b',
  past_due: '#ef4444',
  refunded: '#0ea5e9',
  cancelled: '#94a3b8',
}

// localStorage key for the admin's per-browser "exclude due to non-payment" list.
const DUE_EXCLUDE_KEY = 'll_admin_duedate_excluded'

// Keep long borrower names from blowing out the bar-chart axis on mobile.
const truncate = (s) => (s.length > 14 ? `${s.slice(0, 13)}…` : s)

// Compact tooltip matching the Analytics charts.
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color ?? entry.payload?.fill }} />
          {entry.name}:{' '}
          <span className="font-mono font-medium text-slate-900">{formatPeso(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

// Distinct palette for borrower slices; a borrower keeps one colour across the
// three Grand-View pies via a shared id→colour map.
const BORROWER_COLORS = [
  '#1e3a8a', '#ca8a04', '#10b981', '#ef4444', '#0ea5e9',
  '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#64748b',
]

// Compact date for the quick-jump pills, e.g. "May 15".
const shortDate = (iso) => {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
}

// One Grand-View pie tile: donut of amounts by borrower + a short legend.
// The legend collapses to the top 4 by default; when there are more, the
// "+N more borrowers" line becomes a button that expands to show all rows
// (and collapses back). Tiles remember their own open/closed state.
function BorrowerPie({ title, caption, data, colorMap }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const [expanded, setExpanded] = useState(false)
  const COLLAPSED_COUNT = 4
  const hasMore = data.length > COLLAPSED_COUNT
  const visible = expanded || !hasMore ? data : data.slice(0, COLLAPSED_COUNT)
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="shrink-0 font-mono text-xs font-semibold text-slate-700">{formatPeso(total)}</span>
      </div>
      <p className="mb-1 mt-0.5 truncate text-[11px] text-slate-500">{caption}</p>
      {data.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-xs text-slate-400">No items</div>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={data.length > 1 ? 2 : 0}
                  isAnimationActive={false}
                >
                  {data.map((e) => (
                    <Cell key={e.userId} fill={colorMap[e.userId] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-1">
            {visible.map((e) => (
              <li key={e.userId} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorMap[e.userId] ?? '#94a3b8' }} />
                  <span className="truncate text-slate-600">{e.name}</span>
                </span>
                <span className="shrink-0 font-mono text-slate-800">{formatPeso(e.value)}</span>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 flex items-center gap-1 self-start rounded text-[11px] font-medium text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
            >
              <Icon
                name="chevron"
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded ? 'Show less' : `+${data.length - COLLAPSED_COUNT} more borrowers`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { users, loans, payments, transactions, auditLog } = useApp()
  const today = toISODate(new Date())
  const activeBorrowers = users.filter((u) => u.role === 'user' && u.status === 'active').length
  // Disbursed = net proceeds of loans that still have at least one ledger
  // record; deleting all of a loan's entries deducts it from this figure.
  const totalDisbursed = loans
    .filter((l) => transactions.some((t) => t.loanId === l.id))
    .reduce((s, l) => s + (l.disclosure?.netProceeds ?? 0), 0)

  const receivables = useMemo(
    () => transactions.filter((t) => isReceivable(t, today)),
    [transactions, today],
  )
  const outstanding = sum(receivables)

  // Totals split by transaction type across all borrowers, plus grand total.
  const straightTxns = transactions.filter((t) => t.type === 'Straight')
  const installmentTxns = transactions.filter((t) => t.type === 'Installment')
  const straightTotal = sum(straightTxns)
  const installmentTotal = sum(installmentTxns)
  const grandTotal = straightTotal + installmentTotal
  // Total Interest = sum of every loan's monthly interests (P×R×D), across
  // loans that still have ledger records.
  const totalInterest = loans
    .filter((l) => transactions.some((t) => t.loanId === l.id))
    .reduce((s, l) => s + (l.disclosure?.schedule?.totals?.interest ?? 0), 0)
  // Total Fees = DST + Processing + Notarial across installment loans that
  // still have ledger records.
  const totalFees = loans
    .filter((l) => l.txnType !== 'straight' && transactions.some((t) => t.loanId === l.id))
    .reduce(
      (s, l) => s + (Number(l.dst) || 0) + (Number(l.processingFee) || 0) + (Number(l.notarialFee) || 0),
      0,
    )

  const nameOf = (userId) => users.find((u) => u.id === userId)?.name ?? userId

  // --- Receivables by Status: borrower filter pills feeding a donut chart. ---
  const [statusBorrowerSel, setStatusBorrowerSel] = useState(() => new Set())
  const toggleStatusBorrower = (id) =>
    setStatusBorrowerSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  // Borrowers that actually appear in the ledger, for the filter pills.
  const statusBorrowerOptions = useMemo(() => {
    const ids = new Set(transactions.map((t) => t.userId))
    return users
      .filter((u) => ids.has(u.id))
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions, users])

  // Receivables grouped three ways: status, borrower, due date.
  const byStatus = useMemo(() => {
    const groups = {}
    transactions.forEach((t) => {
      if (statusBorrowerSel.size > 0 && !statusBorrowerSel.has(t.userId)) return
      const s = effectiveStatus(t, today)
      groups[s] = groups[s] ?? { count: 0, amount: 0 }
      groups[s].count += 1
      groups[s].amount += t.amount
    })
    return Object.keys(STATUS_LABELS)
      .filter((s) => groups[s])
      .map((s) => ({ status: s, name: STATUS_LABELS[s], ...groups[s] }))
  }, [transactions, today, statusBorrowerSel])

  // Footer total tracks the pills: only the selected borrowers' receivables.
  const statusReceivablesTotal = useMemo(
    () =>
      receivables
        .filter((t) => statusBorrowerSel.size === 0 || statusBorrowerSel.has(t.userId))
        .reduce((s, t) => s + t.amount, 0),
    [receivables, statusBorrowerSel],
  )

  const byBorrower = useMemo(() => {
    const groups = {}
    receivables.forEach((t) => {
      groups[t.userId] = groups[t.userId] ?? { count: 0, amount: 0 }
      groups[t.userId].count += 1
      groups[t.userId].amount += t.amount
    })
    return Object.entries(groups)
      .map(([userId, g]) => ({ userId, ...g }))
      .sort((a, b) => b.amount - a.amount)
  }, [receivables])

  // Top-10 slice for the horizontal bar chart (largest open balances first).
  const borrowerChart = useMemo(
    () =>
      byBorrower.slice(0, 10).map((b) => ({
        userId: b.userId,
        name: nameOf(b.userId),
        amount: Math.round(b.amount * 100) / 100,
        count: b.count,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
    [byBorrower, users],
  )

  // --- Receivables by Due Date: exclusion list + dynamic due-date filter. ---
  // Excluded borrowers (persisted per browser) are dropped from this tile so
  // non-payers don't skew the expected-collections picture.
  const [excludedBorrowers, setExcludedBorrowers] = useState(() => {
    try {
      const raw = localStorage.getItem(DUE_EXCLUDE_KEY)
      return new Set(raw ? JSON.parse(raw) : [])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(DUE_EXCLUDE_KEY, JSON.stringify([...excludedBorrowers]))
    } catch {
      /* storage unavailable — exclusion is still live for this session */
    }
  }, [excludedBorrowers])
  const addExcluded = (id) => id && setExcludedBorrowers((prev) => new Set(prev).add(id))
  const removeExcluded = (id) =>
    setExcludedBorrowers((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const [dueDateSel, setDueDateSel] = useState('all')
  // Receivables after applying the exclusion list — the basis for this tile.
  const dueDateReceivables = useMemo(
    () => receivables.filter((t) => !excludedBorrowers.has(t.userId)),
    [receivables, excludedBorrowers],
  )
  // Dynamic date options: only due dates that still have unpaid/past-due items.
  const dueDateOptions = useMemo(
    () => [...new Set(dueDateReceivables.map((t) => t.dueDate))].sort((a, b) => a.localeCompare(b)),
    [dueDateReceivables],
  )
  // If the chosen date no longer applies (e.g. after excluding a borrower),
  // fall back to "all" without a state write.
  const effectiveDueSel =
    dueDateSel !== 'all' && !dueDateOptions.includes(dueDateSel) ? 'all' : dueDateSel

  const byDueDate = useMemo(() => {
    const groups = {}
    dueDateReceivables
      .filter((t) => effectiveDueSel === 'all' || t.dueDate === effectiveDueSel)
      .forEach((t) => {
        groups[t.dueDate] = groups[t.dueDate] ?? { count: 0, amount: 0 }
        groups[t.dueDate].count += 1
        groups[t.dueDate].amount += t.amount
      })
    return Object.entries(groups)
      .map(([dueDate, g]) => ({ dueDate, ...g }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [dueDateReceivables, effectiveDueSel])

  // Grand View. By DEFAULT (no filter touched) it shows only what needs
  // attention: every Past Due item plus the Unpaid items on the next (earliest)
  // upcoming due date. Picking a single due date or a status switches to
  // explicit filtering. The exclusion list is shared with Receivables by Due
  // Date, so a non-payer excluded there drops out of these charts too.
  const [grandDueSel, setGrandDueSel] = useState('all')
  const [grandStatusSel, setGrandStatusSel] = useState(() => new Set())
  // Default ON: hide fully paid/refunded/cancelled. Label flips to "Show all".
  const [grandHideSettled, setGrandHideSettled] = useState(true)
  // Clamp the chosen date if the exclusion list dropped it from the options.
  const effectiveGrandDue =
    grandDueSel !== 'all' && !dueDateOptions.includes(grandDueSel) ? 'all' : grandDueSel
  const grandTouched = effectiveGrandDue !== 'all' || grandStatusSel.size > 0
  const grandBorrowers = useMemo(
    () => users.filter((u) => u.role === 'user').map((u) => ({ value: u.id, label: u.name })),
    [users],
  )

  // Anchor for the three pies: the chosen date, else the nearest upcoming due
  // date, else the most recent past-due date.
  const grandAnchor = useMemo(() => {
    if (effectiveGrandDue !== 'all') return effectiveGrandDue
    const upcoming = dueDateOptions.find((d) => d >= today)
    if (upcoming) return upcoming
    return dueDateOptions.length ? dueDateOptions[dueDateOptions.length - 1] : null
  }, [effectiveGrandDue, dueDateOptions, today])
  const grandNextDate = useMemo(
    () => (grandAnchor ? dueDateOptions.find((d) => d > grandAnchor) ?? null : null),
    [grandAnchor, dueDateOptions],
  )
  // Past (before anchor) / Current (anchor) / Next (following date) amounts
  // grouped by borrower — exclusion already applied via dueDateReceivables.
  const grandPies = useMemo(() => {
    const groupByBorrower = (txns) => {
      const g = {}
      txns.forEach((t) => {
        g[t.userId] = (g[t.userId] ?? 0) + t.amount
      })
      return Object.entries(g)
        .map(([userId, amount]) => ({ userId, name: nameOf(userId), value: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
    }
    const pastDue = groupByBorrower(dueDateReceivables.filter((t) => grandAnchor && t.dueDate < grandAnchor))
    const currentDue = groupByBorrower(dueDateReceivables.filter((t) => t.dueDate === grandAnchor))
    const nextDue = groupByBorrower(dueDateReceivables.filter((t) => grandNextDate && t.dueDate === grandNextDate))
    const ids = [...new Set([...pastDue, ...currentDue, ...nextDue].map((d) => d.userId))]
    const colorMap = {}
    ids.forEach((id, i) => {
      colorMap[id] = BORROWER_COLORS[i % BORROWER_COLORS.length]
    })
    return { pastDue, currentDue, nextDue, colorMap }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
  }, [dueDateReceivables, grandAnchor, grandNextDate, users])

  // Quick-jump pills: the 5 most recent past due dates + the next 5 upcoming,
  // dynamic against the exclusion list (they derive from dueDateOptions).
  const grandPastPills = useMemo(() => dueDateOptions.filter((d) => d < today).slice(-5), [dueDateOptions, today])
  const grandUpcomingPills = useMemo(() => dueDateOptions.filter((d) => d >= today).slice(0, 5), [dueDateOptions, today])
  const grandRows = useMemo(() => {
    const sortRows = (rows) =>
      [...rows].sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) ||
          nameOf(a.userId).localeCompare(nameOf(b.userId)) ||
          a.id.localeCompare(b.id),
      )
    // Base set: the default attention view, or an explicit due-date/status filter.
    let base
    if (!grandTouched) {
      const pastDue = transactions.filter((t) => effectiveStatus(t, today) === 'past_due')
      const unpaid = transactions.filter((t) => effectiveStatus(t, today) === 'unpaid')
      const nextDate = unpaid.reduce(
        (min, t) => (min == null || t.dueDate < min ? t.dueDate : min),
        null,
      )
      const nextUnpaid = nextDate ? unpaid.filter((t) => t.dueDate === nextDate) : []
      base = [...pastDue, ...nextUnpaid]
    } else {
      base = transactions.filter((t) => {
        if (effectiveGrandDue !== 'all' && t.dueDate !== effectiveGrandDue) return false
        if (grandStatusSel.size > 0 && !grandStatusSel.has(effectiveStatus(t, today))) return false
        return true
      })
    }
    // Exclusion list + hide-settled apply on top of whichever base set.
    return sortRows(
      base.filter((t) => {
        if (excludedBorrowers.has(t.userId)) return false
        if (grandHideSettled && ['paid', 'refunded', 'cancelled'].includes(effectiveStatus(t, today)))
          return false
        return true
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
  }, [transactions, effectiveGrandDue, grandStatusSel, grandHideSettled, grandTouched, excludedBorrowers, today, users],
  )

  // Pagination for the due-date list and the lower sections.
  const dueDatePag = usePagination(byDueDate, 5)
  const activityPag = usePagination(auditLog, 5)
  const grandPag = usePagination(grandRows, 15)

  const pager = (pag, itemLabel, pageSizeOptions = [5, 10, 15, 25]) => (
    <Pagination
      page={pag.page}
      pageCount={pag.pageCount}
      pageSize={pag.pageSize}
      total={pag.total}
      start={pag.start}
      end={pag.end}
      onPageChange={pag.setPage}
      onPageSizeChange={pag.setPageSize}
      pageSizeOptions={pageSizeOptions}
      itemLabel={itemLabel}
    />
  )

  return (
    <>
      <PageHeader
        title="Command Center"
        subtitle="Portfolio health, verifications, and recent activity at a glance."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <Link to="/admin/calculator">
              <Button variant="gold">
                <Icon name="calculator" className="h-4 w-4" />
                New Loan Disclosure
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="users" label="Active Borrowers" value={activeBorrowers} hint={`${users.length} total accounts`} />
        <StatCard icon="wallet" label="Total Net Proceeds Disbursed" value={formatPeso(totalDisbursed)} />
        <StatCard
          icon="trendingUp"
          label="Outstanding Receivables"
          value={formatPeso(outstanding)}
          hint={`${receivables.length} open installments`}
          accent="text-gold-600 bg-amber-50"
        />
        <StatCard
          icon="wallet"
          label="Total Fees"
          value={formatPeso(totalFees)}
          hint="DST + Processing + Notarial (installments)"
          accent="text-gold-600 bg-amber-50"
        />
        <StatCard
          icon="wallet"
          label="Total Installment Transactions"
          value={formatPeso(installmentTotal)}
          hint={`${installmentTxns.length} installment${installmentTxns.length === 1 ? '' : 's'}`}
          accent="text-navy-800 bg-navy-50"
        />
        <StatCard
          icon="list"
          label="Total Straight Transactions"
          value={formatPeso(straightTotal)}
          hint={`${straightTxns.length} item${straightTxns.length === 1 ? '' : 's'}`}
          accent="text-violet-700 bg-violet-50"
        />
        <StatCard
          icon="trendingUp"
          label="Total Interest"
          value={formatPeso(totalInterest)}
          hint="Sum of all monthly interests"
          accent="text-gold-600 bg-amber-50"
        />
        <StatCard
          icon="chart"
          label="Grand Total"
          value={formatPeso(grandTotal)}
          hint="Installments + straight"
          accent="text-emerald-700 bg-emerald-50"
        />
      </div>

      {/* Receivables breakdown */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Receivables by Status" subtitle="Ledger amounts grouped by status" />
          {/* Borrower filter pills — wrap freely on narrow screens. */}
          <div className="flex flex-wrap gap-1.5 px-5 pt-4">
            <button
              onClick={() => setStatusBorrowerSel(new Set())}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                statusBorrowerSel.size === 0
                  ? 'border-navy-700 bg-navy-800 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {statusBorrowerOptions.map((b) => {
              const on = statusBorrowerSel.has(b.id)
              return (
                <button
                  key={b.id}
                  onClick={() => toggleStatusBorrower(b.id)}
                  aria-pressed={on}
                  className={`max-w-full cursor-pointer truncate rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                    on
                      ? 'border-navy-700 bg-navy-800 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {b.name}
                </button>
              )
            })}
          </div>
          {byStatus.length === 0 ? (
            <EmptyState icon="check" title="No transactions" />
          ) : (
            <>
              <div className="h-52 px-3 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byStatus}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={3}
                      animationDuration={700}
                      animationEasing="ease-out"
                    >
                      {byStatus.map((entry) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend doubles as the numeric breakdown. */}
              <ul className="mt-1 divide-y divide-slate-100">
                {byStatus.map(({ status, count, amount }) => (
                  <li key={status} className="flex items-center justify-between px-5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: STATUS_COLORS[status] ?? '#94a3b8' }}
                      />
                      <span className="truncate text-sm font-medium text-slate-700">{STATUS_LABELS[status]}</span>
                      <span className="shrink-0 text-xs text-slate-400">{count}×</span>
                    </span>
                    <span className="ml-2 shrink-0 font-mono text-sm font-medium text-slate-900">{formatPeso(amount)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex items-center justify-between border-t border-slate-200 bg-navy-50/70 px-5 py-3">
            <span className="text-sm font-semibold text-navy-900">Total Receivables</span>
            <span className="font-mono text-sm font-bold text-navy-900">{formatPeso(statusReceivablesTotal)}</span>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Receivables by Borrower"
            subtitle={
              byBorrower.length > 10
                ? `Top 10 of ${byBorrower.length} accounts by open balance`
                : 'Open balances per account'
            }
          />
          {byBorrower.length === 0 ? (
            <EmptyState icon="check" title="Nothing outstanding" />
          ) : (
            <div
              className="w-full px-2 py-4"
              style={{ height: `${Math.max(180, borrowerChart.length * 46)}px` }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={borrowerChart} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#0f172a' }}
                    axisLine={false}
                    tickLine={false}
                    width={92}
                    tickFormatter={truncate}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(30,58,138,0.05)' }} />
                  <Bar
                    dataKey="amount"
                    name="Outstanding"
                    fill="#ca8a04"
                    radius={[0, 6, 6, 0]}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Receivables by Due Date"
            subtitle="Expected collections per date"
            action={
              <select
                aria-label="Filter by due date"
                value={effectiveDueSel}
                onChange={(e) => setDueDateSel(e.target.value)}
                className={`${inputClass} !w-auto max-w-[11rem] text-sm`}
              >
                <option value="all">All due dates</option>
                {dueDateOptions.map((d) => (
                  <option key={d} value={d}>
                    {formatDate(d)}
                    {d < today ? ' · overdue' : ''}
                  </option>
                ))}
              </select>
            }
          />
          {/* Exclusion controls — non-payers dropped from this tile's default view. */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <span className="text-xs font-medium text-slate-500">Exclude (non-payment):</span>
            <select
              aria-label="Exclude a borrower due to non-payment"
              value=""
              onChange={(e) => addExcluded(e.target.value)}
              className={`${inputClass} !w-auto max-w-[10rem] text-sm`}
            >
              <option value="" disabled>
                Add borrower…
              </option>
              {grandBorrowers
                .filter((b) => !excludedBorrowers.has(b.value))
                .map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
            </select>
            {excludedBorrowers.size === 0 ? (
              <span className="text-xs text-slate-400">None excluded</span>
            ) : (
              [...excludedBorrowers].map((id) => (
                <span
                  key={id}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                >
                  <span className="truncate">{nameOf(id)}</span>
                  <button
                    onClick={() => removeExcluded(id)}
                    aria-label={`Remove ${nameOf(id)} from exclusion list`}
                    className="shrink-0 cursor-pointer text-sm leading-none text-red-400 hover:text-red-700"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          {byDueDate.length === 0 ? (
            <EmptyState
              icon="check"
              title="Nothing outstanding"
              body={
                dueDateSel !== 'all'
                  ? 'No unpaid or past-due items on this date.'
                  : excludedBorrowers.size > 0
                    ? 'All remaining receivables belong to excluded borrowers.'
                    : undefined
              }
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {dueDatePag.pageItems.map(({ dueDate, count, amount }) => (
                  <li key={dueDate} className="flex items-center justify-between px-5 py-3">
                    <span>
                      <span className={`block text-sm font-medium ${dueDate < today ? 'text-red-700' : 'text-slate-900'}`}>
                        {formatDate(dueDate)}
                        {dueDate < today && ' · overdue'}
                      </span>
                      <span className="text-xs text-slate-500">{count} installments</span>
                    </span>
                    <span className="font-mono text-sm font-medium text-slate-900">{formatPeso(amount)}</span>
                  </li>
                ))}
              </ul>
              {pager(dueDatePag, 'dates')}
            </>
          )}
        </Card>
      </div>

      {/* Grand view — past due + next unpaid date by default */}
      <Card className="mt-6">
        <CardHeader
          title="Grand View — Scheduled Collections"
          subtitle="Past / current / next dues by borrower, plus the collections list. Pick a single due date, or exclude non-payers."
          action={
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <Switch
                checked={grandHideSettled}
                onChange={setGrandHideSettled}
                label={grandHideSettled ? 'Show all transactions' : 'Hide paid, refunded, and cancelled transactions'}
              />
              {grandHideSettled ? 'Show all transactions' : 'Hide paid/refunded/cancelled'}
            </label>
          }
        />

        {/* Control bar: single due date + status + exclusion list. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3">
          <span className="text-xs font-medium text-slate-500">Due Date</span>
          <select
            aria-label="Grand View due date"
            value={effectiveGrandDue}
            onChange={(e) => setGrandDueSel(e.target.value)}
            className={`${inputClass} !w-auto max-w-[11rem] text-sm`}
          >
            <option value="all">Auto (next due date)</option>
            {dueDateOptions.map((d) => (
              <option key={d} value={d}>
                {formatDate(d)}
                {d < today ? ' · overdue' : ''}
              </option>
            ))}
          </select>
          <span className="text-xs font-medium text-slate-500">Status</span>
          <MultiSelect
            label="Status"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            selected={grandStatusSel}
            onChange={setGrandStatusSel}
            className="w-36"
          />
          <span className="ml-auto text-xs font-medium text-slate-500">Exclude (non-payment):</span>
          <select
            aria-label="Exclude a borrower due to non-payment"
            value=""
            onChange={(e) => addExcluded(e.target.value)}
            className={`${inputClass} !w-auto max-w-[10rem] text-sm`}
          >
            <option value="" disabled>
              Add borrower…
            </option>
            {grandBorrowers
              .filter((b) => !excludedBorrowers.has(b.value))
              .map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
          </select>
          {(effectiveGrandDue !== 'all' || grandStatusSel.size > 0) && (
            <button
              onClick={() => {
                setGrandDueSel('all')
                setGrandStatusSel(new Set())
              }}
              className="cursor-pointer text-xs font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
            >
              Clear
            </button>
          )}
        </div>

        {/* Excluded-borrower chips (shared with Receivables by Due Date). */}
        {excludedBorrowers.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2">
            <span className="text-xs text-slate-400">Excluded:</span>
            {[...excludedBorrowers].map((id) => (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
              >
                <span className="truncate">{nameOf(id)}</span>
                <button
                  onClick={() => removeExcluded(id)}
                  aria-label={`Remove ${nameOf(id)} from exclusion list`}
                  className="shrink-0 cursor-pointer text-sm leading-none text-red-400 hover:text-red-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Quick-jump pills: last 5 past due dates + next 5 upcoming (dynamic). */}
        {(grandPastPills.length > 0 || grandUpcomingPills.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-3">
            <span className="text-xs font-medium text-slate-500">Jump to:</span>
            <button
              onClick={() => setGrandDueSel('all')}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                effectiveGrandDue === 'all'
                  ? 'border-navy-700 bg-navy-800 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Auto
            </button>
            {grandPastPills.map((d) => (
              <button
                key={d}
                onClick={() => setGrandDueSel(d)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                  effectiveGrandDue === d
                    ? 'border-navy-700 bg-navy-800 text-white'
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                {shortDate(d)}
              </button>
            ))}
            {grandUpcomingPills.map((d) => (
              <button
                key={d}
                onClick={() => setGrandDueSel(d)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                  effectiveGrandDue === d
                    ? 'border-navy-700 bg-navy-800 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {shortDate(d)}
              </button>
            ))}
          </div>
        )}

        {/* Three pies: Past / Current / Next dues by borrower — wrap on mobile. */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 md:grid-cols-3">
          <BorrowerPie
            title="Past Dues"
            caption={grandAnchor ? `Overdue before ${formatDate(grandAnchor)}` : 'No due dates'}
            data={grandPies.pastDue}
            colorMap={grandPies.colorMap}
          />
          <BorrowerPie
            title="Current Payment Dues"
            caption={grandAnchor ? `Due ${formatDate(grandAnchor)}` : 'No due dates'}
            data={grandPies.currentDue}
            colorMap={grandPies.colorMap}
          />
          <BorrowerPie
            title="Next Payment Dues"
            caption={grandNextDate ? `Due ${formatDate(grandNextDate)}` : 'No later due date'}
            data={grandPies.nextDue}
            colorMap={grandPies.colorMap}
          />
        </div>
        {grandRows.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No collections match"
            body="No transactions match the selected due date, status, and exclusion list."
          />
        ) : (
          <>
          {/* Mobile: read-only cards (mirrors the mobile app). */}
          <div className="md:hidden">
            {grandPag.pageItems.map((t, idx) => {
              const effective = effectiveStatus(t, today)
              return (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    idx > 0 ? 'border-t border-slate-100' : 'border-t border-slate-200'
                  } ${effective === 'past_due' ? 'bg-red-50/60' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{nameOf(t.userId)}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {t.description} · Due {formatDate(t.dueDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-[13px] font-semibold text-slate-900">{formatPeso(t.amount)}</span>
                    <Badge status={effective}>{STATUS_LABELS[effective]}</Badge>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between border-t border-slate-200 bg-navy-50/70 px-4 py-3">
              <span className="text-xs font-semibold text-navy-900">TOTAL ({grandRows.length})</span>
              <span className="font-mono text-sm font-semibold text-navy-900">{formatPeso(sum(grandRows))}</span>
            </div>
          </div>

          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-5 py-3">Borrower</th>
                  <th scope="col" className="px-5 py-3">Item Description</th>
                  <th scope="col" className="px-5 py-3">Due Date</th>
                  <th scope="col" className="px-5 py-3 text-right">Amount</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {grandPag.pageItems.map((t) => {
                  const effective = effectiveStatus(t, today)
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-slate-100 transition-colors duration-150 hover:bg-navy-50/40 ${
                        effective === 'past_due' ? 'bg-red-50/70' : ''
                      }`}
                    >
                      <td className="px-5 py-3 font-medium text-slate-900">{nameOf(t.userId)}</td>
                      <td className="px-5 py-3 text-slate-700">{t.description}</td>
                      <td className="px-5 py-3 text-slate-700">{formatDate(t.dueDate)}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-900">{formatPeso(t.amount)}</td>
                      <td className="px-5 py-3">
                        <Badge status={effective}>{STATUS_LABELS[effective]}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-navy-50/70 text-sm font-semibold text-navy-900">
                  <td className="px-5 py-3" colSpan={3}>
                    TOTAL ({grandRows.length} item{grandRows.length === 1 ? '' : 's'} ·{' '}
                    {new Set(grandRows.map((t) => t.userId)).size} borrower
                    {new Set(grandRows.map((t) => t.userId)).size === 1 ? '' : 's'})
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{formatPeso(sum(grandRows))}</td>
                  <td className="px-5 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
        {grandRows.length > 0 && pager(grandPag, 'records', [15, 25, 50, 100])}
      </Card>

      {/* Verification Queue — mirrors the full Verification Queue tab */}
      <Card className="mt-6">
        <CardHeader
          title="Verification Queue"
          subtitle="Review uploaded proofs of payment — same controls as the Verification Queue tab"
          action={
            <Link
              to="/admin/queue"
              className="cursor-pointer text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
            >
              Open queue
            </Link>
          }
        />
        <PaymentList
          payments={payments}
          canReview
          showBorrower
          pageSize={5}
          emptyBody="No payment proofs match this filter."
        />
      </Card>

      <Card className="mt-6">
        <CardHeader
          title="Recent Activity"
          subtitle="Audit trail (latest entries)"
          action={
            <Link
              to="/admin/logs"
              className="cursor-pointer text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
            >
              Full log
            </Link>
          }
        />
        <ul className="divide-y divide-slate-100">
          {activityPag.pageItems.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-0.5 rounded-lg bg-slate-100 p-1.5 text-slate-500">
                <Icon name="scroll" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{entry.detail}</p>
                <p className="text-xs text-slate-400">
                  {entry.actor} · {entry.at} ·{' '}
                  <span className="font-mono text-[11px] uppercase">{entry.action}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
        {auditLog.length > 0 && pager(activityPag, 'entries')}
      </Card>
    </>
  )
}
