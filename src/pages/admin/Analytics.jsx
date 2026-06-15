import { useMemo } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useApp } from '../../context/AppContext'
import { Card, CardHeader } from '../../components/ui'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus, isReceivable } from '../../lib/transactions'

const STATUS_COLORS = {
  paid: '#10b981',
  unpaid: '#f59e0b',
  past_due: '#ef4444',
  refunded: '#0ea5e9',
  cancelled: '#94a3b8',
}

const peso = (v) => formatPeso(v)
const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-PH', {
    month: 'short',
    year: '2-digit',
  })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-semibold text-slate-900">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color ?? entry.payload?.fill }} />
          {entry.name}: <span className="font-mono font-medium text-slate-900">{peso(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

// Modern analytics view inside Reports & Logs. All figures derive from the
// shared ledger, so they stay in sync with Overall Transactions.
export default function Analytics() {
  const { transactions, users } = useApp()
  const today = toISODate(new Date())

  const kpis = useMemo(() => {
    const total = transactions.reduce((s, t) => s + t.amount, 0)
    const collected = transactions
      .filter((t) => t.status === 'paid')
      .reduce((s, t) => s + t.amount, 0)
    const outstanding = transactions
      .filter((t) => isReceivable(t, today))
      .reduce((s, t) => s + t.amount, 0)
    const overdue = transactions
      .filter((t) => effectiveStatus(t, today) === 'past_due')
      .reduce((s, t) => s + t.amount, 0)
    const collectionRate = total > 0 ? Math.round((collected / total) * 100) : 0
    return { total, collected, outstanding, overdue, collectionRate }
  }, [transactions, today])

  // Expected (by due month) vs collected (by paid month) over time.
  const monthly = useMemo(() => {
    const map = new Map()
    const bucket = (ym) => {
      if (!map.has(ym)) map.set(ym, { ym, expected: 0, collected: 0 })
      return map.get(ym)
    }
    transactions.forEach((t) => {
      bucket(t.dueDate.slice(0, 7)).expected += t.amount
      if (t.status === 'paid' && t.datePaid) bucket(t.datePaid.slice(0, 7)).collected += t.amount
    })
    return [...map.values()]
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map((m) => ({ ...m, month: monthLabel(m.ym) }))
  }, [transactions])

  const byStatus = useMemo(() => {
    const sums = {}
    transactions.forEach((t) => {
      const s = effectiveStatus(t, today)
      sums[s] = (sums[s] ?? 0) + t.amount
    })
    return Object.entries(sums).map(([status, value]) => ({
      name: STATUS_LABELS[status],
      status,
      value: Math.round(value * 100) / 100,
    }))
  }, [transactions, today])

  const aging = useMemo(() => {
    const buckets = [
      { name: 'Not yet due', amount: 0, fill: '#1e3a8a' },
      { name: '1–30 days late', amount: 0, fill: '#f59e0b' },
      { name: '31–60 days late', amount: 0, fill: '#f97316' },
      { name: '60+ days late', amount: 0, fill: '#ef4444' },
    ]
    const now = new Date(today)
    transactions.filter((t) => isReceivable(t, today)).forEach((t) => {
      const days = Math.floor((now - new Date(t.dueDate)) / 86400000)
      const i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3
      buckets[i].amount += t.amount
    })
    return buckets
  }, [transactions, today])

  const topBorrowers = useMemo(() => {
    const sums = {}
    transactions.filter((t) => isReceivable(t, today)).forEach((t) => {
      sums[t.userId] = (sums[t.userId] ?? 0) + t.amount
    })
    return Object.entries(sums)
      .map(([userId, amount]) => ({
        name: users.find((u) => u.id === userId)?.name ?? userId,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [transactions, users, today])

  const tiles = [
    { label: 'Total Portfolio', value: kpis.total, icon: 'wallet', accent: 'bg-navy-50 text-navy-800' },
    { label: 'Collected', value: kpis.collected, icon: 'check', accent: 'bg-emerald-50 text-emerald-600', hint: `${kpis.collectionRate}% collection rate` },
    { label: 'Outstanding', value: kpis.outstanding, icon: 'trendingUp', accent: 'bg-amber-50 text-gold-600' },
    { label: 'Overdue', value: kpis.overdue, icon: 'alert', accent: 'bg-red-50 text-red-600' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton />
      </div>
      {/* KPI tiles, staggered entrance */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile, i) => (
          <div
            key={tile.label}
            className="lp-rise rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-600">{tile.label}</p>
                <p className="mt-1.5 truncate font-mono text-2xl font-semibold text-slate-900">
                  {peso(tile.value)}
                </p>
                {tile.hint && <p className="mt-1 text-xs text-slate-500">{tile.hint}</p>}
              </div>
              <span className={`shrink-0 rounded-lg p-2.5 ${tile.accent}`}>
                <Icon name={tile.icon} className="h-5 w-5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="lp-rise xl:col-span-3" style={{ animationDelay: '120ms' }}>
          <CardHeader title="Collections Over Time" subtitle="Expected amortizations vs verified collections per month" />
          <div className="h-72 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradExpected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1e3a8a" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradCollected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="expected" name="Expected" stroke="#1e3a8a" strokeWidth={2} fill="url(#gradExpected)" animationDuration={700} animationEasing="ease-out" />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2} fill="url(#gradCollected)" animationDuration={700} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lp-rise xl:col-span-2" style={{ animationDelay: '180ms' }}>
          <CardHeader title="Portfolio by Status" subtitle="Ledger amounts by effective status" />
          <div className="h-72 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lp-rise xl:col-span-2" style={{ animationDelay: '240ms' }}>
          <CardHeader title="Receivables Aging" subtitle="How late the open balances are" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(30,58,138,0.05)' }} />
                <Bar dataKey="amount" name="Amount" radius={[6, 6, 0, 0]} animationDuration={700} animationEasing="ease-out">
                  {aging.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lp-rise xl:col-span-3" style={{ animationDelay: '300ms' }}>
          <CardHeader title="Top Borrowers by Outstanding" subtitle="Largest open balances" />
          <div className="h-64 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBorrowers} layout="vertical" margin={{ top: 12, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#0f172a' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(30,58,138,0.05)' }} />
                <Bar dataKey="amount" name="Outstanding" fill="#ca8a04" radius={[0, 6, 6, 0]} animationDuration={700} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}
