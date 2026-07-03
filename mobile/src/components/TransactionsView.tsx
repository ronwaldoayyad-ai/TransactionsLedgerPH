import { useEffect, useMemo, useState } from 'react'
import { FlatList, RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { Clock } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { usePersistedState } from '../hooks/usePersistedState'
import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { BORROWER_STATUS_LABELS, borrowerStatus, isReceivable } from '../lib/transactions'
import FilterSheet, { FilterChip, Option } from './ui/FilterSheet'
import FadeInView from './ui/FadeInView'
import PressableScale from './ui/PressableScale'
import EmptyState from './ui/EmptyState'
import Skeleton from './ui/Skeleton'
import TxnRow from './TxnRow'
import { colors } from '../theme'

const FILTERABLE_STATUSES = ['paid', 'upcoming', 'due', 'past_due', 'refunded', 'cancelled']

// Shared borrower transactions list — powers both Consolidated (full filters)
// and Straight (status-only). Port of the web ConsolidatedLoans /
// StraightTransactions logic; the web's 15-per-page pagination becomes a
// virtualized FlatList (the mobile-native equivalent).
// Dashboard tiles prefilter this view via navigation params. Params reach an
// ALREADY-MOUNTED tab screen (unlike the web, where navigation remounts the
// page), so seeds are applied in an effect keyed by the `seedN` nonce.
export type FilterSeed = {
  seedN?: string
  seedStatus?: string
  seedDue?: string
  seedType?: string
  seedHide?: string
}

const csvToSet = (csv?: string) => new Set(csv ? csv.split(',').filter(Boolean) : [])

export default function TransactionsView({
  keyPrefix,
  straightOnly = false,
  emptyDefaultBody,
  seed,
}: {
  keyPrefix: 'consolidated' | 'straight'
  straightOnly?: boolean
  emptyDefaultBody: string
  seed?: FilterSeed
}) {
  const { session, transactions, dataLoading, refreshing, refreshData } = useApp()
  const today = toISODate(new Date())

  const [statusSel, setStatusSel] = usePersistedState(`${keyPrefix}.statusSel`, () => new Set())
  const [dueDateSel, setDueDateSel] = usePersistedState(`${keyPrefix}.dueDateSel`, () => new Set())
  const [typeSel, setTypeSel] = usePersistedState(`${keyPrefix}.typeSel`, () => new Set())
  const [hideSettled, setHideSettled] = usePersistedState(`${keyPrefix}.hideSettled`, true)
  const [sortKey, setSortKey] = usePersistedState(`${keyPrefix}.sortKey`, 'dueDate')
  const [sortDir, setSortDir] = usePersistedState(`${keyPrefix}.sortDir`, 'asc')
  const [openSheet, setOpenSheet] = useState<null | 'type' | 'status' | 'due'>(null)

  // Apply a dashboard-tile prefilter each time a new seed nonce arrives.
  const { seedN, seedStatus, seedDue, seedType, seedHide } = seed ?? {}
  useEffect(() => {
    if (!seedN) return
    queueMicrotask(() => {
      setStatusSel(csvToSet(seedStatus))
      setDueDateSel(csvToSet(seedDue))
      setTypeSel(csvToSet(seedType))
      setHideSettled(seedHide !== '0')
    })
    // Re-run only when a NEW tap seeds new params (nonce changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedN])

  const myTxns = useMemo(
    () =>
      transactions.filter(
        (t: any) => t.userId === session.user.id && (!straightOnly || t.type === 'Straight'),
      ),
    [transactions, session.user.id, straightOnly],
  )

  // Filter options reflect the current hide-settled view (web parity).
  const optionBase = useMemo(
    () =>
      myTxns.filter(
        (t: any) => !hideSettled || !['paid', 'refunded', 'cancelled'].includes(t.status),
      ),
    [myTxns, hideSettled],
  )
  const statusOptions: Option[] = useMemo(() => {
    const present = new Set<string>(optionBase.map((t: any) => borrowerStatus(t, today)))
    return FILTERABLE_STATUSES.filter((s) => present.has(s)).map((s) => ({
      value: s,
      label: BORROWER_STATUS_LABELS[s],
    }))
  }, [optionBase, today])
  const dueDateOptions: Option[] = useMemo(
    () =>
      [...new Set<string>(optionBase.map((t: any) => t.dueDate))]
        .sort()
        .map((d) => ({ value: d, label: formatDate(d) })),
    [optionBase],
  )
  const typeOptions: Option[] = useMemo(
    () =>
      [...new Set<string>(optionBase.map((t: any) => t.type))]
        .sort()
        .map((ty) => ({ value: ty, label: ty })),
    [optionBase],
  )

  const filtered = useMemo(
    () =>
      myTxns
        .filter(
          (t: any) =>
            (!hideSettled || !['paid', 'refunded', 'cancelled'].includes(t.status)) &&
            (typeSel.size === 0 || typeSel.has(t.type)) &&
            (statusSel.size === 0 || statusSel.has(borrowerStatus(t, today))) &&
            (dueDateSel.size === 0 || dueDateSel.has(t.dueDate)),
        )
        .sort((a: any, b: any) => {
          const dir = sortDir === 'asc' ? 1 : -1
          return (
            (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '') * dir || a.id.localeCompare(b.id)
          )
        }),
    [myTxns, statusSel, dueDateSel, typeSel, hideSettled, sortKey, sortDir, today],
  )
  const outstanding = filtered
    .filter((t: any) => isReceivable(t, today))
    .reduce((s: number, t: any) => s + t.amount, 0)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d: string) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const anyFilter = statusSel.size > 0 || dueDateSel.size > 0 || typeSel.size > 0

  return (
    <View className="flex-1">
      {/* Filter bar */}
      <FadeInView className="gap-2.5 px-4 pb-3 pt-1">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2">
          {!straightOnly && (
            <FilterChip label="Type" count={typeSel.size} onPress={() => setOpenSheet('type')} />
          )}
          <FilterChip label="Status" count={statusSel.size} onPress={() => setOpenSheet('status')} />
          {!straightOnly && (
            <FilterChip label="Due Date" count={dueDateSel.size} onPress={() => setOpenSheet('due')} />
          )}
          {anyFilter && (
            <PressableScale
              onPress={() => {
                setStatusSel(new Set())
                setDueDateSel(new Set())
                setTypeSel(new Set())
              }}
            >
              <Text className="px-1 font-sans-medium text-xs text-navy-700">Clear</Text>
            </PressableScale>
          )}
        </ScrollView>
        <View className="flex-row items-center justify-between">
          {/* Sort segmented control */}
          <View className="flex-row rounded-lg border border-slate-300 bg-white p-0.5">
            {[
              ['dueDate', 'Due Date'],
              ['txnDate', 'Txn Date'],
            ].map(([key, text]) => {
              const active = sortKey === key
              return (
                <PressableScale key={key} onPress={() => toggleSort(key)} haptic={false}>
                  <View className={`rounded-md px-2.5 py-1.5 ${active ? 'bg-navy-800' : ''}`}>
                    <Text
                      className={`font-sans-medium text-xs ${active ? 'text-white' : 'text-slate-600'}`}
                    >
                      {active ? `${text} ${sortDir === 'asc' ? '↑' : '↓'}` : text}
                    </Text>
                  </View>
                </PressableScale>
              )
            })}
          </View>
          {/* Hide-settled toggle */}
          <View className="flex-row items-center gap-2">
            <Text className="font-sans text-xs text-slate-600">Hide settled</Text>
            <Switch
              value={hideSettled}
              onValueChange={setHideSettled}
              trackColor={{ true: colors.navy800, false: '#cbd5e1' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>
      </FadeInView>

      {/* Summary header */}
      <View className="border-y border-slate-200 bg-white px-4 py-2.5">
        <Text className="font-sans-medium text-xs text-slate-600">
          {filtered.length} item{filtered.length === 1 ? '' : 's'} · outstanding{' '}
          <Text className="font-mono-semibold text-slate-900">{formatPeso(outstanding)}</Text>
        </Text>
      </View>

      {/* Rows */}
      {dataLoading ? (
        <View className="gap-2 p-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t: any) => t.id}
          renderItem={({ item }) => <TxnRow txn={item} today={today} showTxnDate />}
          initialNumToRender={15}
          windowSize={9}
          removeClippedSubviews
          className="bg-white"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
          }
          ListEmptyComponent={
            <EmptyState
              icon={<Clock size={20} color={colors.slate500} />}
              title="No transactions found"
              body={
                anyFilter
                  ? 'No payments match the selected filters.'
                  : hideSettled && myTxns.length > 0
                    ? "All your transactions are fully paid, refunded, or cancelled. Toggle 'Hide settled' to view them."
                    : emptyDefaultBody
              }
            />
          }
          contentContainerClassName="pb-8"
        />
      )}

      {/* Filter sheets — mounted only while open so each open starts from the
          CURRENT selection (a persistent instance kept a stale draft, which
          made Clear/prefilters look broken). */}
      {openSheet === 'type' && (
        <FilterSheet
          visible
          title="Filter by type"
          options={typeOptions}
          selected={typeSel}
          onChange={setTypeSel}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'status' && (
        <FilterSheet
          visible
          title="Filter by status"
          options={statusOptions}
          selected={statusSel}
          onChange={setStatusSel}
          onClose={() => setOpenSheet(null)}
        />
      )}
      {openSheet === 'due' && (
        <FilterSheet
          visible
          title="Filter by due date"
          options={dueDateOptions}
          selected={dueDateSel}
          onChange={setDueDateSel}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </View>
  )
}
