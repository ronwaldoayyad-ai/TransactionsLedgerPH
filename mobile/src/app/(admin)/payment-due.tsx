import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { Check, RotateCcw } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { effectiveStatus, isReceivable } from '../../lib/transactions'
import { buildDueSummary } from '../../lib/paymentDueSummary'
import { PAYMENT_DUE_COLORS } from '../../lib/paymentDueConfig'
import { PaymentDueCards, PaymentDueBreakdown } from '../../components/PaymentDueCards'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors, fonts } from '../../theme'

const UPCOMING_LIMIT = 5

function CheckRow({ checked, onPress, children, trailing }: any) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 rounded-xl px-3 py-2.5 active:bg-slate-50">
      <View className={`h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-navy-700 bg-navy-700' : 'border-slate-300'}`}>
        {checked ? <Check size={14} color="#ffffff" /> : null}
      </View>
      <View className="min-w-0 flex-1">{children}</View>
      {trailing}
    </Pressable>
  )
}

export default function AdminPaymentDue() {
  const {
    users,
    transactions,
    paymentDueOverrides,
    savePaymentDueOverrides,
    clearPaymentDueOverride,
    clearAllPaymentDueOverrides,
    refreshing,
    refreshData,
  } = useApp()
  const today = toISODate(new Date())
  const borrowerName = (id: string) => users.find((u: any) => u.id === id)?.name ?? id

  const borrowers = useMemo(
    () => users.filter((u: any) => u.role === 'user').sort((a: any, b: any) => a.name.localeCompare(b.name)),
    [users],
  )
  const receivable = useMemo(() => transactions.filter((t: any) => isReceivable(t, today)), [transactions, today])
  const countByBorrower = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of receivable) m.set(t.userId, (m.get(t.userId) ?? 0) + 1)
    return m
  }, [receivable])
  const activeBorrowers = useMemo(
    () => borrowers.filter((b: any) => (countByBorrower.get(b.id) ?? 0) > 0),
    [borrowers, countByBorrower],
  )

  const validDatesFor = (borrowerSet: Set<string>) => {
    const map = new Map<string, 'past_due' | 'upcoming'>()
    for (const t of receivable) {
      if (!borrowerSet.has(t.userId)) continue
      map.set(t.dueDate, effectiveStatus(t, today) === 'past_due' ? 'past_due' : 'upcoming')
    }
    const all = [...map.entries()].map(([date, kind]) => ({ date, kind }))
    const pastDue = all.filter((d) => d.kind === 'past_due').sort((a, b) => a.date.localeCompare(b.date))
    const upcoming = all.filter((d) => d.kind === 'upcoming').sort((a, b) => a.date.localeCompare(b.date)).slice(0, UPCOMING_LIMIT)
    return [...pastDue, ...upcoming].sort((a, b) => a.date.localeCompare(b.date))
  }

  const [selectedBorrowers, setSelectedBorrowers] = useState<Set<string>>(() => new Set(activeBorrowers.map((b: any) => b.id)))
  const [selectedDates, setSelectedDates] = useState<Set<string>>(
    () => new Set(validDatesFor(new Set(activeBorrowers.map((b: any) => b.id))).map((d) => d.date)),
  )
  const [selectedNextDates, setSelectedNextDates] = useState<Set<string>>(() => new Set())
  const [previewActive, setPreviewActive] = useState(0)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const dateOptions = useMemo(() => validDatesFor(selectedBorrowers), [receivable, selectedBorrowers, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const pruneDates = (borrowerSet: Set<string>) => {
    const valid = new Set(validDatesFor(borrowerSet).map((d) => d.date))
    const prune = (prev: Set<string>) => {
      const next = new Set([...prev].filter((d) => valid.has(d)))
      return next.size === prev.size ? prev : next
    }
    setSelectedDates(prune)
    setSelectedNextDates(prune)
  }

  const toggleIn = (setter: any) => (v: string) =>
    setter((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  const toggleBorrower = (id: string) => {
    const next = new Set(selectedBorrowers)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedBorrowers(next)
    pruneDates(next)
  }

  const previewItems = useMemo(
    () => receivable.filter((t: any) => selectedBorrowers.has(t.userId) && selectedDates.has(t.dueDate)),
    [receivable, selectedBorrowers, selectedDates],
  )
  const previewNextItems = useMemo(
    () => receivable.filter((t: any) => selectedBorrowers.has(t.userId) && selectedNextDates.has(t.dueDate)),
    [receivable, selectedBorrowers, selectedNextDates],
  )
  const summary = useMemo(() => buildDueSummary(previewItems, today), [previewItems, today])
  const nextSummary = useMemo(() => buildDueSummary(previewNextItems, today), [previewNextItems, today])
  const hasNextPreview = selectedNextDates.size > 0
  const previewIndex = hasNextPreview ? previewActive : 0
  const previewSummary = previewIndex === 1 ? nextSummary : summary

  const activeOverrides = [...(paymentDueOverrides ?? [])]
    .filter((o: any) => (o.dueDates?.length ?? 0) > 0 || (o.nextDueDates?.length ?? 0) > 0)
    .sort((a: any, b: any) => borrowerName(a.borrowerId).localeCompare(borrowerName(b.borrowerId)))
  const totalForDates = (o: any, dates: string[]) =>
    receivable
      .filter((t: any) => t.userId === o.borrowerId && (dates ?? []).includes(t.dueDate))
      .reduce((s: number, t: any) => s + t.amount, 0)

  const rowsForSelection = () =>
    [...selectedBorrowers]
      .map((borrowerId) => {
        const mine = (set: Set<string>) => [
          ...new Set(receivable.filter((t: any) => t.userId === borrowerId && set.has(t.dueDate)).map((t: any) => t.dueDate)),
        ]
        return { borrowerId, dueDates: mine(selectedDates), nextDueDates: mine(selectedNextDates) }
      })
      .filter((r) => r.dueDates.length > 0 || r.nextDueDates.length > 0)

  const canApply = selectedBorrowers.size > 0 && (selectedDates.size > 0 || selectedNextDates.size > 0)
  const apply = async () => {
    if (!canApply || saving) return
    const rows = rowsForSelection()
    if (rows.length === 0) return setStatus('No matching dates for the selected borrowers.')
    setSaving(true)
    setStatus('Saving…')
    const ok = await savePaymentDueOverrides(rows)
    setSaving(false)
    setStatus(ok ? `Applied — ${rows.length} borrower${rows.length === 1 ? '' : 's'} pinned.` : 'Could not save — check your connection.')
  }
  const reset = () => {
    const allIds = new Set<string>(activeBorrowers.map((b: any) => b.id))
    setSelectedBorrowers(allIds)
    setSelectedDates(new Set(validDatesFor(allIds).map((d) => d.date)))
    setSelectedNextDates(new Set())
    setStatus('Selection reset.')
  }
  const clearOne = async (borrowerId: string) => {
    setSaving(true)
    const ok = await clearPaymentDueOverride(borrowerId)
    setSaving(false)
    setStatus(ok ? `Cleared ${borrowerName(borrowerId)}.` : 'Could not clear.')
  }
  const clearAll = async () => {
    setSaving(true)
    const ok = await clearAllPaymentDueOverrides()
    setSaving(false)
    setStatus(ok ? 'Cleared all overrides.' : 'Could not clear.')
  }

  const dateChip = (date: string) => {
    const kind = effectiveStatus({ dueDate: date, status: 'unpaid' }, today) === 'past_due' ? 'past_due' : 'upcoming'
    return (
      <View key={date} className={`rounded-full px-2 py-0.5 ${kind === 'past_due' ? 'bg-red-50' : 'bg-emerald-50'}`}>
        <Text className={`font-sans-medium text-xs ${kind === 'past_due' ? 'text-red-600' : 'text-emerald-700'}`}>{formatDate(date)}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Payment Due', headerTitleStyle: { fontFamily: fonts.sansSemibold }, headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <Text className="px-1 font-sans text-sm text-slate-500">
          Pin which due dates drive each borrower&apos;s Current and Next Payment Due cards.
        </Text>

        {/* Borrowers */}
        <Card>
          <CardHeader title="Borrowers" subtitle={`${selectedBorrowers.size} selected`} />
          <View className="p-2">
            {activeBorrowers.length === 0 ? (
              <Text className="px-3 py-6 text-center font-sans text-sm text-slate-500">No borrowers with outstanding installments.</Text>
            ) : (
              activeBorrowers.map((b: any) => (
                <CheckRow
                  key={b.id}
                  checked={selectedBorrowers.has(b.id)}
                  onPress={() => toggleBorrower(b.id)}
                  trailing={
                    <View className="h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5">
                      <Text className="font-sans-semibold text-xs text-slate-500">{countByBorrower.get(b.id) ?? 0}</Text>
                    </View>
                  }
                >
                  <Text className="font-sans-medium text-sm text-slate-900" numberOfLines={1}>{b.name}</Text>
                </CheckRow>
              ))
            )}
          </View>
        </Card>

        {/* Current dates */}
        <Card>
          <CardHeader title="Current Due Dates" subtitle={`${selectedDates.size} selected`} />
          <View className="p-2">
            {dateOptions.length === 0 ? (
              <Text className="px-3 py-6 text-center font-sans text-sm text-slate-500">
                {selectedBorrowers.size === 0 ? 'Select one or more borrowers first.' : 'No due dates for this selection.'}
              </Text>
            ) : (
              dateOptions.map(({ date, kind }) => (
                <CheckRow
                  key={date}
                  checked={selectedDates.has(date)}
                  onPress={() => toggleIn(setSelectedDates)(date)}
                  trailing={<Badge status={kind === 'past_due' ? 'past_due' : 'upcoming'} label={kind === 'past_due' ? 'past due' : 'upcoming'} />}
                >
                  <Text className="font-sans-medium text-sm text-slate-900">{formatDate(date)}</Text>
                </CheckRow>
              ))
            )}
          </View>
        </Card>

        {/* Next dates */}
        <Card>
          <CardHeader title="Next Due Dates" subtitle={`${selectedNextDates.size} selected · optional`} />
          <View className="p-2">
            {dateOptions.length === 0 ? (
              <Text className="px-3 py-6 text-center font-sans text-sm text-slate-500">
                {selectedBorrowers.size === 0 ? 'Select one or more borrowers first.' : 'No due dates for this selection.'}
              </Text>
            ) : (
              dateOptions.map(({ date, kind }) => (
                <CheckRow
                  key={date}
                  checked={selectedNextDates.has(date)}
                  onPress={() => toggleIn(setSelectedNextDates)(date)}
                  trailing={<Badge status={kind === 'past_due' ? 'past_due' : 'upcoming'} label={kind === 'past_due' ? 'past due' : 'upcoming'} />}
                >
                  <Text className="font-sans-medium text-sm text-slate-900">{formatDate(date)}</Text>
                </CheckRow>
              ))
            )}
          </View>
        </Card>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button onPress={apply} disabled={!canApply || saving} loading={saving} icon={<Check size={15} color="#ffffff" />}>
              {saving ? 'Saving…' : 'Apply'}
            </Button>
          </View>
          <View className="flex-1">
            <Button variant="secondary" onPress={reset} disabled={saving} icon={<RotateCcw size={15} color={colors.navy700} />}>Reset</Button>
          </View>
        </View>
        {status ? (
          <Text className="px-1 font-sans text-sm text-slate-500" accessibilityLiveRegion="polite">{status}</Text>
        ) : null}

        {/* Preview */}
        <Text className="mt-1 flex-row items-center px-1 font-sans-semibold text-xs uppercase tracking-wide text-slate-500">
          Borrower Preview
        </Text>
        <PaymentDueCards
          active={previewIndex}
          onActive={setPreviewActive}
          cards={
            hasNextPreview
              ? [
                  { summary, title: 'Current Payment Due', bg: PAYMENT_DUE_COLORS.current, emptyText: 'No payments selected' },
                  { summary: nextSummary, title: 'Next Payment Due', bg: PAYMENT_DUE_COLORS.next, emptyText: 'No next payments selected' },
                ]
              : [{ summary, title: 'Current Payment Due', bg: PAYMENT_DUE_COLORS.current, emptyText: 'No payments selected' }]
          }
        />
        <PaymentDueBreakdown
          summary={previewSummary}
          label={previewIndex === 1 ? 'Next' : 'Current'}
          accent={previewIndex === 1 ? PAYMENT_DUE_COLORS.next : PAYMENT_DUE_COLORS.current}
        />

        {/* Current overrides */}
        <Card>
          <CardHeader
            title="Current Overrides"
            subtitle={`${activeOverrides.length} active`}
            action={
              activeOverrides.length > 0 ? (
                <Pressable onPress={clearAll} disabled={saving} hitSlop={8}>
                  <Text className="font-sans-medium text-sm text-red-600">Clear all</Text>
                </Pressable>
              ) : undefined
            }
          />
          {activeOverrides.length === 0 ? (
            <Text className="px-5 py-6 text-center font-sans text-sm text-slate-500">
              None pinned. Select borrowers and dates above, then Apply.
            </Text>
          ) : (
            activeOverrides.map((o: any, idx: number) => {
              const cur = [...(o.dueDates ?? [])].sort((a: string, b: string) => a.localeCompare(b))
              const nxt = [...(o.nextDueDates ?? [])].sort((a: string, b: string) => a.localeCompare(b))
              return (
                <View key={o.borrowerId} className={`px-5 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sans-semibold text-[15px] text-slate-900">{borrowerName(o.borrowerId)}</Text>
                    <Pressable onPress={() => clearOne(o.borrowerId)} disabled={saving} className="rounded-lg border border-slate-200 px-3 py-1.5 active:bg-red-50">
                      <Text className="font-sans-medium text-sm text-slate-600">Clear</Text>
                    </Pressable>
                  </View>
                  {cur.length > 0 ? (
                    <View className="mt-2">
                      <View className="mb-1 flex-row items-center gap-1.5">
                        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: PAYMENT_DUE_COLORS.current }} />
                        <Text className="font-sans-semibold text-[11px] uppercase text-slate-400">Current · {formatPeso(totalForDates(o, o.dueDates))}</Text>
                      </View>
                      <View className="flex-row flex-wrap gap-1.5">{cur.map(dateChip)}</View>
                    </View>
                  ) : null}
                  {nxt.length > 0 ? (
                    <View className="mt-2">
                      <View className="mb-1 flex-row items-center gap-1.5">
                        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: PAYMENT_DUE_COLORS.next }} />
                        <Text className="font-sans-semibold text-[11px] uppercase text-slate-400">Next · {formatPeso(totalForDates(o, o.nextDueDates))}</Text>
                      </View>
                      <View className="flex-row flex-wrap gap-1.5">{nxt.map(dateChip)}</View>
                    </View>
                  ) : null}
                </View>
              )
            })
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}
