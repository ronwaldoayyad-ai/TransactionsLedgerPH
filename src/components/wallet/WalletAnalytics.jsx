import { useMemo } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, EmptyState } from '../ui'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { accountTotals, billState, groupDeducted } from '../../lib/wallet'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
const monthKey = (iso) => (iso ? iso.slice(0, 7) : '')
const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
}

const DONUT = [
  { key: 'paid', name: 'Paid', color: '#10b981' },
  { key: 'partial', name: 'Partial', color: '#f59e0b' },
  { key: 'pending', name: 'Pending', color: '#3b82f6' },
  { key: 'past_due', name: 'Past Due', color: '#ef4444' },
]

export default function WalletAnalytics({ cards, accounts, bills, payments }) {
  const today = toISODate(new Date())
  const cardOf = (id) => cards.find((c) => c.id === id)
  const cardLabel = (id) => {
    const c = cardOf(id)
    return c ? `${c.bankName} •••• ${c.last4}` : 'Card'
  }

  const states = useMemo(() => bills.map((b) => ({ bill: b, ...billState(b, payments, today) })), [bills, payments, today])

  const totalBilled = round2(bills.reduce((s, b) => s + b.amountDue, 0))
  const totalPaid = round2(payments.reduce((s, p) => s + p.amount, 0))
  const remaining = round2(Math.max(0, totalBilled - totalPaid))
  const progress = totalBilled > 0 ? Math.min(100, (totalPaid / totalBilled) * 100) : 0

  const counts = useMemo(() => {
    const c = { paid: 0, partial: 0, pending: 0, past_due: 0 }
    states.forEach((s) => {
      if (s.status === 'paid') c.paid += 1
      else if (s.partial) c.partial += 1
      else if (s.status === 'past_due') c.past_due += 1
      else c.pending += 1
    })
    return c
  }, [states])
  const donutData = DONUT.map((d) => ({ ...d, value: counts[d.key] })).filter((d) => d.value > 0)

  const months = useMemo(() => {
    const groups = {}
    payments.forEach((p) => {
      const k = monthKey(p.paidOn)
      ;(groups[k] = groups[k] ?? []).push(p)
    })
    return Object.entries(groups)
      .map(([k, ps]) => ({ key: k, total: round2(ps.reduce((s, p) => s + p.amount, 0)), items: ps }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [payments])
  const maxMonth = Math.max(1, ...months.map((m) => m.total))

  const debtByCard = useMemo(() => {
    const m = {}
    states.forEach((s) => {
      if (s.remaining > 0) m[s.bill.cardId] = round2((m[s.bill.cardId] ?? 0) + s.remaining)
    })
    return Object.entries(m)
      .map(([cardId, amount]) => ({ cardId, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [states])
  const maxDebt = Math.max(1, ...debtByCard.map((d) => d.amount))

  // Accounts analytics: totals + account-sourced deductions grouped 3 ways.
  const accTotals = useMemo(() => accountTotals(accounts, payments), [accounts, payments])
  const dedByAccount = useMemo(() => groupDeducted(payments, accounts, 'account'), [payments, accounts])
  const dedByBank = useMemo(() => groupDeducted(payments, accounts, 'bank'), [payments, accounts])
  const dedByMonth = useMemo(() => groupDeducted(payments, accounts, 'month'), [payments, accounts])

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Payment progress (FR3.2) */}
        <Card>
          <CardHeader title="Payment Progress" />
          <div className="space-y-3 px-5 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-600">Total Billed</span>
              <span className="font-mono font-semibold text-slate-900">{formatPeso(totalBilled)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-emerald-700">Total Paid</span>
              <span className="font-mono font-semibold text-emerald-700">{formatPeso(totalPaid)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-red-600">Remaining Balance</span>
              <span className="font-mono font-semibold text-red-600">{formatPeso(remaining)}</span>
            </div>
          </div>
        </Card>

        {/* Bill status breakdown donut (FR3.3) */}
        <Card>
          <CardHeader title="Bill Status Breakdown" />
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="relative h-[170px] w-[170px] shrink-0">
              {donutData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">No bills</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none">
                        {donutData.map((d) => <Cell key={d.key} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bills</span>
                    <span className="font-mono text-xl font-bold text-slate-900">{bills.length}</span>
                  </div>
                </>
              )}
            </div>
            <ul className="space-y-2 text-sm">
              {DONUT.map((d) => (
                <li key={d.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                  <span className="text-slate-600">{d.name}</span>
                  <span className="ml-auto font-semibold text-slate-900">{counts[d.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Monthly payment history (FR3.4) */}
      <Card>
        <CardHeader title="Monthly Payment History" />
        {months.length === 0 ? (
          <EmptyState icon="clock" title="No payments logged yet" />
        ) : (
          <div className="space-y-4 px-5 py-4">
            {months.map((m) => (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">{monthLabel(m.key)}</span>
                  <span className="font-mono font-semibold text-emerald-700">{formatPeso(m.total)}</span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${(m.total / maxMonth) * 100}%` }} />
                </div>
                {m.items
                  .sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)))
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-sm">
                      <span className="text-slate-600">
                        {cardLabel(p.billId ? bills.find((b) => b.id === p.billId)?.cardId : null)}{' '}
                        <span className="text-xs text-slate-400">({formatDate(p.paidOn)})</span>
                      </span>
                      <span className="font-mono font-semibold text-slate-900">{formatPeso(p.amount)}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Outstanding debt by card (FR3.5) */}
      <Card>
        <CardHeader title="Outstanding Debt by Card" />
        {debtByCard.length === 0 ? (
          <EmptyState icon="check" title="No outstanding bill balances" />
        ) : (
          <div className="space-y-3 px-5 py-4">
            {debtByCard.map((d) => {
              const card = cardOf(d.cardId)
              return (
                <div key={d.cardId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{cardLabel(d.cardId)}</span>
                    <span className="font-mono font-semibold text-slate-900">{formatPeso(d.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-2 rounded-full" style={{ width: `${(d.amount / maxDebt) * 100}%`, background: card?.primaryColor ?? '#1e3a8a' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Accounts summary + account-sourced deductions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[13px] text-slate-500">Total Accounts</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-900">{accTotals.count}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[13px] text-slate-500">Total Available Balance</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">{formatPeso(accTotals.available)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-[13px] text-slate-500">Total Deducted</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-red-600">{formatPeso(accTotals.deducted)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <DeductionGroup title="Deducted by Account" groups={dedByAccount} />
        <DeductionGroup title="Deducted by Bank" groups={dedByBank} />
        <DeductionGroup title="Deducted by Month" groups={dedByMonth} labelFmt={monthLabel} />
      </div>
    </div>
  )
}

// A grouped horizontal-bar list of account-sourced deduction amounts.
function DeductionGroup({ title, groups, labelFmt }) {
  const max = Math.max(1, ...groups.map((g) => g.amount))
  return (
    <Card>
      <CardHeader title={title} />
      {groups.length === 0 ? (
        <EmptyState icon="wallet" title="No deductions yet" />
      ) : (
        <div className="space-y-3 px-5 py-4">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-slate-700">{labelFmt ? labelFmt(g.label) : g.label}</span>
                <span className="shrink-0 font-mono font-semibold text-slate-900">{formatPeso(g.amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-red-400" style={{ width: `${(g.amount / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
