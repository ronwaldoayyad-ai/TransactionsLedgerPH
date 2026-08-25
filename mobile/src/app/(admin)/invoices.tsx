import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { Check, ChevronDown, Download, FileText, Send, Trash2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useInvoices } from '../../context/InvoicesContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { borrowerDueDates, buildLineItems, computeInvoiceTotals } from '../../lib/invoice'
import { buildInvoiceHtml } from '../../lib/invoiceHtml'
import { shareInvoicePdf } from '../../lib/invoicePrint'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

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

export default function AdminInvoices() {
  const { users, transactions, refreshing, refreshData } = useApp()
  const { invoices, createInvoice, assignInvoice, deleteInvoice } = useInvoices()
  const today = toISODate(new Date())
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? id

  const [userId, setUserId] = useState('')
  const [dueSel, setDueSel] = useState<Set<string>>(new Set())
  const [invoiceDueDate, setInvoiceDueDate] = useState(today)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [borrowerPicker, setBorrowerPicker] = useState(false)
  const [duePicker, setDuePicker] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  const dueOptions = useMemo(() => (userId ? borrowerDueDates(transactions, userId) : []), [transactions, userId])
  const lineItems = useMemo(
    () => (userId ? buildLineItems(transactions, userId, today, [...dueSel]) : []),
    [transactions, userId, today, dueSel],
  )
  const totals = useMemo(() => computeInvoiceTotals(lineItems), [lineItems])

  const generate = async () => {
    if (!userId) return setError('Select a borrower.')
    if (dueSel.size === 0) return setError('Select at least one due date to include.')
    if (!invoiceDueDate) return setError('Set the invoice Due Date.')
    if (lineItems.length === 0) return setError('No transactions match the selected due dates.')
    setError('')
    setBusy(true)
    const { invoice, error: err } = await createInvoice({
      userId,
      billedToName: nameOf(userId),
      dueDate: invoiceDueDate,
      selectedDueDates: [...dueSel].sort(),
      subtotal: totals.subtotal,
      amountPaid: totals.amountPaid,
      processingFee: 0,
      totalDue: totals.totalDue,
      lineItems,
    })
    setBusy(false)
    if (err) return setError(err)
    if (invoice) {
      setPreview(invoice)
      setUserId('')
      setDueSel(new Set())
      setInvoiceDueDate(today)
    }
  }

  const doAssign = async (inv: any) => {
    setBusy(true)
    await assignInvoice(inv.id)
    setBusy(false)
    setPreview((p: any) => (p && p.id === inv.id ? { ...p, status: 'assigned' } : p))
  }

  const confirmDelete = (inv: any) =>
    Alert.alert('Delete invoice?', `Permanently delete ${inv.invoiceNumber}? If assigned, the borrower loses access.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteInvoice(inv.id) },
    ])

  const toggleDue = (d: string) =>
    setDueSel((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Invoices</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Generate a borrower statement, preview the PDF, then assign it so they can view and download it.
          </Text>
        </FadeInView>

        {/* Generator */}
        <FadeInView delay={60}>
          <Card>
            <CardHeader title="Generate Invoice" />
            <View className="gap-3 px-4 py-4">
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Borrower</Text>
                <Pressable onPress={() => setBorrowerPicker(true)} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <Text className="font-sans-medium text-sm text-slate-900">{userId ? nameOf(userId) : 'Select a borrower…'}</Text>
                  <ChevronDown size={18} color={colors.slate400} />
                </Pressable>
              </View>
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Due Date(s) to include</Text>
                <Pressable onPress={() => (userId ? setDuePicker(true) : setError('Select a borrower first.'))} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <Text className="font-sans-medium text-sm text-slate-900">
                    {dueSel.size ? `${dueSel.size} due date${dueSel.size === 1 ? '' : 's'} selected` : 'Select due dates'}
                  </Text>
                  <ChevronDown size={18} color={colors.slate400} />
                </Pressable>
              </View>
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Invoice Due Date (header)</Text>
                <TextInput value={invoiceDueDate} onChangeText={setInvoiceDueDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} className={`${input} font-mono`} />
              </View>

              {userId ? (
                <View className="gap-1 rounded-xl bg-slate-50 p-4">
                  <TotalRow k={`Line items`} v={`${lineItems.length}`} />
                  <TotalRow k="Subtotal (unpaid)" v={formatPeso(totals.subtotal)} />
                  <TotalRow k="Amount Paid to Date" v={formatPeso(totals.amountPaid)} />
                  <View className="border-t border-slate-200 pt-1.5">
                    <TotalRow k="Total Amount Due" v={formatPeso(totals.totalDue)} strong />
                  </View>
                </View>
              ) : null}

              {error ? <Text className="rounded-xl bg-red-50 px-3 py-2.5 font-sans text-sm text-red-700">{error}</Text> : null}
              <Button variant="gold" onPress={generate} loading={busy} disabled={busy} icon={<FileText size={15} color="#ffffff" />}>
                {busy ? 'Generating…' : 'Generate & Preview'}
              </Button>
            </View>
          </Card>
        </FadeInView>

        {/* List */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Generated Invoices" subtitle={`${invoices.length} total`} />
            {invoices.length === 0 ? (
              <EmptyState icon={<FileText size={20} color={colors.slate500} />} title="No invoices yet" body="Generate one above to get started." />
            ) : (
              invoices.map((inv: any, idx: number) => (
                <View key={inv.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono text-xs text-slate-500">{inv.invoiceNumber}</Text>
                      <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>{inv.billedToName || nameOf(inv.userId)}</Text>
                      <Text className="font-sans text-xs text-slate-500">
                        {formatDate(inv.invoiceDate)}{inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(inv.totalDue)}</Text>
                      <View className={`rounded-full px-2.5 py-1 ${inv.status === 'assigned' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        <Text className={`font-sans-semibold text-[10px] uppercase ${inv.status === 'assigned' ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {inv.status === 'assigned' ? 'Assigned' : 'Draft'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View className="mt-2.5 flex-row gap-1.5">
                    <ActBtn onPress={() => setPreview(inv)} bg="bg-slate-100"><FileText size={14} color={colors.slate500} /><Text className="font-sans-medium text-xs text-slate-600">Preview</Text></ActBtn>
                    <ActBtn onPress={() => shareInvoicePdf(toPdf(inv))} bg="bg-navy-50"><Download size={14} color={colors.navy700} /><Text className="font-sans-medium text-xs text-navy-700">Download</Text></ActBtn>
                    {inv.status === 'draft' ? (
                      <ActBtn onPress={() => doAssign(inv)} bg="bg-emerald-50"><Check size={14} color="#059669" /><Text className="font-sans-medium text-xs text-emerald-700">Assign</Text></ActBtn>
                    ) : null}
                    <ActBtn onPress={() => confirmDelete(inv)} bg="bg-red-50"><Trash2 size={14} color="#dc2626" /><Text className="font-sans-medium text-xs text-red-600">Delete</Text></ActBtn>
                  </View>
                </View>
              ))
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Preview modal (WebView) */}
      <Modal visible={!!preview} animationType="slide" onRequestClose={() => setPreview(null)}>
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="flex-row items-center justify-between border-b border-slate-200 px-4 py-3">
            <Text className="font-sans-bold text-base text-slate-900">Invoice {preview?.invoiceNumber}</Text>
            <Pressable onPress={() => setPreview(null)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
          </View>
          {preview ? <WebView originWhitelist={['*']} source={{ html: buildInvoiceHtml(toPdf(preview)) }} style={{ flex: 1 }} /> : null}
          <View className="flex-row gap-2 border-t border-slate-200 p-3">
            <View className="flex-1">
              <Button variant="secondary" onPress={() => preview && shareInvoicePdf(toPdf(preview))} icon={<Download size={15} color={colors.navy700} />}>Download</Button>
            </View>
            {preview?.status === 'draft' ? (
              <View className="flex-1">
                <Button variant="gold" onPress={() => preview && doAssign(preview)} loading={busy} icon={<Send size={15} color="#ffffff" />}>Assign</Button>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center rounded-2xl bg-emerald-50">
                <Text className="font-sans-semibold text-sm text-emerald-700">Assigned</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Borrower picker */}
      <Modal visible={borrowerPicker} transparent animationType="slide" onRequestClose={() => setBorrowerPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setBorrowerPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select borrower</Text>
            <ScrollView>
              {borrowers.map((b: any) => (
                <Pressable key={b.id} onPress={() => { setUserId(b.id); setDueSel(new Set()); setBorrowerPicker(false); setError('') }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50">
                  <Text className="font-sans-medium text-sm text-slate-900">{b.name}</Text>
                  {userId === b.id ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Due-date multi-select */}
      <Modal visible={duePicker} transparent animationType="slide" onRequestClose={() => setDuePicker(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[75%] rounded-t-3xl bg-white p-3">
            <View className="flex-row items-center justify-between px-2 py-2">
              <Text className="font-sans-bold text-base text-slate-900">Select due dates</Text>
              <Pressable onPress={() => setDuePicker(false)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
            </View>
            <ScrollView>
              {dueOptions.length === 0 ? (
                <Text className="px-3 py-4 font-sans text-sm text-slate-400">This borrower has no transactions.</Text>
              ) : (
                dueOptions.map((d: string) => (
                  <Pressable key={d} onPress={() => toggleDue(d)} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50">
                    <Text className="font-sans-medium text-sm text-slate-900">{formatDate(d)}</Text>
                    <View className={`h-5 w-5 items-center justify-center rounded-md border ${dueSel.has(d) ? 'border-navy-700 bg-navy-700' : 'border-slate-300'}`}>
                      {dueSel.has(d) ? <Check size={14} color="#ffffff" /> : null}
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
            <View className="p-2">
              <Button onPress={() => setDuePicker(false)}>Done ({dueSel.size})</Button>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function TotalRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`font-sans text-sm ${strong ? 'font-sans-semibold text-navy-900' : 'text-slate-600'}`}>{k}</Text>
      <Text className={`font-mono text-sm ${strong ? 'font-mono-semibold text-navy-900' : 'text-slate-900'}`}>{v}</Text>
    </View>
  )
}

function ActBtn({ children, onPress, bg }: any) {
  return (
    <PressableScale onPress={onPress} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl ${bg} py-2`}>
      {children}
    </PressableScale>
  )
}
