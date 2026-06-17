import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import { Badge, Card, CardHeader, EmptyState } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'

const allocBadge = { Settled: 'paid', Overpayment: 'refunded', Underpayment: 'past_due' }

// Borrower view of their own Payment Logs — strictly read-only. RLS scopes the
// data to the signed-in borrower; we also filter by the effective session id so
// the admin "view as borrower" mode shows the right person's logs.
export default function PaymentLogs() {
  const { session, paymentLogs } = useApp()
  const myId = session.user.id

  const rows = useMemo(
    () =>
      paymentLogs
        .filter((l) => l.userId === myId)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [paymentLogs, myId],
  )

  return (
    <>
      <PageHeader
        title="Payment Logs"
        subtitle="Acknowledgements of payments received, recorded by the administrator. Read-only."
      />
      <Card>
        <CardHeader title="My payment acknowledgements" subtitle={`${rows.filter((r) => r.kind === 'payment').length} on record`} />
        {rows.length === 0 ? (
          <EmptyState
            icon="scroll"
            title="No payment logs yet"
            body="When the administrator records a payment received from you, it will appear here."
          />
        ) : (
          <div className="overflow-x-auto px-1 py-2">
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
                {rows.map((l) => {
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
        )}
      </Card>
    </>
  )
}
