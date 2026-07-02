import { FlatList, RefreshControl, Text, View } from 'react-native'
import { Stack } from 'expo-router'
import { ScrollText } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { formatDate, formatPeso } from '../lib/amortization'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import { colors, fonts } from '../theme'

// Read-only payment acknowledgements (web PaymentLogs port) — same
// allocation-status → badge mapping.
const allocBadge: Record<string, string> = {
  Settled: 'paid',
  Overpayment: 'refunded',
  Underpayment: 'past_due',
  Credited: 'active',
}

export default function PaymentLogs() {
  const { session, paymentLogs, dataLoading, refreshing, refreshData } = useApp()

  const mine = paymentLogs
    .filter((l: any) => l.userId === session.user.id && l.kind === 'payment')
    .sort((a: any, b: any) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  return (
    <View className="flex-1 bg-[#f3f6fb]">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Payment Logs',
          headerTitleStyle: { fontFamily: fonts.sansSemibold },
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      {dataLoading ? (
        <View className="gap-2 p-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </View>
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(l: any) => l.id}
          initialNumToRender={12}
          windowSize={9}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
          }
          contentContainerClassName="gap-3 p-4 pb-8"
          ListEmptyComponent={
            <EmptyState
              icon={<ScrollText size={20} color={colors.slate500} />}
              title="No payment logs yet"
              body="Acknowledgements of your verified payments will appear here."
            />
          }
          renderItem={({ item: l }) => (
            <View className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="font-sans-medium text-xs text-slate-500">
                  {formatDate(l.txnDate ?? l.createdAt)}
                  {l.reference ? ` · ${l.reference}` : ''}
                </Text>
                <Badge status={allocBadge[l.allocStatus] ?? 'upcoming'} label={l.allocStatus} />
              </View>
              <Text className="mt-1.5 font-sans-medium text-sm text-slate-900" numberOfLines={2}>
                {l.subject}
              </Text>
              {l.method ? (
                <Text className="mt-0.5 font-sans text-xs text-slate-500">via {l.method}</Text>
              ) : null}
              <View className="mt-3 flex-row rounded-xl bg-slate-50 px-3 py-2.5">
                {[
                  ['Amount Owed', l.amountOwed],
                  ['Funds Applied', l.fundsApplied],
                  ['Remaining', l.remainingBalance],
                ].map(([label, v], i) => (
                  <View key={label as string} className={`flex-1 ${i > 0 ? 'border-l border-slate-200 pl-3' : ''}`}>
                    <Text className="font-sans text-[10px] uppercase tracking-wide text-slate-500">
                      {label}
                    </Text>
                    <Text className="mt-0.5 font-mono-semibold text-[13px] text-slate-900">
                      {formatPeso(Number(v) || 0)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}
