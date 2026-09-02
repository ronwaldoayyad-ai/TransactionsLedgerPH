import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  BarChart3,
  Calculator as CalcIcon,
  List,
  ScrollText,
  TrendingUp,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { usePersistedState } from '../../hooks/usePersistedState'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus, isReceivable } from '../../lib/transactions'
import StatTile from '../../components/ui/StatTile'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import PressableScale from '../../components/ui/PressableScale'
import FadeInView from '../../components/ui/FadeInView'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import Donut from '../../components/ui/Donut'
import Pager from '../../components/ui/Pager'
import { usePagination } from '../../hooks/usePagination'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const sum = (txns: any[]) => txns.reduce((s, t) => s + t.amount, 0)

const STATUS_COLORS: Record<string, string> = {
  paid: '#10b981',
  unpaid: '#f59e0b',
  past_due: '#ef4444',
  refunded: '#0ea5e9',
  cancelled: '#94a3b8',
}

// Distinct palette so a borrower keeps one colour across the Grand-View pies.
const BORROWER_COLORS = [
  '#1e3a8a', '#ca8a04', '#10b981', '#ef4444', '#0ea5e9',
  '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#64748b',
]

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })
}

// Admin Command Center — port of web AdminDashboard.jsx, at feature parity:
// status donut + borrower filter pills, borrower bar chart, due-date exclusion
// list + single-date filter, and the Grand View past/current/next pies.
export default function AdminOverview() {
  const { session, users, loans, payments, transactions, auditLog, dataLoading, refreshing, refreshData } =
    useApp()
  const router = useRouter()
  const today = toISODate(new Date())
  const [grandHideSettled, setGrandHideSettled] = useState(true)

  const activeBorrowers = users.filter((u: any) => u.role === 'user' && u.status === 'active').length
  const loansWithLedger = loans.filter((l: any) => transactions.some((t: any) => t.loanId === l.id))
  const totalDisbursed = loansWithLedger.reduce((s: number, l: any) => s + (l.disclosure?.netProceeds ?? 0), 0)

  const receivables = useMemo(
    () => transactions.filter((t: any) => isReceivable(t, today)),
    [transactions, today],
  )
  const outstanding = sum(receivables)

  const straightTxns = transactions.filter((t: any) => t.type === 'Straight')
  const installmentTxns = transactions.filter((t: any) => t.type === 'Installment')
  const straightTotal = sum(straightTxns)
  const installmentTotal = sum(installmentTxns)
  const grandTotal = straightTotal + installmentTotal
  const totalInterest = loansWithLedger.reduce(
    (s: number, l: any) => s + (l.disclosure?.schedule?.totals?.interest ?? 0),
    0,
  )
  const totalFees = loans
    .filter((l: any) => l.txnType !== 'straight' && transactions.some((t: any) => t.loanId === l.id))
    .reduce(
      (s: number, l: any) =>
        s + (Number(l.dst) || 0) + (Number(l.processingFee) || 0) + (Number(l.notarialFee) || 0),
      0,
    )

  const nameOf = (userId: string) => users.find((u: any) => u.id === userId)?.name ?? userId

  // --- Receivables by Status: borrower filter pills feeding a donut. ---
  const [statusBorrowerSel, setStatusBorrowerSel] = useState<Set<string>>(() => new Set())
  const toggleStatusBorrower = (id: string) =>
    setStatusBorrowerSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const statusBorrowerOptions = useMemo(() => {
    const ids = new Set(transactions.map((t: any) => t.userId))
    return users
      .filter((u: any) => ids.has(u.id))
      .map((u: any) => ({ id: u.id, name: u.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
  }, [transactions, users])

  const byStatus = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {}
    transactions.forEach((t: any) => {
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

  const statusReceivablesTotal = useMemo(
    () =>
      receivables
        .filter((t: any) => statusBorrowerSel.size === 0 || statusBorrowerSel.has(t.userId))
        .reduce((s: number, t: any) => s + t.amount, 0),
    [receivables, statusBorrowerSel],
  )

  // --- Receivables by Borrower: horizontal bars (top 10). ---
  const byBorrower = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {}
    receivables.forEach((t: any) => {
      groups[t.userId] = groups[t.userId] ?? { count: 0, amount: 0 }
      groups[t.userId].count += 1
      groups[t.userId].amount += t.amount
    })
    return Object.entries(groups)
      .map(([userId, g]) => ({ userId, ...g }))
      .sort((a, b) => b.amount - a.amount)
  }, [receivables])
  const borrowerChart = byBorrower.slice(0, 10)
  const borrowerMax = Math.max(1, ...borrowerChart.map((b) => b.amount))

  // --- Shared exclusion list (non-payment) for due-date + grand view. ---
  const [excludedBorrowers, setExcludedBorrowers] = usePersistedState(
    'admin.dueExcluded',
    () => new Set<string>(),
  )
  const toggleExcluded = (id: string) =>
    setExcludedBorrowers((prev: Set<string>) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // --- Receivables by Due Date: exclusion + single-date filter. ---
  const [dueDateSel, setDueDateSel] = usePersistedState('admin.dueSel', 'all')
  const dueDateReceivables = useMemo(
    () => receivables.filter((t: any) => !excludedBorrowers.has(t.userId)),
    [receivables, excludedBorrowers],
  )
  const dueDateOptions: string[] = useMemo(() => {
    const set = new Set<string>()
    dueDateReceivables.forEach((t: any) => set.add(t.dueDate))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [dueDateReceivables])
  const effectiveDueSel = dueDateSel !== 'all' && !dueDateOptions.includes(dueDateSel) ? 'all' : dueDateSel
  const byDueDate = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {}
    dueDateReceivables
      .filter((t: any) => effectiveDueSel === 'all' || t.dueDate === effectiveDueSel)
      .forEach((t: any) => {
        groups[t.dueDate] = groups[t.dueDate] ?? { count: 0, amount: 0 }
        groups[t.dueDate].count += 1
        groups[t.dueDate].amount += t.amount
      })
    return Object.entries(groups)
      .map(([dueDate, g]) => ({ dueDate, ...g }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [dueDateReceivables, effectiveDueSel])

  // --- Grand View: single-date filter + past/current/next pies. ---
  const [grandDueSel, setGrandDueSel] = usePersistedState('admin.grandDueSel', 'all')
  const effectiveGrandDue =
    grandDueSel !== 'all' && !dueDateOptions.includes(grandDueSel) ? 'all' : grandDueSel
  const grandTouched = effectiveGrandDue !== 'all'
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
  const grandPies = useMemo(() => {
    const groupByBorrower = (txns: any[]) => {
      const g: Record<string, number> = {}
      txns.forEach((t) => {
        g[t.userId] = (g[t.userId] ?? 0) + t.amount
      })
      return Object.entries(g)
        .map(([userId, amount]) => ({ userId, name: nameOf(userId), value: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.value - a.value)
    }
    const pastDue = groupByBorrower(dueDateReceivables.filter((t: any) => grandAnchor && t.dueDate < grandAnchor))
    const currentDue = groupByBorrower(dueDateReceivables.filter((t: any) => t.dueDate === grandAnchor))
    const nextDue = groupByBorrower(dueDateReceivables.filter((t: any) => grandNextDate && t.dueDate === grandNextDate))
    const ids = [...new Set([...pastDue, ...currentDue, ...nextDue].map((d) => d.userId))]
    const colorMap: Record<string, string> = {}
    ids.forEach((id, i) => {
      colorMap[id] = BORROWER_COLORS[i % BORROWER_COLORS.length]
    })
    return { pastDue, currentDue, nextDue, colorMap }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueDateReceivables, grandAnchor, grandNextDate, users])
  const grandPastPills = useMemo(
    () => dueDateOptions.filter((d) => d < today).slice(-5),
    [dueDateOptions, today],
  )
  const grandUpcomingPills = useMemo(
    () => dueDateOptions.filter((d) => d >= today).slice(0, 5),
    [dueDateOptions, today],
  )

  const grandRows = useMemo(() => {
    let base: any[]
    if (!grandTouched) {
      const pastDue = transactions.filter((t: any) => effectiveStatus(t, today) === 'past_due')
      const unpaid = transactions.filter((t: any) => effectiveStatus(t, today) === 'unpaid')
      const nextDate = unpaid.reduce(
        (min: string | null, t: any) => (min == null || t.dueDate < min ? t.dueDate : min),
        null,
      )
      const nextUnpaid = nextDate ? unpaid.filter((t: any) => t.dueDate === nextDate) : []
      base = [...pastDue, ...nextUnpaid]
    } else {
      base = transactions.filter((t: any) => t.dueDate === effectiveGrandDue)
    }
    return base
      .filter((t: any) => {
        if (excludedBorrowers.has(t.userId)) return false
        if (grandHideSettled && ['paid', 'refunded', 'cancelled'].includes(effectiveStatus(t, today)))
          return false
        return true
      })
      .sort(
        (a: any, b: any) =>
          a.dueDate.localeCompare(b.dueDate) ||
          nameOf(a.userId).localeCompare(nameOf(b.userId)) ||
          a.id.localeCompare(b.id),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, today, grandHideSettled, grandTouched, effectiveGrandDue, excludedBorrowers, users])

  const pendingProofs = payments.filter((p: any) => p.status === 'pending')
  const dueDatePag = usePagination(byDueDate, 5)
  const grandPag = usePagination(grandRows, 8)
  const iconSize = 18

  const tiles = [
    { key: 'active', el: <StatTile icon={<UsersIcon size={iconSize} color={colors.navy800} />} accentBg="bg-navy-50" label="Active Borrowers" value={activeBorrowers} hint={`${users.length} total accounts`} /> },
    { key: 'disbursed', el: <StatTile icon={<Wallet size={iconSize} color={colors.navy600} />} accentBg="bg-navy-50" label="Total Net Proceeds Disbursed" value={formatPeso(totalDisbursed)} /> },
    { key: 'outstanding', el: <StatTile icon={<TrendingUp size={iconSize} color={colors.gold600} />} accentBg="bg-amber-50" label="Outstanding Receivables" value={formatPeso(outstanding)} hint={`${receivables.length} open installments`} /> },
    { key: 'fees', el: <StatTile icon={<Wallet size={iconSize} color={colors.gold600} />} accentBg="bg-amber-50" label="Total Fees" value={formatPeso(totalFees)} hint="DST + Processing + Notarial" /> },
    { key: 'installments', el: <StatTile icon={<Wallet size={iconSize} color={colors.navy800} />} accentBg="bg-navy-50" label="Total Installment Transactions" value={formatPeso(installmentTotal)} hint={`${installmentTxns.length} installment${installmentTxns.length === 1 ? '' : 's'}`} /> },
    { key: 'straight', el: <StatTile icon={<List size={iconSize} color="#6d28d9" />} accentBg="bg-violet-50" label="Total Straight Transactions" value={formatPeso(straightTotal)} hint={`${straightTxns.length} item${straightTxns.length === 1 ? '' : 's'}`} /> },
    { key: 'interest', el: <StatTile icon={<TrendingUp size={iconSize} color={colors.gold600} />} accentBg="bg-amber-50" label="Total Interest" value={formatPeso(totalInterest)} hint="Sum of all monthly interests" /> },
    { key: 'grand', el: <StatTile icon={<BarChart3 size={iconSize} color="#047857" />} accentBg="bg-emerald-50" label="Grand Total" value={formatPeso(grandTotal)} hint="Installments + straight" /> },
  ]

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        {/* Header */}
        <FadeInView className="flex-row items-center justify-between px-1">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="font-sans-bold text-2xl text-slate-900">Command Center</Text>
            <Text className="mt-0.5 font-sans text-sm text-slate-500">
              Portfolio health and recent activity at a glance.
            </Text>
          </View>
          <PressableScale onPress={() => router.push('/(admin)/profile')} accessibilityLabel="View profile">
            <Avatar name={session.user.name} url={session.user.avatarUrl} size={40} />
          </PressableScale>
        </FadeInView>

        <PressableScale
          onPress={() => router.push('/(admin)/calculator')}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3"
        >
          <CalcIcon size={18} color="#ffffff" />
          <Text className="font-sans-semibold text-sm text-white">New Loan Disclosure</Text>
        </PressableScale>

        {/* Stat tiles */}
        {dataLoading ? (
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-[48.7%]" />
            ))}
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {tiles.map((t, i) => (
              <FadeInView key={t.key} delay={50 * i} className="w-[48.7%]">
                {t.el}
              </FadeInView>
            ))}
          </View>
        )}

        {/* Receivables by Status — donut + borrower filter pills */}
        <FadeInView delay={120}>
          <Card>
            <CardHeader title="Receivables by Status" subtitle="Ledger amounts grouped by status" />
            <View className="flex-row flex-wrap gap-1.5 px-4 pt-3">
              <Pill label="All" active={statusBorrowerSel.size === 0} onPress={() => setStatusBorrowerSel(new Set())} />
              {statusBorrowerOptions.map((b: any) => (
                <Pill key={b.id} label={b.name} active={statusBorrowerSel.has(b.id)} onPress={() => toggleStatusBorrower(b.id)} />
              ))}
            </View>
            {byStatus.length === 0 ? (
              <EmptyState title="No transactions" />
            ) : (
              <>
                <View className="items-center py-3">
                  <Donut
                    size={168}
                    thickness={30}
                    data={byStatus.map((s) => ({ key: s.status, value: s.amount, color: STATUS_COLORS[s.status] ?? '#94a3b8' }))}
                  />
                </View>
                {byStatus.map(({ status, count, amount }) => (
                  <View
                    key={status}
                    className="flex-row items-center justify-between border-t border-slate-100 px-5 py-2.5"
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      <View style={{ backgroundColor: STATUS_COLORS[status] ?? '#94a3b8' }} className="h-2.5 w-2.5 rounded-full" />
                      <Text className="font-sans-medium text-sm text-slate-700">{STATUS_LABELS[status]}</Text>
                      <Text className="font-sans text-xs text-slate-400">{count}×</Text>
                    </View>
                    <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(amount)}</Text>
                  </View>
                ))}
              </>
            )}
            <View className="flex-row items-center justify-between border-t border-slate-200 bg-navy-50/70 px-5 py-3">
              <Text className="font-sans-semibold text-sm text-navy-900">Total Receivables</Text>
              <Text className="font-mono-semibold text-sm text-navy-900">{formatPeso(statusReceivablesTotal)}</Text>
            </View>
          </Card>
        </FadeInView>

        {/* Receivables by Borrower — horizontal bar chart */}
        <FadeInView delay={160}>
          <Card>
            <CardHeader
              title="Receivables by Borrower"
              subtitle={byBorrower.length > 10 ? `Top 10 of ${byBorrower.length} accounts` : 'Open balances per account'}
            />
            {byBorrower.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              <View className="gap-3 px-5 py-4">
                {borrowerChart.map((b) => (
                  <View key={b.userId} className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="min-w-0 flex-1 font-sans-medium text-xs text-slate-700" numberOfLines={1}>
                        {nameOf(b.userId)}
                      </Text>
                      <Text className="ml-2 font-mono text-[11px] text-slate-500">{formatPeso(b.amount)}</Text>
                    </View>
                    <Bar pct={(b.amount / borrowerMax) * 100} color={colors.gold500} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </FadeInView>

        {/* Receivables by Due Date — exclusion + single-date filter */}
        <FadeInView delay={200}>
          <Card>
            <CardHeader title="Receivables by Due Date" subtitle="Expected collections per date" />
            <ExclusionRow borrowers={statusBorrowerOptions} excluded={excludedBorrowers} onToggle={toggleExcluded} />
            {dueDateOptions.length > 0 && (
              <View className="flex-row flex-wrap gap-1.5 border-b border-slate-100 px-4 py-3">
                <Pill label="All dates" active={effectiveDueSel === 'all'} onPress={() => setDueDateSel('all')} />
                {dueDateOptions.map((d) => (
                  <Pill key={d} label={shortDate(d)} tone={d < today ? 'danger' : 'default'} active={effectiveDueSel === d} onPress={() => setDueDateSel(d)} />
                ))}
              </View>
            )}
            {byDueDate.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              <>
              {dueDatePag.pageItems.map(({ dueDate, count, amount }: any, idx: number) => (
                <View
                  key={dueDate}
                  className={`flex-row items-center justify-between px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View>
                    <Text className={`font-sans-medium text-sm ${dueDate < today ? 'text-red-700' : 'text-slate-900'}`}>
                      {formatDate(dueDate)}
                      {dueDate < today ? ' · overdue' : ''}
                    </Text>
                    <Text className="font-sans text-xs text-slate-500">{count} installments</Text>
                  </View>
                  <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(amount)}</Text>
                </View>
              ))}
              <Pager page={dueDatePag.page} pageCount={dueDatePag.pageCount} total={dueDatePag.total} start={dueDatePag.start} end={dueDatePag.end} onPage={dueDatePag.setPage} label="dates" />
              </>
            )}
          </Card>
        </FadeInView>

        {/* Verification Queue preview */}
        <FadeInView delay={240}>
          <Card>
            <CardHeader
              title="Verification Queue"
              subtitle={`${pendingProofs.length} proof${pendingProofs.length === 1 ? '' : 's'} awaiting review`}
              action={
                <PressableScale onPress={() => router.push('/(admin)/queue')} haptic={false}>
                  <Text className="font-sans-medium text-sm text-navy-700">Open queue</Text>
                </PressableScale>
              }
            />
            {pendingProofs.length === 0 ? (
              <EmptyState title="All caught up" body="No payment proofs awaiting review." />
            ) : (
              pendingProofs.slice(0, 4).map((p: any, idx: number) => (
                <View
                  key={p.id}
                  className={`flex-row items-center justify-between gap-3 px-5 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>
                      {nameOf(p.userId)}
                    </Text>
                    <Text className="font-sans text-xs text-slate-500">
                      {formatDate(p.submittedAt)} · {p.method}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(p.amount)}</Text>
                    <Badge status={p.status} />
                  </View>
                </View>
              ))
            )}
          </Card>
        </FadeInView>

        {/* Grand View — past/current/next pies + collections list */}
        <FadeInView delay={280}>
          <Card>
            <CardHeader
              title="Grand View — Scheduled Collections"
              subtitle="Past / current / next dues by borrower, plus the collections list."
              action={
                <Switch
                  value={grandHideSettled}
                  onValueChange={setGrandHideSettled}
                  trackColor={{ true: colors.navy800, false: '#cbd5e1' }}
                  thumbColor="#ffffff"
                  accessibilityLabel={grandHideSettled ? 'Show all transactions' : 'Hide settled transactions'}
                />
              }
            />
            <ExclusionRow borrowers={statusBorrowerOptions} excluded={excludedBorrowers} onToggle={toggleExcluded} />
            {(grandPastPills.length > 0 || grandUpcomingPills.length > 0) && (
              <View className="flex-row flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-3">
                <Text className="font-sans-medium text-xs text-slate-500">Jump to:</Text>
                <Pill label="Auto" active={effectiveGrandDue === 'all'} onPress={() => setGrandDueSel('all')} />
                {grandPastPills.map((d) => (
                  <Pill key={d} label={shortDate(d)} tone="danger" active={effectiveGrandDue === d} onPress={() => setGrandDueSel(d)} />
                ))}
                {grandUpcomingPills.map((d) => (
                  <Pill key={d} label={shortDate(d)} active={effectiveGrandDue === d} onPress={() => setGrandDueSel(d)} />
                ))}
              </View>
            )}
            <View className="gap-3 px-4 py-4">
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
            </View>
            {grandRows.length === 0 ? (
              <EmptyState title="No collections match" body="Nothing matches the selected date and exclusion list." />
            ) : (
              <>
                {grandPag.pageItems.map((t: any, idx: number) => {
                  const effective = effectiveStatus(t, today)
                  return (
                    <View
                      key={t.id}
                      className={`flex-row items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 ${
                        effective === 'past_due' ? 'bg-red-50/60' : ''
                      }`}
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>
                          {nameOf(t.userId)}
                        </Text>
                        <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
                          {t.description} · {formatDate(t.dueDate)}
                        </Text>
                      </View>
                      <View className="items-end gap-1">
                        <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(t.amount)}</Text>
                        <Badge status={effective} label={STATUS_LABELS[effective]} />
                      </View>
                    </View>
                  )
                })}
                <Pager page={grandPag.page} pageCount={grandPag.pageCount} total={grandPag.total} start={grandPag.start} end={grandPag.end} onPage={grandPag.setPage} label="records" />
                <View className="flex-row items-center justify-between border-t border-slate-200 bg-navy-50/70 px-5 py-3">
                  <Text className="font-sans-semibold text-xs text-navy-900">
                    TOTAL ({grandRows.length} item{grandRows.length === 1 ? '' : 's'} ·{' '}
                    {new Set(grandRows.map((t: any) => t.userId)).size} borrower
                    {new Set(grandRows.map((t: any) => t.userId)).size === 1 ? '' : 's'})
                  </Text>
                  <Text className="font-mono-semibold text-sm text-navy-900">{formatPeso(sum(grandRows))}</Text>
                </View>
              </>
            )}
          </Card>
        </FadeInView>

        {/* Recent Activity */}
        <FadeInView delay={320}>
          <Card>
            <CardHeader
              title="Recent Activity"
              subtitle="Audit trail (latest entries)"
              action={
                <PressableScale onPress={() => router.push('/(admin)/logs')} haptic={false}>
                  <Text className="font-sans-medium text-sm text-navy-700">Full log</Text>
                </PressableScale>
              }
            />
            {auditLog.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              auditLog.slice(0, 8).map((entry: any, idx: number) => (
                <View
                  key={entry.id}
                  className={`flex-row items-start gap-3 px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View className="mt-0.5 rounded-lg bg-slate-100 p-1.5">
                    <ScrollText size={14} color={colors.slate500} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans text-sm text-slate-700">{entry.detail}</Text>
                    <Text className="font-sans text-xs text-slate-400">
                      {entry.actor} · {entry.at} ·{' '}
                      <Text className="font-mono text-[11px] uppercase">{entry.action}</Text>
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  )
}

// --- Local presentational helpers ---

function Pill({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string
  active: boolean
  onPress: () => void
  tone?: 'default' | 'danger'
}) {
  const box = active
    ? 'border-navy-700 bg-navy-800'
    : tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : 'border-slate-300 bg-white'
  const txt = active ? 'text-white' : tone === 'danger' ? 'text-red-700' : 'text-slate-600'
  return (
    <Pressable onPress={onPress} className={`rounded-full border px-2.5 py-1 ${box}`}>
      <Text className={`font-sans-medium text-xs ${txt}`}>{label}</Text>
    </Pressable>
  )
}

// Horizontal proportional bar (View-based; matches the Analytics screen).
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <View className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
      <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: color }} className="h-full rounded-full" />
    </View>
  )
}

function ExclusionRow({
  borrowers,
  excluded,
  onToggle,
}: {
  borrowers: { id: string; name: string }[]
  excluded: Set<string>
  onToggle: (id: string) => void
}) {
  if (borrowers.length === 0) return null
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-3">
      <Text className="font-sans-medium text-xs text-slate-500">Exclude (non-payment):</Text>
      {borrowers.map((b) => {
        const on = excluded.has(b.id)
        return (
          <Pressable
            key={b.id}
            onPress={() => onToggle(b.id)}
            className={`rounded-full border px-2.5 py-1 ${on ? 'border-red-300 bg-red-100' : 'border-slate-300 bg-white'}`}
          >
            <Text className={`font-sans-medium text-xs ${on ? 'text-red-700' : 'text-slate-500'}`}>
              {on ? '✕ ' : ''}
              {b.name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function BorrowerPie({
  title,
  caption,
  data,
  colorMap,
}: {
  title: string
  caption: string
  data: { userId: string; name: string; value: number }[]
  colorMap: Record<string, string>
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <View className="rounded-2xl border border-slate-200 bg-white p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-semibold text-sm text-slate-900">{title}</Text>
        <Text className="font-mono-semibold text-xs text-slate-700">{formatPeso(total)}</Text>
      </View>
      <Text className="mt-0.5 font-sans text-[11px] text-slate-500" numberOfLines={1}>
        {caption}
      </Text>
      {data.length === 0 ? (
        <View className="h-28 items-center justify-center">
          <Text className="font-sans text-xs text-slate-400">No items</Text>
        </View>
      ) : (
        <View className="mt-2 flex-row items-center gap-3">
          <Donut
            size={104}
            thickness={20}
            data={data.map((d) => ({ key: d.userId, value: d.value, color: colorMap[d.userId] ?? '#94a3b8' }))}
          />
          <View className="min-w-0 flex-1 gap-1">
            {data.slice(0, 4).map((d) => (
              <View key={d.userId} className="flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                  <View style={{ backgroundColor: colorMap[d.userId] ?? '#94a3b8' }} className="h-2 w-2 rounded-full" />
                  <Text className="min-w-0 flex-1 font-sans text-[11px] text-slate-600" numberOfLines={1}>
                    {d.name}
                  </Text>
                </View>
                <Text className="font-mono text-[11px] text-slate-800">{formatPeso(d.value)}</Text>
              </View>
            ))}
            {data.length > 4 && (
              <Text className="font-sans text-[11px] text-slate-400">+{data.length - 4} more</Text>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
