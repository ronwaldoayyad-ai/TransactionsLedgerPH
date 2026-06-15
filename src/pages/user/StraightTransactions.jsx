import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import BorrowerScheduleTable from '../../components/BorrowerScheduleTable'
import RefreshButton from '../../components/RefreshButton'
import { Card, CardHeader, EmptyState, MultiSelect } from '../../components/ui'
import { usePersistedState } from '../../hooks/usePersistedState'
import { formatPeso, toISODate } from '../../lib/amortization'
import { BORROWER_STATUS_LABELS, borrowerStatus, isReceivable } from '../../lib/transactions'

const FILTERABLE_STATUSES = ['paid', 'upcoming', 'due', 'past_due', 'refunded', 'cancelled']

// Straight transactions are one-time purchases settled in a single payment —
// they have no loan or disclosure statement, so they get their own view
// instead of appearing under My Loan Schedules.
export default function StraightTransactions() {
  const { session, transactions } = useApp()
  const today = toISODate(new Date())
  const [statusSel, setStatusSel] = usePersistedState('straight.statusSel', () => new Set())
  const [sortKey, setSortKey] = usePersistedState('straight.sortKey', 'dueDate') // dueDate | txnDate
  const [sortDir, setSortDir] = usePersistedState('straight.sortDir', 'asc')

  const myStraight = useMemo(
    () =>
      transactions.filter((t) => t.userId === session.user.id && t.type === 'Straight'),
    [transactions, session.user.id],
  )

  const filtered = useMemo(
    () =>
      myStraight
        .filter((t) => statusSel.size === 0 || statusSel.has(borrowerStatus(t, today)))
        .sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1
          return (
            (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '') * dir || a.id.localeCompare(b.id)
          )
        }),
    [myStraight, statusSel, sortKey, sortDir, today],
  )
  const outstanding = filtered
    .filter((t) => isReceivable(t, today))
    .reduce((s, t) => s + t.amount, 0)

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
      <PageHeader
        title="Straight Transactions"
        subtitle="One-time purchases settled in a single payment — no loan or disclosure statement."
        action={<RefreshButton />}
      />

      <Card>
        <CardHeader
          title="My Straight Transactions"
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
                      sortKey === key ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sortLabel(key, text)}
                  </button>
                ))}
              </div>
            </div>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon="wallet"
            title="No straight transactions"
            body={
              statusSel.size > 0
                ? 'No items match the selected filters.'
                : 'One-time purchases assigned by your administrator will appear here.'
            }
          />
        ) : (
          <BorrowerScheduleTable transactions={filtered} showTxnDate />
        )}
      </Card>
    </>
  )
}
