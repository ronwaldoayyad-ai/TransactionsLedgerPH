import { FlatList, RefreshControl, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { PartyPopper } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { Card, CardHeader } from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import TxnRow from '../../components/TxnRow'
import { colors, fonts } from '../../theme'

// Read-only loan disclosure + amortization schedule (web LoanDetail port,
// borrower view). Values come from loan.disclosure and the shared ledger —
// never recomputed here.
export default function LoanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session, loans, transactions, refreshing, refreshData } = useApp()
  const today = toISODate(new Date())

  const loan = loans.find((l: any) => l.id === id && l.userId === session.user.id)
  const txns = transactions.filter(
    (t: any) => t.loanId === id && t.userId === session.user.id,
  )

  const screenOptions = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: loan?.label ?? 'Loan',
        headerTitleStyle: { fontFamily: fonts.sansSemibold },
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  )

  if (!loan) {
    return (
      <View className="flex-1 bg-[#f3f6fb]">
        {screenOptions}
        <EmptyState
          title="Loan not found"
          body="This loan is no longer available. Pull to refresh from the dashboard."
        />
      </View>
    )
  }

  const d = loan.disclosure
  const fullyPaid = txns.length > 0 && txns.every((t: any) => t.status === 'paid')
  const feesRolledIn = !loan.deductFromProceeds
  const deductionsLabel = feesRolledIn
    ? 'Fees & Deductions (with 1st payment)'
    : 'Total Deductions'

  // Same field list and labels as the web read-only disclosure.
  const fields: [string, string][] = [
    ['Transaction Date', formatDate(loan.txnDate)],
    ['Principal Amount', formatPeso(loan.principal)],
    ['Monthly Add-on Rate', `${(loan.monthlyRate * 100).toFixed(4)}%`],
    ['Duration', `${loan.durationMonths} months`],
    ['First Payment Date', formatDate(loan.firstPaymentDate)],
    ['Documentary Stamp Tax', formatPeso(d.dst)],
    ['Processing Fee', formatPeso(Number(loan.processingFee))],
    ['Notarial Fee', formatPeso(Number(loan.notarialFee))],
  ]

  return (
    <View className="flex-1 bg-[#f3f6fb]">
      {screenOptions}
      <FlatList
        data={txns}
        keyExtractor={(t: any) => t.id}
        renderItem={({ item }) => <TxnRow txn={item} today={today} />}
        initialNumToRender={15}
        windowSize={9}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
        contentContainerClassName="gap-4 p-4 pb-8"
        ListHeaderComponent={
          <View className="gap-4">
            {fullyPaid && (
              <View className="flex-row items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
                <PartyPopper size={20} color="#047857" />
                <Text className="flex-1 font-sans-semibold text-sm text-emerald-900">
                  Congratulations — this loan is Fully Paid!
                </Text>
              </View>
            )}

            {/* Disclosure statement */}
            <View>
              <Card>
                <CardHeader title="Disclosure Statement" subtitle={`Loan ${loan.id} · read-only`} />
                <View className="px-5 py-2">
                  {fields.map(([label, value], i) => (
                    <View
                      key={label}
                      className={`flex-row items-center justify-between gap-3 py-2.5 ${
                        i > 0 ? 'border-t border-slate-100' : ''
                      }`}
                    >
                      <Text className="font-sans text-[13px] text-slate-500">{label}</Text>
                      <Text className="font-mono text-[13px] text-slate-900">{value}</Text>
                    </View>
                  ))}
                  <View className="flex-row items-center justify-between gap-3 border-t border-slate-200 py-2.5">
                    <Text className="font-sans-medium text-[13px] text-slate-600">
                      {deductionsLabel}
                    </Text>
                    <Text className="font-mono-semibold text-[13px] text-slate-900">
                      {formatPeso(d.totalDeductions)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-3">
                    <Text className="font-sans-semibold text-sm text-gold-600">NET PROCEEDS</Text>
                    <Text className="font-mono-semibold text-base text-gold-600">
                      {formatPeso(d.netProceeds)}
                    </Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* Schedule header */}
            <View>
              <View className="rounded-t-2xl border border-b-0 border-slate-200/70 bg-white px-5 py-4">
                <Text className="font-sans-semibold text-base text-slate-900">
                  Amortization Schedule
                </Text>
                <Text className="mt-0.5 font-sans text-xs text-slate-500">
                  {txns.length} payment{txns.length === 1 ? '' : 's'} · total{' '}
                  {formatPeso(txns.reduce((s: number, t: any) => s + t.amount, 0))}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No schedule records" body="This loan has no ledger records yet." />
        }
      />
    </View>
  )
}
