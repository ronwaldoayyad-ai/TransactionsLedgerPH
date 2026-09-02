import { memo, useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as FileSystem from 'expo-file-system/legacy'
import * as DocumentPicker from 'expo-document-picker'
import { Check, Download, SlidersHorizontal, Upload } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus } from '../../lib/transactions'
import { parseCSV, parseCSVAmount, parseCSVDate } from '../../lib/csv'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { colors } from '../../theme'

const STATUS_OPTS = ['paid', 'unpaid', 'past_due', 'refunded', 'cancelled']
const EXPORT_HEADERS = ['Borrower', 'Txn Date', 'Item Description', 'Amount', 'Type', 'Due Date', 'Date Paid', 'Status']

const csvEscape = (v: any) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function AdminTransactions() {
  const { users, transactions, setTransactionStatus, updateTransaction, archiveTransactions, importTransactions, refreshing, refreshData } = useApp()
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const today = toISODate(new Date())
  // O(1) name lookup. Previously each rendered row ran users.find(), turning the
  // list into O(rows × users) work on every render — a Map makes it O(rows).
  const nameById = useMemo(
    () => new Map<string, string>(users.map((u: any) => [u.id, u.name] as [string, string])),
    [users],
  )
  const nameOf = (id: string): string => nameById.get(id) ?? id

  const [query, setQuery] = useState('')
  const [borrowerFilter, setBorrowerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [hideSettled, setHideSettled] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [actionTxn, setActionTxn] = useState<any>(null)
  const [importing, setImporting] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions
      .filter((t: any) => {
        const eff = effectiveStatus(t, today)
        if (borrowerFilter !== 'all' && t.userId !== borrowerFilter) return false
        if (statusFilter !== 'all' && eff !== statusFilter) return false
        if (typeFilter !== 'all' && t.type !== typeFilter) return false
        if (hideSettled && ['paid', 'refunded', 'cancelled'].includes(eff)) return false
        if (q) {
          const hay = `${nameOf(t.userId)} ${t.description} ${t.dueDate}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate) || nameOf(a.userId).localeCompare(nameOf(b.userId)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, query, borrowerFilter, statusFilter, typeFilter, hideSettled, today, users])

  const total = rows.reduce((s: number, t: any) => s + t.amount, 0)

  const setStatus = (status: string) => {
    if (!actionTxn) return
    setTransactionStatus([actionTxn.id], status)
    setActionTxn(null)
  }
  const archive = () => {
    if (!actionTxn) return
    archiveTransactions([actionTxn.id])
    setActionTxn(null)
  }

  const exportCSV = async () => {
    const lines = [EXPORT_HEADERS.join(',')]
    rows.forEach((t: any) => {
      lines.push(
        [nameOf(t.userId), t.txnDate, t.description, t.amount, t.type, t.dueDate, t.datePaid ?? '', effectiveStatus(t, today)]
          .map(csvEscape)
          .join(','),
      )
    })
    const csv = lines.join('\n')
    try {
      if (Platform.OS === 'ios') {
        // iOS share sheet accepts a file URL (nicer for CSV apps).
        const uri = `${FileSystem.cacheDirectory}transactions-${Date.now()}.csv`
        await FileSystem.writeAsStringAsync(uri, csv)
        await Share.share({ url: uri })
      } else {
        await Share.share({ message: csv })
      }
    } catch {
      /* cancelled */
    }
  }

  const importCSV = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', '*/*'] })
    if (res.canceled || !res.assets?.[0]) return
    setImporting(true)
    try {
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri)
      const { headers, rows: dataRows } = parseCSV(text)
      const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
      const ci = {
        borrower: col('Borrower'),
        txnDate: col('Txn Date'),
        desc: col('Item Description'),
        amount: col('Amount'),
        type: col('Type'),
        due: col('Due Date'),
        paid: col('Date Paid'),
        status: col('Status'),
      }
      const nameToId = new Map(borrowers.map((b: any) => [b.name.toLowerCase(), b.id]))
      let seq = Date.now()
      const parsed = dataRows
        .map((r) => {
          const uid = nameToId.get(String(r[ci.borrower] ?? '').trim().toLowerCase())
          if (!uid) return null
          const status = String(r[ci.status] ?? 'unpaid').trim().toLowerCase().replace(/\s+/g, '_') || 'unpaid'
          return {
            id: `imp-${seq++}`,
            userId: uid,
            n: 1,
            description: r[ci.desc] ?? '',
            amount: parseCSVAmount(r[ci.amount]) ?? 0,
            type: r[ci.type] ?? 'Installment',
            txnDate: parseCSVDate(r[ci.txnDate]) ?? today,
            dueDate: parseCSVDate(r[ci.due]) ?? today,
            status,
            datePaid: parseCSVDate(r[ci.paid]),
          }
        })
        .filter(Boolean)
      if (parsed.length === 0) {
        Alert.alert('Nothing imported', 'No rows matched a known borrower. Check the Borrower column.')
      } else {
        const out = await importTransactions(parsed)
        if (out?.error) Alert.alert('Import failed', out.error)
        else Alert.alert('Imported', `${parsed.length} record(s) added to the ledger.`)
      }
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not read the file.')
    }
    setImporting(false)
  }

  const activeFilterCount = [borrowerFilter, statusFilter, typeFilter].filter((f) => f !== 'all').length

  // Cap the rendered window; the footer nudges the admin to narrow filters past
  // 200. FlatList only mounts the on-screen slice, so scrolling stays smooth
  // even at the cap (the old ScrollView mounted all 200 rows up front).
  const visibleRows = useMemo(() => rows.slice(0, 200), [rows])

  const listHeader = (
    <View className="gap-4 pb-4">
      <FadeInView className="px-1">
        <Text className="font-sans-bold text-2xl text-slate-900">Overall Transactions</Text>
        <Text className="mt-0.5 font-sans text-sm text-slate-500">
          Every installment across all borrowers. Status set here syncs to borrower views.
        </Text>
      </FadeInView>

      <FadeInView delay={40} className="flex-row gap-2">
        <PressableScale onPress={exportCSV} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3">
          <Download size={16} color={colors.navy700} />
          <Text className="font-sans-medium text-sm text-navy-700">Export CSV</Text>
        </PressableScale>
        <PressableScale onPress={importCSV} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3">
          <Upload size={16} color={colors.navy700} />
          <Text className="font-sans-medium text-sm text-navy-700">{importing ? 'Importing…' : 'Import CSV'}</Text>
        </PressableScale>
      </FadeInView>

      <View className="overflow-hidden rounded-t-2xl border border-b-0 border-slate-200/70 bg-white">
        <View className="flex-row items-center gap-2 px-4 pt-4">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search borrower or item…"
            placeholderTextColor={colors.slate400}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
          />
          <Pressable onPress={() => setFiltersOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2.5" accessibilityLabel="Filters">
            <SlidersHorizontal size={18} color={activeFilterCount ? colors.navy700 : colors.slate400} />
          </Pressable>
        </View>
        <View className="flex-row items-center justify-between px-4 py-2.5">
          <Text className="font-sans text-xs text-slate-500">{rows.length} record{rows.length === 1 ? '' : 's'}</Text>
          <View className="flex-row items-center gap-2">
            <Text className="font-sans text-xs text-slate-500">Hide settled</Text>
            <Switch value={hideSettled} onValueChange={setHideSettled} trackColor={{ true: colors.navy800, false: '#cbd5e1' }} thumbColor="#ffffff" />
          </View>
        </View>
      </View>
    </View>
  )

  const listFooter =
    rows.length === 0 ? null : (
      <View className="overflow-hidden rounded-b-2xl border border-t-0 border-slate-200/70 bg-white">
        <View className="flex-row items-center justify-between border-t border-slate-200 bg-navy-50/70 px-4 py-3">
          <Text className="font-sans-semibold text-xs text-navy-900">TOTAL ({rows.length})</Text>
          <Text className="font-mono-semibold text-sm text-navy-900">{formatPeso(total)}</Text>
        </View>
        {rows.length > 200 ? (
          <Text className="px-4 py-2 text-center font-sans text-xs text-slate-400">Showing first 200 — narrow the filters to see more.</Text>
        ) : null}
      </View>
    )

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <FlatList
        data={visibleRows}
        keyExtractor={(t: any) => t.id}
        renderItem={({ item, index }) => (
          <AdminTxnRow txn={item} name={nameOf(item.userId)} today={today} first={index === 0} onPress={setActionTxn} />
        )}
        initialNumToRender={15}
        windowSize={9}
        removeClippedSubviews
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListEmptyComponent={
          <View className="overflow-hidden rounded-b-2xl border border-t-0 border-slate-200/70 bg-white">
            <EmptyState title="No transactions match" body="Adjust the filters or search." />
          </View>
        }
      />

      {/* Filters sheet */}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[80%] rounded-t-3xl bg-white p-5">
            <Text className="mb-3 font-sans-bold text-lg text-slate-900">Filters</Text>
            <ScrollView>
              <FilterGroup
                title="Borrower"
                options={[{ value: 'all', label: 'All borrowers' }, ...borrowers.map((b: any) => ({ value: b.id, label: b.name }))]}
                selected={borrowerFilter}
                onSelect={setBorrowerFilter}
              />
              <FilterGroup
                title="Status"
                options={[{ value: 'all', label: 'All statuses' }, ...STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]}
                selected={statusFilter}
                onSelect={setStatusFilter}
              />
              <FilterGroup
                title="Type"
                options={[{ value: 'all', label: 'All types' }, { value: 'Installment', label: 'Installment' }, { value: 'Straight', label: 'Straight' }]}
                selected={typeFilter}
                onSelect={setTypeFilter}
              />
              <View className="h-2" />
            </ScrollView>
            <Button onPress={() => setFiltersOpen(false)}>Apply</Button>
          </View>
        </View>
      </Modal>

      {/* Status action sheet */}
      <Modal visible={!!actionTxn} transparent animationType="slide" onRequestClose={() => setActionTxn(null)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setActionTxn(null)}>
          <View className="rounded-t-3xl bg-white p-4 pb-8">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900" numberOfLines={1}>
              {actionTxn ? `${nameOf(actionTxn.userId)} · ${formatPeso(actionTxn.amount)}` : ''}
            </Text>
            {actionTxn && (
              <View className="mb-3 px-2">
                <Text className="mb-1 font-sans-medium text-xs uppercase text-slate-400">Item description</Text>
                <DescriptionEditor
                  key={actionTxn.id}
                  txn={actionTxn}
                  onSave={(desc) => {
                    updateTransaction(actionTxn.id, { description: desc })
                    setActionTxn((prev: any) => (prev ? { ...prev, description: desc } : prev))
                  }}
                />
              </View>
            )}
            <Text className="mb-2 px-2 font-sans-medium text-xs uppercase text-slate-400">Set status</Text>
            {STATUS_OPTS.map((s) => (
              <Pressable key={s} onPress={() => setStatus(s)} className="rounded-xl px-4 py-3 active:bg-slate-50">
                <Text className="font-sans-medium text-[15px] text-slate-800">{STATUS_LABELS[s]}</Text>
              </Pressable>
            ))}
            <Pressable onPress={archive} className="mt-1 rounded-xl px-4 py-3 active:bg-red-50">
              <Text className="font-sans-medium text-[15px] text-red-600">Delete (move to Archives)</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

// Inline-editable Item Description for the action sheet. Commits on blur or the
// keyboard "done" key; empty input reverts. Local draft state keeps the shared
// ledger from updating on every keystroke.
function DescriptionEditor({ txn, onSave }: { txn: any; onSave: (desc: string) => void }) {
  const [value, setValue] = useState<string>(txn.description ?? '')
  const [lastId, setLastId] = useState(txn.id)
  if (txn.id !== lastId) {
    setLastId(txn.id)
    setValue(txn.description ?? '')
  }
  const commit = () => {
    const next = value.trim()
    if (next && next !== txn.description) onSave(next)
    else if (!next) setValue(txn.description ?? '')
  }
  return (
    <TextInput
      value={value}
      onChangeText={setValue}
      onBlur={commit}
      onSubmitEditing={commit}
      returnKeyType="done"
      placeholder="Item description"
      className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-sans text-[15px] text-slate-900"
    />
  )
}

// Memoized so that state changes on the screen (search text, filter sheet,
// selected action txn) don't re-render every visible row — only rows whose
// props actually change repaint. Pairs with FlatList virtualization.
const AdminTxnRow = memo(function AdminTxnRow({
  txn,
  name,
  today,
  first,
  onPress,
}: {
  txn: any
  name: string
  today: string
  first: boolean
  onPress: (t: any) => void
}) {
  const eff = effectiveStatus(txn, today)
  return (
    <Pressable
      onPress={() => onPress(txn)}
      className={`flex-row items-center gap-3 border-x border-slate-200/70 bg-white px-4 py-3 active:bg-slate-50 ${first ? '' : 'border-t border-t-slate-100'} ${eff === 'past_due' ? 'bg-red-50/50' : ''}`}
    >
      <View className="min-w-0 flex-1">
        <Text className="font-sans-semibold text-sm text-slate-900" numberOfLines={1}>{name}</Text>
        <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
          {txn.description} · Due {formatDate(txn.dueDate)}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(txn.amount)}</Text>
        <Badge status={eff} label={STATUS_LABELS[eff]} />
      </View>
    </Pressable>
  )
})

function FilterGroup({ title, options, selected, onSelect }: any) {
  return (
    <View className="mb-4">
      <Text className="mb-2 font-sans-semibold text-xs uppercase tracking-wide text-slate-500">{title}</Text>
      <View className="gap-1.5">
        {options.map((o: any) => (
          <Pressable
            key={o.value}
            onPress={() => onSelect(o.value)}
            className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${selected === o.value ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'}`}
          >
            <Text className="font-sans-medium text-sm text-slate-900">{o.label}</Text>
            {selected === o.value ? <Check size={16} color={colors.navy700} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  )
}
