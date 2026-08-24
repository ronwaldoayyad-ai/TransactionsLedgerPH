import { useMemo } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertCircle, Check, TrendingUp, Wallet } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus, isReceivable } from '../../lib/transactions'
import StatTile from '../../components/ui/StatTile'
import FadeInView from '../../components/ui/FadeInView'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const STATUS_COLORS: Record<string, string> = {
  paid: '#10b981',
  unpaid: '#f59e0b',
  past_due: '#ef4444',
  refunded: '#0ea5e9',
  cancelled: '#94a3b8',
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' })
}

// Horizontal proportional bar (View-based; recharts has no RN build).
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
      <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }} className="h-full rounded-full" />
    </View>
  )
}

export default function AdminAnalytics() {
  const { transactions, users, refreshing, refreshData } = useApp()
  const today = toISODate(new Date())

  const kpis = useMemo(() => {
    const total = transactions.reduce((s: number, t: any) => s + t.amount, 0)
    const collected = transactions.filter((t: any) => t.status === 'paid').reduce((s: number, t: any) => s + t.amount, 0)
    const outstanding = transactions.filter((t: any) => isReceivable(t, today)).reduce((s: number, t: any) => s + t.amount, 0)
    const overdue = transactions.filter((t: any) => effectiveStatus(t, today) === 'past_due').reduce((s: number, t: any) => s + t.amount, 0)
    const collectionRate = total > 0 ? Math.round((collected / total) * 100) : 0
    return { total, collected, outstanding, overdue, collectionRate }
  }, [transactions, today])

  const monthly = useMemo(() => {
    const map = new Map<string, any>()
    const bucket = (ym: string) => {
      if (!map.has(ym)) map.set(ym, { ym, expected: 0, collected: 0 })
      return map.get(ym)
    }
    transactions.forEach((t: any) => {
      bucket(t.dueDate.slice(0, 7)).expected += t.amount
      if (t.status === 'paid' && t.datePaid) bucket(t.datePaid.slice(0, 7)).collected += t.amount
    })
    return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym)).slice(-8).map((m) => ({ ...m, month: monthLabel(m.ym) }))
  }, [transactions])
  const monthlyMax = Math.max(1, ...monthly.map((m: any) => Math.max(m.expected, m.collected)))

  const byStatus = useMemo(() => {
    const sums: Record<string, number> = {}
    transactions.forEach((t: any) => {
      const s = effectiveStatus(t, today)
      sums[s] = (sums[s] ?? 0) + t.amount
    })
    return Object.entries(sums).map(([status, value]) => ({ status, name: STATUS_LABELS[status], value }))
  }, [transactions, today])
  const statusTotal = Math.max(1, byStatus.reduce((s, x) => s + x.value, 0))

  const aging = useMemo(() => {
    const buckets = [
      { name: 'Not yet due', amount: 0, fill: '#1e3a8a' },
      { name: '1–30 days late', amount: 0, fill: '#f59e0b' },
      { name: '31–60 days late', amount: 0, fill: '#f97316' },
      { name: '60+ days late', amount: 0, fill: '#ef4444' },
    ]
    const now = new Date(today).getTime()
    transactions.filter((t: any) => isReceivable(t, today)).forEach((t: any) => {
      const days = Math.floor((now - new Date(t.dueDate).getTime()) / 86400000)
      const i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : 3
      buckets[i].amount += t.amount
    })
    return buckets
  }, [transactions, today])
  const agingMax = Math.max(1, ...aging.map((b) => b.amount))

  const topBorrowers = useMemo(() => {
    const sums: Record<string, number> = {}
    transactions.filter((t: any) => isReceivable(t, today)).forEach((t: any) => {
      sums[t.userId] = (sums[t.userId] ?? 0) + t.amount
    })
    return Object.entries(sums)
      .map(([userId, amount]) => ({ name: users.find((u: any) => u.id === userId)?.name ?? userId, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [transactions, users, today])
  const topMax = Math.max(1, ...topBorrowers.map((b) => b.amount))

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Analytics</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">Portfolio health derived from the shared ledger.</Text>
        </FadeInView>

        {/* KPI tiles */}
        <FadeInView delay={60} className="flex-row flex-wrap justify-between gap-y-3">
          <View className="w-[48.7%]">
            <StatTile icon={<Wallet size={18} color={colors.navy800} />} accentBg="bg-navy-50" label="Total Portfolio" value={formatPeso(kpis.total)} />
          </View>
          <View className="w-[48.7%]">
            <StatTile icon={<Check size={18} color="#059669" />} accentBg="bg-emerald-50" label="Collected" value={formatPeso(kpis.collected)} hint={`${kpis.collectionRate}% collection rate`} />
          </View>
          <View className="w-[48.7%]">
            <StatTile icon={<TrendingUp size={18} color={colors.gold600} />} accentBg="bg-amber-50" label="Outstanding" value={formatPeso(kpis.outstanding)} />
          </View>
          <View className="w-[48.7%]">
            <StatTile icon={<AlertCircle size={18} color="#dc2626" />} accentBg="bg-red-50" label="Overdue" value={formatPeso(kpis.overdue)} />
          </View>
        </FadeInView>

        {/* Collections over time */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Collections Over Time" subtitle="Expected vs collected per month" />
            <View className="gap-3 px-4 py-4">
              {monthly.length === 0 ? (
                <Text className="font-sans text-sm text-slate-400">No data yet.</Text>
              ) : (
                monthly.map((m: any) => (
                  <View key={m.ym} className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans-medium text-xs text-slate-600">{m.month}</Text>
                      <Text className="font-mono text-[11px] text-slate-500">{formatPeso(m.collected)} / {formatPeso(m.expected)}</Text>
                    </View>
                    <Bar pct={(m.expected / monthlyMax) * 100} color={colors.navy800} />
                    <Bar pct={(m.collected / monthlyMax) * 100} color="#10b981" />
                  </View>
                ))
              )}
              <View className="mt-1 flex-row gap-4">
                <Legend color={colors.navy800} label="Expected" />
                <Legend color="#10b981" label="Collected" />
              </View>
            </View>
          </Card>
        </FadeInView>

        {/* Portfolio by status */}
        <FadeInView delay={140}>
          <Card>
            <CardHeader title="Portfolio by Status" subtitle="Ledger amounts by effective status" />
            <View className="gap-2.5 px-4 py-4">
              <View className="h-3 flex-row overflow-hidden rounded-full bg-slate-100">
                {byStatus.map((s) => (
                  <View key={s.status} style={{ width: `${(s.value / statusTotal) * 100}%`, backgroundColor: STATUS_COLORS[s.status] ?? '#94a3b8' }} />
                ))}
              </View>
              {byStatus.map((s) => (
                <View key={s.status} className="flex-row items-center justify-between">
                  <Legend color={STATUS_COLORS[s.status] ?? '#94a3b8'} label={s.name} />
                  <Text className="font-mono text-sm text-slate-800">{formatPeso(s.value)}</Text>
                </View>
              ))}
            </View>
          </Card>
        </FadeInView>

        {/* Aging */}
        <FadeInView delay={180}>
          <Card>
            <CardHeader title="Receivables Aging" subtitle="How late the open balances are" />
            <View className="gap-3 px-4 py-4">
              {aging.map((b) => (
                <View key={b.name} className="gap-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sans-medium text-xs text-slate-600">{b.name}</Text>
                    <Text className="font-mono text-[11px] text-slate-500">{formatPeso(b.amount)}</Text>
                  </View>
                  <Bar pct={(b.amount / agingMax) * 100} color={b.fill} />
                </View>
              ))}
            </View>
          </Card>
        </FadeInView>

        {/* Top borrowers */}
        <FadeInView delay={220}>
          <Card>
            <CardHeader title="Top Borrowers by Outstanding" subtitle="Largest open balances" />
            <View className="gap-3 px-4 py-4">
              {topBorrowers.length === 0 ? (
                <Text className="font-sans text-sm text-slate-400">Nothing outstanding.</Text>
              ) : (
                topBorrowers.map((b) => (
                  <View key={b.name} className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-sans-medium text-xs text-slate-700" numberOfLines={1}>{b.name}</Text>
                      <Text className="font-mono text-[11px] text-slate-500">{formatPeso(b.amount)}</Text>
                    </View>
                    <Bar pct={(b.amount / topMax) * 100} color={colors.gold500} />
                  </View>
                ))
              )}
            </View>
          </Card>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ backgroundColor: color }} className="h-2.5 w-2.5 rounded-full" />
      <Text className="font-sans text-xs text-slate-600">{label}</Text>
    </View>
  )
}
