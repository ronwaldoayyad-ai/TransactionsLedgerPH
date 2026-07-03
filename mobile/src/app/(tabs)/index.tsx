import { RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, { FadeInDown } from 'react-native-reanimated'
import {
  Check,
  Clock,
  List,
  ScrollText,
  TrendingUp,
  Wallet,
} from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { usePersistedState } from '../../hooks/usePersistedState'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { effectiveStatus } from '../../lib/transactions'
import StatTile from '../../components/ui/StatTile'
import ProgressBar from '../../components/ui/ProgressBar'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import PressableScale from '../../components/ui/PressableScale'
import Skeleton from '../../components/ui/Skeleton'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

// Borrower dashboard — port of web UserDashboard.jsx (same tile order, same
// derivations, same tap-to-prefilter wiring through pageStateStore).
export default function Dashboard() {
  const { session, loans, payments, transactions, dataLoading, refreshing, refreshData } = useApp()
  const router = useRouter()
  const [hidePaid, setHidePaid] = usePersistedState('dashboard.hidePaid', true)

  const myPayments = payments.filter((p: any) => p.userId === session.user.id)
  const myTxns = transactions.filter((t: any) => t.userId === session.user.id)
  const unpaidTxns = myTxns.filter(
    (t: any) => !['paid', 'refunded', 'cancelled'].includes(t.status),
  )

  const myLoans = loans.filter(
    (l: any) =>
      l.userId === session.user.id &&
      l.txnType !== 'straight' &&
      myTxns.some((t: any) => t.loanId === l.id),
  )

  const txnsFor = (loanId: string) => myTxns.filter((t: any) => t.loanId === loanId)
  const loanTxnDate = (loan: any) => txnsFor(loan.id)[0]?.txnDate ?? loan.txnDate ?? ''
  const sortedLoans = [...myLoans].sort((a, b) => loanTxnDate(b).localeCompare(loanTxnDate(a)))
  const paidCountFor = (loanId: string) =>
    txnsFor(loanId).filter((t: any) => t.status === 'paid').length
  const isFullyPaid = (loanId: string) => {
    const txns = txnsFor(loanId)
    return txns.length > 0 && txns.every((t: any) => t.status === 'paid')
  }
  const isSettled = (loanId: string) => {
    const txns = txnsFor(loanId)
    return (
      txns.length > 0 &&
      txns.every((t: any) => ['paid', 'refunded', 'cancelled'].includes(t.status))
    )
  }
  const fullyPaidCount = myLoans.filter((l: any) => isFullyPaid(l.id)).length
  const visibleLoans = hidePaid ? sortedLoans.filter((l: any) => !isSettled(l.id)) : sortedLoans

  const today = toISODate(new Date())
  const totalNetProceeds = myLoans.reduce((s: number, l: any) => s + l.disclosure.netProceeds, 0)
  const outstanding = unpaidTxns.reduce((s: number, t: any) => s + t.amount, 0)
  const pastDueItems = unpaidTxns.filter((t: any) => effectiveStatus(t, today) === 'past_due')
  const upcomingUnpaid = unpaidTxns.filter((t: any) => effectiveStatus(t, today) === 'unpaid')
  const nextUnpaidDate = upcomingUnpaid.reduce(
    (min: string | null, t: any) => (min == null || t.dueDate < min ? t.dueDate : min),
    null,
  )
  const nextDueItems = [
    ...pastDueItems,
    ...(nextUnpaidDate ? upcomingUnpaid.filter((t: any) => t.dueDate === nextUnpaidDate) : []),
  ]
  const nextDueAmount = nextDueItems.reduce((s: number, t: any) => s + t.amount, 0)

  const straightTxns = myTxns.filter((t: any) => t.type === 'Straight')
  const installmentTxns = myTxns.filter((t: any) => t.type === 'Installment')
  const straightTotal = straightTxns.reduce((s: number, t: any) => s + t.amount, 0)
  const installmentTotal = installmentTxns.reduce((s: number, t: any) => s + t.amount, 0)

  // Clickable tiles prefilter the Transactions screen via search params —
  // params reach the already-mounted tab, unlike mount-time store seeds
  // (the web remounts pages on navigation; tabs don't).
  const goNextDue = () => {
    router.push({
      pathname: '/(tabs)/transactions',
      params: {
        seedN: String(Date.now()),
        seedStatus: 'past_due,due,upcoming',
        seedDue: [...new Set(nextDueItems.map((t: any) => t.dueDate))].join(','),
        seedType: '',
        seedHide: '1',
      },
    })
  }
  const goInstallments = () => {
    router.push({
      pathname: '/(tabs)/transactions',
      params: {
        seedN: String(Date.now()),
        seedStatus: '',
        seedDue: '',
        seedType: 'Installment',
        seedHide: '0',
      },
    })
  }

  const iconSize = 18

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} className="flex-row items-center justify-between px-1">
          <View className="min-w-0 flex-1 pr-3">
            <Text className="font-sans-bold text-2xl text-slate-900">
              Welcome back, {session.user.name.split(' ')[0]}
            </Text>
            <Text className="mt-0.5 font-sans text-sm text-slate-500">
              Here is the latest on your loans and payments.
            </Text>
          </View>
          <PressableScale onPress={() => router.push('/profile')} accessibilityLabel="View profile">
            <Avatar name={session.user.name} url={session.user.avatarUrl} size={40} />
          </PressableScale>
        </Animated.View>

        {/* Stat tiles — exact web order */}
        {dataLoading ? (
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-28 w-[48.7%]" />
            ))}
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {[
              {
                key: 'next-due',
                el: (
                  <StatTile
                    icon={<Clock size={iconSize} color="#0369a1" />}
                    accentBg="bg-sky-50"
                    label="Next Payment Due"
                    value={nextDueItems.length ? formatPeso(nextDueAmount) : '—'}
                    hint={
                      nextDueItems.length
                        ? `${nextDueItems.length} item${nextDueItems.length === 1 ? '' : 's'} due${
                            pastDueItems.length ? ` · incl. ${pastDueItems.length} past due` : ''
                          }${nextUnpaidDate ? ` · next ${formatDate(nextUnpaidDate)}` : ''}`
                        : 'No upcoming payments'
                    }
                    onPress={goNextDue}
                    highlight
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
                    onPress={goInstallments}
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
                    onPress={() => router.push('/straight')}
                  />
                ),
              },
              {
                key: 'outstanding',
                el: (
                  <StatTile
                    icon={<TrendingUp size={iconSize} color={colors.gold600} />}
                    accentBg="bg-amber-50"
                    label="Outstanding Balance"
                    value={formatPeso(outstanding)}
                  />
                ),
              },
              {
                key: 'proceeds',
                el: (
                  <StatTile
                    icon={<Wallet size={iconSize} color={colors.navy600} />}
                    accentBg="bg-navy-50"
                    label="Net Proceeds Received"
                    value={formatPeso(totalNetProceeds)}
                    hint="After fees & deductions"
                  />
                ),
              },
              {
                key: 'active',
                el: (
                  <StatTile
                    icon={<ScrollText size={iconSize} color={colors.navy600} />}
                    accentBg="bg-navy-50"
                    label="Active Loans"
                    value={myLoans.length}
                    hint={fullyPaidCount > 0 ? `${fullyPaidCount} fully paid` : undefined}
                  />
                ),
              },
            ].map((t, i) => (
              <Animated.View
                key={t.key}
                entering={FadeInDown.duration(400).delay(60 * i)}
                className="w-[48.7%]"
              >
                {t.el}
              </Animated.View>
            ))}
          </View>
        )}

        {/* My Loan Schedules */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <Card>
            <CardHeader
              title="My Loan Schedules"
              subtitle="Read-only view of your active loans"
              action={
                myLoans.length > 0 ? (
                  <Switch
                    value={hidePaid}
                    onValueChange={setHidePaid}
                    trackColor={{ true: colors.navy800, false: '#cbd5e1' }}
                    thumbColor="#ffffff"
                    accessibilityLabel={
                      hidePaid ? 'Show all loans' : 'Hide fully paid, refunded, or cancelled loans'
                    }
                  />
                ) : undefined
              }
            />
            {dataLoading ? (
              <View className="gap-3 p-5">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </View>
            ) : myLoans.length === 0 ? (
              <EmptyState
                title="No loans assigned yet"
                body="Your administrator will assign your loan schedule once finalized. It will appear here automatically."
              />
            ) : visibleLoans.length === 0 ? (
              <EmptyState
                icon={<Check size={20} color="#059669" />}
                title="All loans settled"
                body="Every loan is paid, refunded, or cancelled. Turn off the toggle to see them again."
              />
            ) : (
              visibleLoans.map((loan: any, idx: number) => {
                const totalCount = txnsFor(loan.id).length
                const paidCount = paidCountFor(loan.id)
                const progress = Math.round((paidCount / totalCount) * 100)
                const fullyPaid = isFullyPaid(loan.id)
                return (
                  <PressableScale
                    key={loan.id}
                    scaleTo={0.985}
                    onPress={() => router.push({ pathname: '/loan/[id]', params: { id: loan.id } })}
                  >
                    <View
                      className={`px-5 py-4 ${idx > 0 ? 'border-t border-slate-100' : ''} ${
                        fullyPaid ? 'border-l-4 border-l-emerald-500 bg-emerald-50/60' : ''
                      }`}
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="min-w-0 flex-1">
                          <View className="flex-row flex-wrap items-center gap-2">
                            <Text className="font-sans-semibold text-[15px] text-slate-900">
                              {loan.label}
                            </Text>
                            {fullyPaid && <Badge status="paid" label="Fully Paid" />}
                          </View>
                          <Text className="mt-0.5 font-sans text-xs text-slate-500">
                            Availed {formatDate(loanTxnDate(loan))} · {loan.durationMonths} months
                            · {(loan.monthlyRate * 100).toFixed(4)}% monthly add-on
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="font-mono-semibold text-sm text-slate-900">
                            {formatPeso(loan.principal)}
                          </Text>
                          <Text className="font-sans text-xs text-slate-500">principal</Text>
                        </View>
                      </View>
                      <View className="mt-3 flex-row items-center gap-3">
                        <ProgressBar progress={progress} delay={150 + idx * 80} />
                        <Text
                          className={`font-sans-medium text-xs ${fullyPaid ? 'text-emerald-700' : 'text-slate-600'}`}
                        >
                          {paidCount}/{totalCount} paid
                        </Text>
                      </View>
                    </View>
                  </PressableScale>
                )
              })
            )}
          </Card>
        </Animated.View>

        {/* Recent Payments */}
        <Animated.View entering={FadeInDown.duration(400).delay(260)}>
          <Card>
            <CardHeader
              title="Recent Payments"
              subtitle="Your latest submitted proofs"
              action={
                <PressableScale onPress={() => router.push('/(tabs)/pay')} haptic={false}>
                  <Text className="font-sans-medium text-sm text-navy-700">View all</Text>
                </PressableScale>
              }
            />
            {dataLoading ? (
              <View className="gap-3 p-5">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </View>
            ) : myPayments.length === 0 ? (
              <EmptyState title="No payments yet" body="Your submitted proofs will appear here." />
            ) : (
              myPayments.slice(0, 3).map((p: any, idx: number) => (
                <View
                  key={p.id}
                  className={`flex-row items-center justify-between gap-3 px-5 py-3.5 ${
                    idx > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>
                      {p.fileName}
                    </Text>
                    <Text className="mt-0.5 font-sans text-xs text-slate-500">
                      {formatDate(p.submittedAt)} · {p.method}
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Text className="font-mono-semibold text-sm text-slate-900">
                      {formatPeso(p.amount)}
                    </Text>
                    <Badge status={p.status} />
                  </View>
                </View>
              ))
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}
