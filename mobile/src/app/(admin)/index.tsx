import { useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  BarChart3,
  Calculator as CalcIcon,
  Clock,
  List,
  ScrollText,
  TrendingUp,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus, isReceivable } from '../../lib/transactions'
import StatTile from '../../components/ui/StatTile'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import PressableScale from '../../components/ui/PressableScale'
import FadeInView from '../../components/ui/FadeInView'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const sum = (txns: any[]) => txns.reduce((s, t) => s + t.amount, 0)

// Admin Command Center — port of web AdminDashboard.jsx. Same derivations and
// figures; presented in a mobile scroll with tap-through quick links.
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

  const byStatus = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {}
    transactions.forEach((t: any) => {
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

  const byDueDate = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {}
    receivables.forEach((t: any) => {
      groups[t.dueDate] = groups[t.dueDate] ?? { count: 0, amount: 0 }
      groups[t.dueDate].count += 1
      groups[t.dueDate].amount += t.amount
    })
    return Object.entries(groups)
      .map(([dueDate, g]) => ({ dueDate, ...g }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }, [receivables])

  // Grand View default: every past-due item plus the next unpaid due date.
  const grandRows = useMemo(() => {
    const pastDue = transactions.filter((t: any) => effectiveStatus(t, today) === 'past_due')
    const unpaid = transactions.filter((t: any) => effectiveStatus(t, today) === 'unpaid')
    const nextDate = unpaid.reduce(
      (min: string | null, t: any) => (min == null || t.dueDate < min ? t.dueDate : min),
      null,
    )
    const nextUnpaid = nextDate ? unpaid.filter((t: any) => t.dueDate === nextDate) : []
    const base = [...pastDue, ...nextUnpaid]
    return base
      .filter((t: any) =>
        grandHideSettled
          ? !['paid', 'refunded', 'cancelled'].includes(effectiveStatus(t, today))
          : true,
      )
      .sort(
        (a: any, b: any) =>
          a.dueDate.localeCompare(b.dueDate) ||
          nameOf(a.userId).localeCompare(nameOf(b.userId)) ||
          a.id.localeCompare(b.id),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, today, grandHideSettled, users])

  const pendingProofs = payments.filter((p: any) => p.status === 'pending')
  const iconSize = 18

  const tiles = [
    {
      key: 'active',
      el: (
        <StatTile
          icon={<UsersIcon size={iconSize} color={colors.navy800} />}
          accentBg="bg-navy-50"
          label="Active Borrowers"
          value={activeBorrowers}
          hint={`${users.length} total accounts`}
        />
      ),
    },
    {
      key: 'disbursed',
      el: (
        <StatTile
          icon={<Wallet size={iconSize} color={colors.navy600} />}
          accentBg="bg-navy-50"
          label="Total Net Proceeds Disbursed"
          value={formatPeso(totalDisbursed)}
        />
      ),
    },
    {
      key: 'outstanding',
      el: (
        <StatTile
          icon={<TrendingUp size={iconSize} color={colors.gold600} />}
          accentBg="bg-amber-50"
          label="Outstanding Receivables"
          value={formatPeso(outstanding)}
          hint={`${receivables.length} open installments`}
        />
      ),
    },
    {
      key: 'fees',
      el: (
        <StatTile
          icon={<Wallet size={iconSize} color={colors.gold600} />}
          accentBg="bg-amber-50"
          label="Total Fees"
          value={formatPeso(totalFees)}
          hint="DST + Processing + Notarial"
        />
      ),
    },
    {
      key: 'installments',
      el: (
        <StatTile
          icon={<Wallet size={iconSize} color={colors.navy800} />}
          accentBg="bg-navy-50"
          label="Total Installment Transactions"
          value={formatPeso(installmentTotal)}
          hint={`${installmentTxns.length} installment${installmentTxns.length === 1 ? '' : 's'}`}
        />
      ),
    },
    {
      key: 'straight',
      el: (
        <StatTile
          icon={<List size={iconSize} color="#6d28d9" />}
          accentBg="bg-violet-50"
          label="Total Straight Transactions"
          value={formatPeso(straightTotal)}
          hint={`${straightTxns.length} item${straightTxns.length === 1 ? '' : 's'}`}
        />
      ),
    },
    {
      key: 'interest',
      el: (
        <StatTile
          icon={<TrendingUp size={iconSize} color={colors.gold600} />}
          accentBg="bg-amber-50"
          label="Total Interest"
          value={formatPeso(totalInterest)}
          hint="Sum of all monthly interests"
        />
      ),
    },
    {
      key: 'grand',
      el: (
        <StatTile
          icon={<BarChart3 size={iconSize} color="#047857" />}
          accentBg="bg-emerald-50"
          label="Grand Total"
          value={formatPeso(grandTotal)}
          hint="Installments + straight"
        />
      ),
    },
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

        {/* Receivables by Status */}
        <FadeInView delay={120}>
          <Card>
            <CardHeader title="Receivables by Status" subtitle="All ledger amounts grouped by status" />
            {byStatus.map(({ status, count, amount }, idx) => (
              <View
                key={status}
                className={`flex-row items-center justify-between px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
              >
                <View className="flex-row items-center gap-2">
                  <Badge status={status} label={STATUS_LABELS[status]} />
                  <Text className="font-sans text-xs text-slate-500">{count}×</Text>
                </View>
                <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(amount)}</Text>
              </View>
            ))}
            <View className="flex-row items-center justify-between border-t border-slate-200 bg-navy-50/70 px-5 py-3">
              <Text className="font-sans-semibold text-sm text-navy-900">Total Receivables</Text>
              <Text className="font-mono-semibold text-sm text-navy-900">{formatPeso(outstanding)}</Text>
            </View>
          </Card>
        </FadeInView>

        {/* Receivables by Borrower */}
        <FadeInView delay={160}>
          <Card>
            <CardHeader title="Receivables by Borrower" subtitle="Open balances per account" />
            {byBorrower.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              byBorrower.map(({ userId, count, amount }, idx) => (
                <View
                  key={userId}
                  className={`flex-row items-center justify-between px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                    <Avatar name={nameOf(userId)} size={28} />
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>
                        {nameOf(userId)}
                      </Text>
                      <Text className="font-sans text-xs text-slate-500">{count} installments</Text>
                    </View>
                  </View>
                  <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(amount)}</Text>
                </View>
              ))
            )}
          </Card>
        </FadeInView>

        {/* Receivables by Due Date */}
        <FadeInView delay={200}>
          <Card>
            <CardHeader title="Receivables by Due Date" subtitle="Expected collections per date" />
            {byDueDate.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              byDueDate.map(({ dueDate, count, amount }, idx) => (
                <View
                  key={dueDate}
                  className={`flex-row items-center justify-between px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View>
                    <Text
                      className={`font-sans-medium text-sm ${dueDate < today ? 'text-red-700' : 'text-slate-900'}`}
                    >
                      {formatDate(dueDate)}
                      {dueDate < today ? ' · overdue' : ''}
                    </Text>
                    <Text className="font-sans text-xs text-slate-500">{count} installments</Text>
                  </View>
                  <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(amount)}</Text>
                </View>
              ))
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

        {/* Recent Activity */}
        <FadeInView delay={280}>
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

        {/* Grand View */}
        <FadeInView delay={320}>
          <Card>
            <CardHeader
              title="Grand View — Scheduled Collections"
              subtitle="All past-due items plus the next unpaid due date."
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
            {grandRows.length === 0 ? (
              <EmptyState title="No collections match" body="Nothing past due or upcoming right now." />
            ) : (
              <>
                {grandRows.map((t: any, idx: number) => {
                  const effective = effectiveStatus(t, today)
                  return (
                    <View
                      key={t.id}
                      className={`flex-row items-center justify-between gap-3 px-5 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''} ${
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
      </ScrollView>
    </SafeAreaView>
  )
}
