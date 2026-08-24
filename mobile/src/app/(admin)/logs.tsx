import { useMemo, useState } from 'react'
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as FileSystem from 'expo-file-system/legacy'
import { BarChart3, Check, Download, RotateCcw, Trash2 } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS } from '../../lib/transactions'
import Badge from '../../components/ui/Badge'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import SegmentedTabs from '../../components/ui/SegmentedTabs'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const csvEscape = (v: any) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function AdminLogs() {
  const { auditLog, archivedTransactions, restoreTransactions, users, purgeArchivedTransactions, purgeAuditEntries, refreshing, refreshData } =
    useApp()
  const router = useRouter()
  const [tab, setTab] = useState('audit')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? id

  const auditList = useMemo(() => {
    const q = query.trim().toLowerCase()
    return auditLog.filter((e: any) => q === '' || `${e.actor} ${e.detail} ${e.action}`.toLowerCase().includes(q))
  }, [auditLog, query])

  const switchTab = (v: string) => {
    setTab(v)
    setSelected(new Set())
  }
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const purge = () => {
    if (selected.size === 0) return
    const ids = [...selected]
    Alert.alert(
      'Delete permanently',
      `Permanently delete ${ids.length} ${tab === 'archives' ? 'archived record' : 'audit entr'}${tab === 'archives' ? (ids.length === 1 ? '' : 's') : ids.length === 1 ? 'y' : 'ies'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (tab === 'archives') await purgeArchivedTransactions(ids)
            else await purgeAuditEntries(ids)
            setSelected(new Set())
          },
        },
      ],
    )
  }

  const exportCSV = async () => {
    let csv: string
    if (tab === 'archives') {
      const header = 'Archived On,Borrower,Item Description,Amount,Txn Date,Due Date,Date Paid,Status'
      const lines = archivedTransactions.map((t: any) =>
        [t.archivedAt, nameOf(t.userId), t.description, t.amount, t.txnDate, t.dueDate, t.datePaid ?? '', STATUS_LABELS[t.status]].map(csvEscape).join(','),
      )
      csv = [header, ...lines].join('\n')
    } else {
      const header = 'Timestamp,Actor,Action,Detail'
      const lines = auditList.map((e: any) => [e.at, e.actor, e.action, e.detail].map(csvEscape).join(','))
      csv = [header, ...lines].join('\n')
    }
    try {
      if (Platform.OS === 'ios') {
        const uri = `${FileSystem.cacheDirectory}${tab}-${toISODate(new Date())}.csv`
        await FileSystem.writeAsStringAsync(uri, csv)
        await Share.share({ url: uri })
      } else {
        await Share.share({ message: csv })
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Reports & Logs</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">Full audit trail of activity, plus archived ledger records.</Text>
        </FadeInView>

        <FadeInView delay={40} className="flex-row gap-2">
          <PressableScale onPress={() => router.push('/(admin)/analytics')} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3">
            <BarChart3 size={16} color={colors.navy700} />
            <Text className="font-sans-medium text-sm text-navy-700">Analytics</Text>
          </PressableScale>
          <PressableScale onPress={exportCSV} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3">
            <Download size={16} color={colors.navy700} />
            <Text className="font-sans-medium text-sm text-navy-700">Export CSV</Text>
          </PressableScale>
        </FadeInView>

        <FadeInView delay={80}>
          <SegmentedTabs
            tabs={[{ value: 'audit', label: 'Audit Trail' }, { value: 'archives', label: `Archives (${archivedTransactions.length})` }]}
            active={tab}
            onChange={switchTab}
          />
        </FadeInView>

        {selected.size > 0 ? (
          <FadeInView className="flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <Text className="font-sans-medium text-sm text-red-900">{selected.size} selected</Text>
            <PressableScale onPress={purge} className="flex-row items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5">
              <Trash2 size={14} color="#ffffff" />
              <Text className="font-sans-semibold text-xs text-white">Delete permanently</Text>
            </PressableScale>
          </FadeInView>
        ) : null}

        {tab === 'audit' ? (
          <FadeInView delay={120}>
            <Card>
              <CardHeader title="Audit Trail" subtitle={`${auditList.length} entries`} />
              <View className="px-4 pb-2">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search actor or detail…"
                  placeholderTextColor={colors.slate400}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
                />
              </View>
              {auditList.length === 0 ? (
                <EmptyState title="No matching entries" body="Adjust your search." />
              ) : (
                auditList.slice(0, 200).map((e: any, idx: number) => (
                  <Pressable
                    key={e.id}
                    onLongPress={() => toggle(e.id)}
                    onPress={() => (selected.size > 0 ? toggle(e.id) : undefined)}
                    className={`flex-row items-start gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''} ${selected.has(e.id) ? 'bg-red-50/50' : ''}`}
                  >
                    {selected.size > 0 ? (
                      <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${selected.has(e.id) ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>
                        {selected.has(e.id) ? <Check size={13} color="#ffffff" /> : null}
                      </View>
                    ) : null}
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans text-sm text-slate-700">{e.detail}</Text>
                      <Text className="font-sans text-xs text-slate-400">
                        {e.actor} · {e.at} · <Text className="font-mono text-[11px] uppercase">{e.action}</Text>
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
              {auditList.length > 0 ? (
                <Text className="px-4 py-2 text-center font-sans text-[11px] text-slate-400">Long-press an entry to select for deletion.</Text>
              ) : null}
            </Card>
          </FadeInView>
        ) : (
          <FadeInView delay={120}>
            <Card>
              <CardHeader title="Archived Transactions" subtitle="Records deleted from Overall Transactions. Restore puts them back." />
              {archivedTransactions.length === 0 ? (
                <EmptyState icon={<Trash2 size={20} color={colors.slate500} />} title="Archive is empty" body="Deleted ledger records appear here." />
              ) : (
                archivedTransactions.map((t: any, idx: number) => (
                  <Pressable
                    key={t.id}
                    onLongPress={() => toggle(t.id)}
                    onPress={() => (selected.size > 0 ? toggle(t.id) : undefined)}
                    className={`flex-row items-center gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''} ${selected.has(t.id) ? 'bg-red-50/50' : ''}`}
                  >
                    {selected.size > 0 ? (
                      <View className={`h-5 w-5 items-center justify-center rounded-md border ${selected.has(t.id) ? 'border-red-500 bg-red-500' : 'border-slate-300'}`}>
                        {selected.has(t.id) ? <Check size={13} color="#ffffff" /> : null}
                      </View>
                    ) : null}
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-sm text-slate-900" numberOfLines={1}>{nameOf(t.userId)}</Text>
                      <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
                        {t.description} · Due {formatDate(t.dueDate)} · archived {formatDate(t.archivedAt)}
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(t.amount)}</Text>
                      <Badge status={t.status} label={STATUS_LABELS[t.status]} />
                    </View>
                    {selected.size === 0 ? (
                      <PressableScale onPress={() => restoreTransactions([t.id])} className="flex-row items-center gap-1 rounded-lg bg-navy-50 px-2.5 py-1.5" accessibilityLabel="Restore">
                        <RotateCcw size={13} color={colors.navy700} />
                        <Text className="font-sans-medium text-xs text-navy-700">Restore</Text>
                      </PressableScale>
                    ) : null}
                  </Pressable>
                ))
              )}
            </Card>
          </FadeInView>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
