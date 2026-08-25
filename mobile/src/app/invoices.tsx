import { useState } from 'react'
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { WebView } from 'react-native-webview'
import { Download, FileText, X } from 'lucide-react-native'
import { useInvoices } from '../context/InvoicesContext'
import { formatDate, formatPeso } from '../lib/amortization'
import { buildInvoiceHtml } from '../lib/invoiceHtml'
import { shareInvoicePdf } from '../lib/invoicePrint'
import Button from '../components/ui/Button'
import FadeInView from '../components/ui/FadeInView'
import PressableScale from '../components/ui/PressableScale'
import EmptyState from '../components/ui/EmptyState'
import { Card, CardHeader } from '../components/ui/Card'
import { colors, fonts } from '../theme'

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

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'My Invoices', headerTitleStyle: { fontFamily: fonts.sansSemibold } }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshInvoices} tintColor={colors.navy600} />}
      >
        <FadeInView>
          <Card>
            <CardHeader title="Invoices" subtitle={`${invoices.length} issued`} />
            {invoices.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} color={colors.slate500} />}
                title="No invoices yet"
                body="When your administrator issues an invoice, it will appear here to view and download."
              />
            ) : (
              invoices.map((inv: any, idx: number) => (
                <View key={inv.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono text-xs text-slate-500">{inv.invoiceNumber}</Text>
                      <Text className="font-sans text-xs text-slate-500">
                        {formatDate(inv.invoiceDate)}{inv.dueDate ? ` · due ${formatDate(inv.dueDate)}` : ''}
                      </Text>
                    </View>
                    <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(inv.totalDue)}</Text>
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
    </SafeAreaView>
  )
}
