import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import { Badge, Card, CardHeader, EmptyState, inputClass } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'

const allocBadge = {
  Settled: 'paid',
  Overpayment: 'refunded',
  Underpayment: 'past_due',
  Credited: 'active',
}
const ALLOC_STATUSES = ['Settled', 'Overpayment', 'Underpayment', 'Credited']

// Borrower view of their own Payment Logs — strictly read-only. RLS scopes the
// data to the signed-in borrower; we also filter by the effective session id so
// the admin "view as borrower" mode shows the right person's logs.
export default function PaymentLogs() {
  const { session, paymentLogs } = useApp()
  const myId = session.user.id

  const rows = useMemo(
    () =>
      paymentLogs
        .filter((l) => l.userId === myId && l.kind === 'payment')
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [paymentLogs, myId],
  )

  // Search / filter / sort.
  const [query, setQuery] = useState('')
  const [statusSel, setStatusSel] = useState('all')
  const [sortKey, setSortKey] = useState('date') // date | amount
  const [sortDir, setSortDir] = useState('desc')
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return rows
      .filter((l) => {
        if (statusSel !== 'all' && l.allocStatus !== statusSel) return false
        if (q) {
          const hay = `${l.subject ?? ''} ${l.reference ?? ''} ${l.method ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const cmp =
          sortKey === 'amount'
            ? (Number(a.amountOwed) || 0) - (Number(b.amountOwed) || 0)
            : String(a.txnDate || '').localeCompare(String(b.txnDate || ''))
        return (cmp || String(a.id).localeCompare(String(b.id))) * dir
      })
  }, [rows, query, statusSel, sortKey, sortDir])

  return (
    <>
      <PageHeader
        title="Payment Logs"
        subtitle="Acknowledgements of payments received, recorded by the administrator. Read-only."
      />
      <Card>
        <CardHeader
          title="My payment acknowledgements"
          subtitle={rows.length === visible.length ? `${rows.length} on record` : `${visible.length} of ${rows.length}`}
        />
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search subject, reference, method…"
              aria-label="Search payment logs"
              className={`${inputClass} sm:max-w-[16rem]`}
            />
            <select
              value={statusSel}
              onChange={(e) => setStatusSel(e.target.value)}
              aria-label="Filter by status"
              className={`${inputClass} sm:w-auto`}
            >
              <option value="all">All statuses</option>
              {ALLOC_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Sort</span>
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {[
                  ['date', 'Date'],
                  ['amount', 'Amount'],
                ].map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleSort(k)}
                    aria-pressed={sortKey === k}
                    className={`min-h-8 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                      sortKey === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sortKey === k ? `${t} ${sortDir === 'asc' ? '↑' : '↓'}` : t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState
            icon="scroll"
            title="No payment logs yet"
            body="When the administrator records a payment received from you, it will appear here."
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="scroll" title="No matching logs" body="Adjust the search, filter, or sort." />
        ) : (
          <>
          {/* Mobile: stacked cards so every value stays visible (no clipping). */}
          <div className="md:hidden">
            {visible.map((l) => (
              <div
                key={l.id}
                className={`border-b border-slate-100 px-3 py-3 ${l.consumed ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">
                      {l.subject}
                      {l.consumed && (
                        <span className="ml-1 text-[11px] font-normal italic text-slate-500">(applied)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {formatDate(l.txnDate)}
                      {l.method ? ` · ${l.method}` : ''}
                      {l.reference ? ` · Ref ${l.reference}` : ''}
                    </p>
                  </div>
                  <Badge status={allocBadge[l.allocStatus] ?? 'upcoming'}>{l.allocStatus}</Badge>
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-slate-500">
                  Owed <span className="font-mono text-slate-700">{formatPeso(l.amountOwed)}</span> · Applied{' '}
                  <span className="font-mono text-slate-700">{formatPeso(l.fundsApplied)}</span> · Remaining{' '}
                  <span className="font-mono font-semibold text-slate-900">{formatPeso(l.remainingBalance)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto px-1 py-2 md:block">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2 text-right">Amount Owed</th>
                  <th className="px-3 py-2 text-right">Funds Applied</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const isCarry = l.kind === 'carry'
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-slate-50 ${isCarry ? 'bg-slate-50/60 text-slate-500' : ''} ${l.consumed ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.txnDate)}</td>
                      <td className="px-3 py-2">{l.reference || '—'}</td>
                      <td className="px-3 py-2">
                        {l.subject}
                        {l.consumed && <span className="ml-1 text-xs italic">(applied)</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.method ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{isCarry ? '—' : formatPeso(l.amountOwed)}</td>
                      <td className="px-3 py-2 text-right font-mono">{isCarry ? '—' : formatPeso(l.fundsApplied)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatPeso(l.remainingBalance)}</td>
                      <td className="px-3 py-2">
                        <Badge status={allocBadge[l.allocStatus] ?? 'upcoming'}>{l.allocStatus}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </>
  )
}
