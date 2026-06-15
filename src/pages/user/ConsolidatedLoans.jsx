import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import BorrowerScheduleTable from '../../components/BorrowerScheduleTable'
import RefreshButton from '../../components/RefreshButton'
import { Card, CardHeader, EmptyState, MultiSelect } from '../../components/ui'
import { usePersistedState } from '../../hooks/usePersistedState'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { BORROWER_STATUS_LABELS, borrowerStatus, isReceivable } from '../../lib/transactions'

const FILTERABLE_STATUSES = ['paid', 'upcoming', 'due', 'past_due', 'refunded', 'cancelled']

// Consolidated Loans: every installment across all of the borrower's loans in
// one amortization grid, with multi-select filters and date sorting. No
// disclosure statement — per-loan disclosures live on each loan's detail page.
export default function ConsolidatedLoans() {
  const { session, transactions } = useApp()
  const today = toISODate(new Date())
  // Multi-select filters: empty set = all. Survive navigation (reset on Refresh).
  const [statusSel, setStatusSel] = usePersistedState('consolidated.statusSel', () => new Set())
  const [dueDateSel, setDueDateSel] = usePersistedState('consolidated.dueDateSel', () => new Set())
  // Sorting applies after filtering, so it works on any filtered view.
  const [sortKey, setSortKey] = usePersistedState('consolidated.sortKey', 'dueDate') // dueDate | txnDate
  const [sortDir, setSortDir] = usePersistedState('consolidated.sortDir', 'asc')

  const myTxns = useMemo(
    () => transactions.filter((t) => t.userId === session.user.id),
    [transactions, session.user.id],
  )

  const dueDateOptions = useMemo(
    () =>
      [...new Set(myTxns.map((t) => t.dueDate))]
        .sort()
        .map((d) => ({ value: d, label: formatDate(d) })),
    [myTxns],
  )

  const filtered = useMemo(
    () =>
      myTxns
        .filter(
          (t) =>
            (statusSel.size === 0 || statusSel.has(borrowerStatus(t, today))) &&
            (dueDateSel.size === 0 || dueDateSel.has(t.dueDate)),
        )
        .sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1
          return (
            (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '') * dir || a.id.localeCompare(b.id)
          )
        }),
    [myTxns, statusSel, dueDateSel, sortKey, sortDir, today],
  )
  const outstanding = filtered.filter((t) => isReceivable(t, today)).reduce((s, t) => s + t.amount, 0)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const sortLabel = (key, text) =>
    sortKey === key ? `${text} ${sortDir === 'asc' ? '↑' : '↓'}` : text

  return (
    <>
      <Link
        to="/portal"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
      >
        ← Back to dashboard
      </Link>
      <PageHeader
        title="Consolidated Transactions"
        subtitle="Every installment and straight transaction combined into a single view."
        action={<RefreshButton />}
      />

      <Card>
        <CardHeader
          title="Consolidated Transactions Table"
          subtitle={`${filtered.length} items · outstanding ${formatPeso(outstanding)}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Status</span>
              <MultiSelect
                label="Status"
                options={FILTERABLE_STATUSES.map((s) => ({ value: s, label: BORROWER_STATUS_LABELS[s] }))}
                selected={statusSel}
                onChange={setStatusSel}
                className="w-36"
              />
              <span className="text-xs font-medium text-slate-500">Due Date</span>
              <MultiSelect
                label="Due Date"
                options={dueDateOptions}
                selected={dueDateSel}
                onChange={setDueDateSel}
                className="w-40"
              />
              <span className="ml-2 text-xs font-medium text-slate-500">Sort by</span>
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {[
                  ['dueDate', 'Due Date'],
                  ['txnDate', 'Txn Date'],
                ].map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSort(key)}
                    aria-pressed={sortKey === key}
                    className={`min-h-8 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] ${
                      sortKey === key
                        ? 'bg-navy-800 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sortLabel(key, text)}
                  </button>
                ))}
              </div>
              {(statusSel.size > 0 || dueDateSel.size > 0) && (
                <button
                  onClick={() => {
                    setStatusSel(new Set())
                    setDueDateSel(new Set())
                  }}
                  className="cursor-pointer text-xs font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
                >
                  Clear
                </button>
              )}
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No installments found"
            body={
              statusSel.size > 0 || dueDateSel.size > 0
                ? 'No payments match the selected filters.'
                : 'You have no loan schedules yet.'
            }
          />
        ) : (
          <BorrowerScheduleTable transactions={filtered} showTxnDate />
        )}
      </Card>
    </>
  )
}
