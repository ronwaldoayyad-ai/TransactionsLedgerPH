import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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

  // Receivables grouped three ways: status, borrower, due date.
  const byStatus = useMemo(() => {
    const groups = {}
    transactions.forEach((t) => {
      const s = effectiveStatus(t, today)
      groups[s] = groups[s] ?? { count: 0, amount: 0 }
      groups[s].count += 1
      groups[s].amount += t.amount
    })
    return Object.keys(STATUS_LABELS)
      .filter((s) => groups[s])
      .map((s) => ({ status: s, ...groups[s] }))
  }, [transactions, today])

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

  const byDueDate = useMemo(() => {
    const groups = {}
    receivables.forEach((t) => {
      groups[t.dueDate] = groups[t.dueDate] ?? { count: 0, amount: 0 }
      groups[t.dueDate].count += 1
      groups[t.dueDate].amount += t.amount
    })
    return Object.entries(groups)
      .map(([dueDate, g]) => ({ dueDate, ...g }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [receivables])

  // Grand View. By DEFAULT (no filter touched) it shows only what needs
  // attention: every Past Due item plus the Unpaid items on the next (earliest)
  // upcoming due date — not every future unpaid, to keep the grid uncluttered.
  // Setting a Due Date range or a status filter switches to explicit filtering.
  const [grandFrom, setGrandFrom] = useState('')
  const [grandTo, setGrandTo] = useState('')
  const [grandStatusSel, setGrandStatusSel] = useState(() => new Set())
  const [grandBorrowerSel, setGrandBorrowerSel] = useState(() => new Set())
  // Default ON: hide fully paid/refunded/cancelled. Label flips to "Show all".
  const [grandHideSettled, setGrandHideSettled] = useState(true)
  const grandTouched = grandFrom !== '' || grandTo !== '' || grandStatusSel.size > 0
  const grandBorrowers = useMemo(
    () => users.filter((u) => u.role === 'user').map((u) => ({ value: u.id, label: u.name })),
    [users],
  )
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
        if (grandFrom && t.dueDate < grandFrom) return false
        if (grandTo && t.dueDate > grandTo) return false
        if (grandStatusSel.size > 0 && !grandStatusSel.has(effectiveStatus(t, today))) return false
        return true
      })
    }
    // Borrower filter + hide-settled apply on top of whichever base set.
    return sortRows(
      base.filter((t) => {
        if (grandBorrowerSel.size > 0 && !grandBorrowerSel.has(t.userId)) return false
        if (grandHideSettled && ['paid', 'refunded', 'cancelled'].includes(effectiveStatus(t, today)))
          return false
        return true
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
  }, [transactions, grandFrom, grandTo, grandStatusSel, grandBorrowerSel, grandHideSettled, grandTouched, today, users],
  )

  // Pagination for each dashboard section.
  const statusPag = usePagination(byStatus, 5)
  const borrowerPag = usePagination(byBorrower, 5)
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
          <CardHeader title="Receivables by Status" subtitle="All ledger amounts grouped by status" />
          <ul className="divide-y divide-slate-100">
            {statusPag.pageItems.map(({ status, count, amount }) => (
              <li key={status} className="flex items-center justify-between px-5 py-3">
                <span className="flex items-center gap-2">
                  <Badge status={status}>{STATUS_LABELS[status]}</Badge>
                  <span className="text-xs text-slate-500">{count}×</span>
                </span>
                <span className="font-mono text-sm font-medium text-slate-900">{formatPeso(amount)}</span>
              </li>
            ))}
          </ul>
          {byStatus.length > 0 && pager(statusPag, 'statuses')}
          <div className="flex items-center justify-between border-t border-slate-200 bg-navy-50/70 px-5 py-3">
            <span className="text-sm font-semibold text-navy-900">Total Receivables</span>
            <span className="font-mono text-sm font-bold text-navy-900">{formatPeso(outstanding)}</span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Receivables by Borrower" subtitle="Open balances per account" />
          {byBorrower.length === 0 ? (
            <EmptyState icon="check" title="Nothing outstanding" />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {borrowerPag.pageItems.map(({ userId, count, amount }) => (
                  <li key={userId} className="flex items-center justify-between px-5 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-800">
                        {nameOf(userId).charAt(0)}
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{nameOf(userId)}</span>
                        <span className="text-xs text-slate-500">{count} installments</span>
                      </span>
                    </span>
                    <span className="font-mono text-sm font-medium text-slate-900">{formatPeso(amount)}</span>
                  </li>
                ))}
              </ul>
              {pager(borrowerPag, 'borrowers')}
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Receivables by Due Date" subtitle="Expected collections per date" />
          {byDueDate.length === 0 ? (
            <EmptyState icon="check" title="Nothing outstanding" />
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

      {/* Grand view — past due + next unpaid date by default */}
      <Card className="mt-6">
        <CardHeader
          title="Grand View — Scheduled Collections"
          subtitle="By default: all past-due items plus the next unpaid due date. Filter by due-date range or status to see more."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <label className="mr-1 flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <Switch
                  checked={grandHideSettled}
                  onChange={setGrandHideSettled}
                  label={grandHideSettled ? 'Show all transactions' : 'Hide paid, refunded, and cancelled transactions'}
                />
                {grandHideSettled ? 'Show all transactions' : 'Hide paid/refunded/cancelled'}
              </label>
              <span className="text-xs font-medium text-slate-500">Borrower</span>
              <MultiSelect
                label="Borrower"
                options={grandBorrowers}
                selected={grandBorrowerSel}
                onChange={setGrandBorrowerSel}
                className="w-44"
              />
              <label htmlFor="grand-from" className="text-xs font-medium text-slate-500">
                Due Date
              </label>
              <input
                id="grand-from"
                type="date"
                value={grandFrom}
                onChange={(e) => setGrandFrom(e.target.value)}
                aria-label="Due date from"
                className={`${inputClass} !w-40`}
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                id="grand-to"
                type="date"
                value={grandTo}
                onChange={(e) => setGrandTo(e.target.value)}
                aria-label="Due date to"
                className={`${inputClass} !w-40`}
              />
              <span className="text-xs font-medium text-slate-500">Status</span>
              <MultiSelect
                label="Status"
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                selected={grandStatusSel}
                onChange={setGrandStatusSel}
                className="w-36"
              />
              {(grandFrom || grandTo || grandStatusSel.size > 0 || grandBorrowerSel.size > 0) && (
                <button
                  onClick={() => {
                    setGrandFrom('')
                    setGrandTo('')
                    setGrandStatusSel(new Set())
                    setGrandBorrowerSel(new Set())
                  }}
                  className="cursor-pointer text-xs font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
                >
                  Clear
                </button>
              )}
            </div>
          }
        />
        {grandRows.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No collections match"
            body="No transactions fall within the selected due-date range and status."
          />
        ) : (
          <div className="overflow-x-auto">
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
        )}
        {grandRows.length > 0 && pager(grandPag, 'records', [15, 25, 50, 100])}
      </Card>
    </>
  )
}
