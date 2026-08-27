import { useMemo, useState } from 'react'
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { WebView } from 'react-native-webview'
import { Download, FileText, X } from 'lucide-react-native'
import { useInvoices } from '../context/InvoicesContext'
import { formatDate, formatPeso } from '../lib/amortization'
import { buildInvoiceHtml } from '../lib/invoiceHtml'
import { shareInvoicePdf } from '../lib/invoicePrint'
import { INVOICE_STATUS_META, invoiceStatusMeta } from '../lib/invoice'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import FadeInView from '../components/ui/FadeInView'
import PressableScale from '../components/ui/PressableScale'
import EmptyState from '../components/ui/EmptyState'
import FilterSheet, { FilterChip } from '../components/ui/FilterSheet'
import { Card, CardHeader } from '../components/ui/Card'
import { colors, fonts } from '../theme'

const STATUS_RANK: Record<string, number> = { draft: 0, assigned: 1, upcoming: 2, partial: 3, past_due: 4, settled: 5 }

const toPdf = (inv: any) => ({
  invoiceNumber: inv.invoiceNumber,
  invoiceDate: inv.invoiceDate,
  dueDate: inv.dueDate,
  billedToName: inv.billedToName,
  lineItems: inv.lineItems,
  subtotal: inv.subtotal,
  amountPaid: inv.amountPaid,
  totalDue: inv.totalDue,
})

// Borrower view: read-only list of invoices assigned to them (RLS-scoped), with
// preview (WebView) and download (share the PDF via expo-print).
export default function BorrowerInvoices() {
  const { invoices, loading, refreshInvoices } = useInvoices()
  const [preview, setPreview] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [statusSel, setStatusSel] = useState<Set<string>>(() => new Set())
  const [sortKey, setSortKey] = useState<'invoiceDate' | 'dueDate' | 'status'>('invoiceDate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [sheetOpen, setSheetOpen] = useState(false)
  const toggleSort = (k: 'invoiceDate' | 'dueDate' | 'status') => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return invoices
      .filter((inv: any) => {
        if (statusSel.size > 0 && !statusSel.has(inv.status)) return false
        if (q && !String(inv.invoiceNumber).toLowerCase().includes(q)) return false
        return true
      })
      .sort((a: any, b: any) => {
        let cmp: number
        if (sortKey === 'dueDate') cmp = String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
        else if (sortKey === 'status') cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0)
        else cmp = String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || ''))
        return (cmp || String(a.invoiceNumber).localeCompare(String(b.invoiceNumber))) * dir
      })
  }, [invoices, query, statusSel, sortKey, sortDir])

  const sortLabel: Record<string, string> = { invoiceDate: 'Issued', dueDate: 'Due', status: 'Status' }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'My Invoices', headerTitleStyle: { fontFamily: fonts.sansSemibold } }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshInvoices} tintColor={colors.navy600} />}
      >
        <FadeInView>
          <Card>
            <CardHeader
              title="Invoices"
              subtitle={invoices.length === visible.length ? `${invoices.length} issued` : `${visible.length} of ${invoices.length}`}
            />
            {invoices.length > 0 && (
              <View className="gap-2.5 px-4 pb-1 pt-1">
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search invoice no…"
                  placeholderTextColor={colors.slate400}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
                />
                <View className="flex-row items-center justify-between">
                  <FilterChip label="Status" count={statusSel.size} onPress={() => setSheetOpen(true)} />
                  <View className="flex-row rounded-lg border border-slate-300 bg-white p-0.5">
                    {(['invoiceDate', 'dueDate', 'status'] as const).map((k) => {
                      const active = sortKey === k
                      return (
                        <Pressable key={k} onPress={() => toggleSort(k)} className={`rounded-md px-2 py-1.5 ${active ? 'bg-navy-800' : ''}`}>
                          <Text className={`font-sans-medium text-xs ${active ? 'text-white' : 'text-slate-600'}`}>
                            {sortLabel[k]}
                            {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              </View>
            )}
            {invoices.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} color={colors.slate500} />}
                title="No invoices yet"
                body="When your administrator issues an invoice, it will appear here to view and download."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} color={colors.slate500} />}
                title="No matching invoices"
                body="Adjust the search, filter, or sort."
              />
            ) : (
              visible.map((inv: any, idx: number) => (
                <View key={inv.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono text-xs text-slate-500">{inv.invoiceNumber}</Text>
                      <Text className="font-sans text-xs text-slate-500">
                        {formatDate(inv.invoiceDate)}{inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(inv.totalDue)}</Text>
                      <Badge status={invoiceStatusMeta(inv.status).badge} label={invoiceStatusMeta(inv.status).label} />
                    </View>
                  </View>
                  <View className="mt-2.5 flex-row gap-1.5">
                    <PressableScale onPress={() => setPreview(inv)} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2">
                      <FileText size={14} color={colors.slate500} />
                      <Text className="font-sans-medium text-xs text-slate-600">View</Text>
                    </PressableScale>
                    <PressableScale onPress={() => shareInvoicePdf(toPdf(inv))} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-navy-800 py-2">
                      <Download size={14} color="#ffffff" />
                      <Text className="font-sans-semibold text-xs text-white">Download</Text>
                    </PressableScale>
                  </View>
                </View>
              ))
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="flex-row items-center justify-between border-b border-slate-200 px-4 py-3">
            <Text className="font-sans-bold text-base text-slate-900">Invoice {preview?.invoiceNumber}</Text>
            <Pressable onPress={() => setPreview(null)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
          </View>
          {preview ? <WebView originWhitelist={['*']} source={{ html: buildInvoiceHtml(toPdf(preview)) }} style={{ flex: 1 }} /> : null}
          <View className="border-t border-slate-200 p-3">
            <Button onPress={() => preview && shareInvoicePdf(toPdf(preview))} icon={<Download size={15} color="#ffffff" />}>Download PDF</Button>
          </View>
        </SafeAreaView>
      </Modal>

      {sheetOpen && (
        <FilterSheet
          visible
          title="Filter by status"
          options={Object.entries(INVOICE_STATUS_META)
            .filter(([value]) => value !== 'draft')
            .map(([value, meta]) => ({ value, label: (meta as any).label }))}
          selected={statusSel}
          onChange={setStatusSel}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </SafeAreaView>
  )
}
