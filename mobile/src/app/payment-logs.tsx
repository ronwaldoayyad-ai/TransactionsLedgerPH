import { useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native'
import { Stack } from 'expo-router'
import { ScrollText } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { formatDate, formatPeso } from '../lib/amortization'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import FilterSheet, { FilterChip } from '../components/ui/FilterSheet'
import { colors, fonts } from '../theme'

// Read-only payment acknowledgements (web PaymentLogs port) — same
// allocation-status → badge mapping.
const allocBadge: Record<string, string> = {
  Settled: 'paid',
  Overpayment: 'refunded',
  Underpayment: 'past_due',
  Credited: 'active',
}
const ALLOC_STATUSES = ['Settled', 'Overpayment', 'Underpayment', 'Credited']

export default function PaymentLogs() {
  const { session, paymentLogs, dataLoading, refreshing, refreshData } = useApp()

  const [query, setQuery] = useState('')
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set())
  const [sortKey, setSortKey] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [sheetOpen, setSheetOpen] = useState(false)
  const toggleSort = (k: 'date' | 'amount') => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  const mine = useMemo(
    () =>
      paymentLogs
        .filter((l: any) => l.userId === session.user.id && l.kind === 'payment')
        .sort((a: any, b: any) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [paymentLogs, session.user.id],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return mine
      .filter((l: any) => {
        if (statusSel.size > 0 && !statusSel.has(l.allocStatus)) return false
        if (q) {
          const hay = `${l.subject ?? ''} ${l.reference ?? ''} ${l.method ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a: any, b: any) => {
        const cmp =
          sortKey === 'amount'
            ? (Number(a.amountOwed) || 0) - (Number(b.amountOwed) || 0)
            : String(a.txnDate || '').localeCompare(String(b.txnDate || ''))
        return (cmp || String(a.id).localeCompare(String(b.id))) * dir
      })
  }, [mine, query, statusSel, sortKey, sortDir])

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
          data={visible}
          keyExtractor={(l: any) => l.id}
          initialNumToRender={12}
          windowSize={9}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
          }
          contentContainerClassName="gap-3 p-4 pb-8"
          ListHeaderComponent={
            mine.length > 0 ? (
              <View className="gap-2.5 pb-1">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search subject, reference, method…"
                  placeholderTextColor={colors.slate400}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
                />
                <View className="flex-row items-center justify-between">
                  <FilterChip label="Status" count={statusSel.size} onPress={() => setSheetOpen(true)} />
                  <View className="flex-row items-center gap-2">
                    <Text className="font-sans text-xs text-slate-500">Sort</Text>
                    <View className="flex-row rounded-lg border border-slate-300 bg-white p-0.5">
                      {(['date', 'amount'] as const).map((k) => {
                        const active = sortKey === k
                        return (
                          <Pressable key={k} onPress={() => toggleSort(k)} className={`rounded-md px-2.5 py-1.5 ${active ? 'bg-navy-800' : ''}`}>
                            <Text className={`font-sans-medium text-xs ${active ? 'text-white' : 'text-slate-600'}`}>
                              {k === 'date' ? 'Date' : 'Amount'}
                              {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon={<ScrollText size={20} color={colors.slate500} />}
              title={mine.length === 0 ? 'No payment logs yet' : 'No matching logs'}
              body={
                mine.length === 0
                  ? 'Acknowledgements of your verified payments will appear here.'
                  : 'Adjust the search or filter.'
              }
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
      {sheetOpen && (
        <FilterSheet
          visible
          title="Filter by status"
          options={ALLOC_STATUSES.map((s) => ({ value: s, label: s }))}
          selected={statusSel}
          onChange={setStatusSel}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </View>
  )
}
