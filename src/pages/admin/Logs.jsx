import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import { Badge, Button, Card, CardHeader, EmptyState, Modal, inputClass } from '../../components/ui'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import { downloadCSV, formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS } from '../../lib/transactions'
import Analytics from './Analytics'

const actionStyles = {
  INVITE_SENT: 'bg-sky-50 text-sky-700',
  PAYMENT_SUBMITTED: 'bg-amber-50 text-amber-700',
  PAYMENT_APPROVED: 'bg-emerald-50 text-emerald-700',
  PAYMENT_REJECTED: 'bg-red-50 text-red-700',
  LOAN_ASSIGNED: 'bg-navy-50 text-navy-800',
  USER_UPDATED: 'bg-slate-100 text-slate-600',
  USER_DELETED: 'bg-red-50 text-red-700',
}

// Audit trail with filtering and CSV export, plus the Archives of deleted
// Overall Transactions records.
export default function Logs() {
  const {
    auditLog, archivedTransactions, restoreTransactions, users,
    purgeArchivedTransactions, purgeAuditEntries,
  } = useApp()
  const [tab, setTab] = useState('analytics') // analytics | audit | archives
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')
  const [selected, setSelected] = useState(() => new Set()) // ids in the active tab
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purging, setPurging] = useState(false)

  const nameOf = (userId) => users.find((u) => u.id === userId)?.name ?? userId

  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = (visibleIds) =>
    setSelected((prev) => {
      const all = visibleIds.every((id) => prev.has(id)) && visibleIds.length > 0
      const next = new Set(prev)
      if (all) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })

  const switchTab = (value) => {
    setTab(value)
    setSelected(new Set())
  }

  const handlePurge = async () => {
    setPurging(true)
    const ids = [...selected]
    const ok =
      tab === 'archives' ? await purgeArchivedTransactions(ids) : await purgeAuditEntries(ids)
    setPurging(false)
    setConfirmPurge(false)
    if (ok) setSelected(new Set())
  }

  const actions = [...new Set(auditLog.map((e) => e.action))]
  const list = auditLog.filter(
    (e) =>
      (action === 'all' || e.action === action) &&
      (query === '' ||
        `${e.actor} ${e.detail}`.toLowerCase().includes(query.toLowerCase())),
  )
  const auditPag = usePagination(list, 15)

  const exportCSV = () => {
    if (tab === 'archives') {
      const header = 'Archived On,Borrower,Item Description,Amount,Txn Date,Due Date,Date Paid,Status'
      const rows = archivedTransactions.map(
        (t) =>
          `${t.archivedAt},"${nameOf(t.userId)}","${t.description}",${t.amount.toFixed(2)},${t.txnDate},${t.dueDate},${t.datePaid ?? ''},${STATUS_LABELS[t.status]}`,
      )
      downloadCSV(`archives-${toISODate(new Date())}.csv`, [header, ...rows].join('\n'))
      return
    }
    const header = 'Timestamp,Actor,Action,Detail'
    const rows = list.map(
      (e) => `"${e.at}","${e.actor}","${e.action}","${e.detail.replaceAll('"', '""')}"`,
    )
    downloadCSV(`audit-log-${toISODate(new Date())}.csv`, [header, ...rows].join('\n'))
  }

  const exportDisabled =
    tab === 'analytics' ? true : tab === 'audit' ? list.length === 0 : archivedTransactions.length === 0

  return (
    <>
      <PageHeader
        title="Reports & Logs"
        subtitle="Full audit trail of system activity, plus archived ledger records."
        action={
          <Button variant="gold" onClick={exportCSV} disabled={exportDisabled}>
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Reports sections">
        {[
          ['analytics', 'Analytics'],
          ['audit', 'Audit Trail'],
          ['archives', `Archives (${archivedTransactions.length})`],
        ].map(([value, tabLabel]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => switchTab(value)}
            className={`min-h-10 cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200 ${
              tab === value
                ? 'bg-navy-800 text-white'
                : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {/* Bulk purge bar (both tabs) */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-900">
            {selected.size} item{selected.size === 1 ? '' : 's'} selected
          </p>
          <Button variant="danger" className="!min-h-9 !px-3" onClick={() => setConfirmPurge(true)}>
            <Icon name="trash" className="h-4 w-4" />
            Delete permanently
          </Button>
        </div>
      )}

      {tab === 'analytics' ? (
        <Analytics />
      ) : tab === 'archives' ? (
        <Card>
          <CardHeader
            title="Archived Transactions"
            subtitle="Ledger records deleted from Overall Transactions. Restore puts them back; permanent deletion also removes them from the database."
          />
          {archivedTransactions.length === 0 ? (
            <EmptyState
              icon="trash"
              title="Archive is empty"
              body="Records deleted from Overall Transactions will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={
                          archivedTransactions.length > 0 &&
                          archivedTransactions.every((t) => selected.has(t.id))
                        }
                        onChange={() => toggleAll(archivedTransactions.map((t) => t.id))}
                        aria-label="Select all archived transactions"
                        className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                      />
                    </th>
                    <th scope="col" className="px-5 py-3">Archived On</th>
                    <th scope="col" className="px-5 py-3">Borrower</th>
                    <th scope="col" className="px-5 py-3">Item Description</th>
                    <th scope="col" className="px-5 py-3 text-right">Amount</th>
                    <th scope="col" className="px-5 py-3">Due Date</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-slate-100 transition-colors duration-150 hover:bg-navy-50/40 ${
                        selected.has(t.id) ? 'bg-red-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          aria-label={`Select archived ${t.description}`}
                          className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                        />
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(t.archivedAt)}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{nameOf(t.userId)}</td>
                      <td className="px-5 py-3 text-slate-700">
                        {t.description}
                        <span className="ml-1.5 font-mono text-xs text-slate-400">{t.loanId}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-900">
                        {formatPeso(t.amount)}
                      </td>
                      <td className="px-5 py-3 text-slate-700">{formatDate(t.dueDate)}</td>
                      <td className="px-5 py-3">
                        <Badge status={t.status}>{STATUS_LABELS[t.status]}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="secondary"
                          className="!min-h-8 !px-2.5 !text-xs"
                          onClick={() => restoreTransactions([t.id])}
                        >
                          Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
      <Card>
        <CardHeader
          title="Audit Trail"
          subtitle={`${list.length} entries`}
          action={
            <div className="flex flex-wrap gap-3">
              <label htmlFor="log-search" className="sr-only">
                Search log entries
              </label>
              <input
                id="log-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search actor or detail…"
                className={`${inputClass} !w-56`}
              />
              <label htmlFor="log-action" className="sr-only">
                Filter by action type
              </label>
              <select
                id="log-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className={`${inputClass} !w-48`}
              >
                <option value="all">All actions</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        {list.length === 0 ? (
          <EmptyState icon="scroll" title="No matching entries" body="Adjust your search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={list.length > 0 && list.every((e) => selected.has(e.id))}
                      onChange={() => toggleAll(list.map((e) => e.id))}
                      aria-label="Select all visible audit entries"
                      className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                    />
                  </th>
                  <th scope="col" className="px-5 py-3">Timestamp</th>
                  <th scope="col" className="px-5 py-3">Actor</th>
                  <th scope="col" className="px-5 py-3">Action</th>
                  <th scope="col" className="px-5 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {auditPag.pageItems.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-slate-100 transition-colors duration-150 hover:bg-navy-50/40 ${
                      selected.has(e.id) ? 'bg-red-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggleOne(e.id)}
                        aria-label={`Select audit entry ${e.id}`}
                        className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-500">{e.at}</td>
                    <td className="px-5 py-3 text-slate-700">{e.actor}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-1 font-mono text-[11px] font-medium ${actionStyles[e.action] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <Pagination
            page={auditPag.page}
            pageCount={auditPag.pageCount}
            pageSize={auditPag.pageSize}
            total={auditPag.total}
            start={auditPag.start}
            end={auditPag.end}
            onPageChange={auditPag.setPage}
            onPageSizeChange={auditPag.setPageSize}
            itemLabel="entries"
          />
        )}
      </Card>
      )}

      {/* Permanent delete confirmation */}
      <Modal
        open={confirmPurge}
        title="Delete permanently"
        onClose={() => setConfirmPurge(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmPurge(false)} disabled={purging}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handlePurge} disabled={purging}>
              <Icon name="trash" className="h-4 w-4" />
              {purging ? 'Deleting…' : `Delete ${selected.size} item${selected.size === 1 ? '' : 's'}`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You are about to permanently delete{' '}
          <span className="font-semibold text-slate-900">
            {selected.size} {tab === 'archives' ? 'archived ledger record' : 'audit entr'}
            {tab === 'archives' ? (selected.size === 1 ? '' : 's') : selected.size === 1 ? 'y' : 'ies'}
          </span>
          . This also removes the same data from the Supabase database and{' '}
          <span className="font-semibold">cannot be undone</span>.
        </p>
      </Modal>
    </>
  )
}
