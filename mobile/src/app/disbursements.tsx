import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { Check, X } from 'lucide-react-native'
import { useDisbursements } from '../context/DisbursementsContext'
import { formatDate, formatPeso } from '../lib/amortization'
import { usePagination } from '../hooks/usePagination'
import Pager from '../components/ui/Pager'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import FadeInView from '../components/ui/FadeInView'
import EmptyState from '../components/ui/EmptyState'
import { Card, CardHeader } from '../components/ui/Card'
import { colors, fonts } from '../theme'

const STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Draft', badge: 'upcoming' },
  assigned: { label: 'Assigned', badge: 'invited' },
}
const MODE_LABEL: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  check: 'Check',
  cash: 'Cash',
  others: 'Others',
}

// Borrower view: read-only list of disbursement documents issued to them, with a
// native breakdown and a one-time acknowledgment. Accepting calls
// acknowledge_loan_disbursement, which stamps acceptance and notifies admins.
// Mirrors the web borrower Disbursements page (PDF export TODO via expo-print).
export default function BorrowerDisbursements() {
  const { disbursements, refreshDisbursements, acknowledgeDisbursement } = useDisbursements()
  const [preview, setPreview] = useState<any>(null)
  const [ackBusy, setAckBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const visible = useMemo(
    () =>
      [...disbursements].sort((a: any, b: any) =>
        String(b.disbursementDate || '').localeCompare(String(a.disbursementDate || '')),
      ),
    [disbursements],
  )

  const pag = usePagination(visible, 8)

  const onRefresh = async () => {
    setRefreshing(true)
    await refreshDisbursements?.()
    setRefreshing(false)
  }

  const doAcknowledge = (d: any) => {
    Alert.alert(
      'Accept disbursement',
      'I acknowledge the gross amount, the itemized deductions, and the net amount, and I accept the terms of this loan disbursement agreement.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAckBusy(true)
            const { disbursement, error } = await acknowledgeDisbursement(d.id)
            setAckBusy(false)
            if (error) {
              Alert.alert('Could not accept', error)
              return
            }
            if (disbursement) setPreview(disbursement)
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'My Disbursements', headerTitleStyle: { fontFamily: fonts.sansSemibold } }} />
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy600} />}
      >
        <FadeInView>
          <Card>
            <CardHeader title="Disbursements" subtitle={`${disbursements.length} issued`} />
            {visible.length === 0 ? (
              <EmptyState
                title="No disbursements yet"
                body="When your administrator issues a loan disbursement document, it will appear here to review and accept."
              />
            ) : (
              <>
              {pag.pageItems.map((d: any, idx: number) => (
                <Pressable
                  key={d.id}
                  onPress={() => setPreview(d)}
                  className={`px-5 py-3.5 active:bg-slate-50 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                >
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono-semibold text-[13px] text-slate-900">{d.disbursementNumber}</Text>
                      <Text className="mt-0.5 font-sans text-[11px] text-slate-500">
                        Disbursed {formatDate(d.disbursementDate)}
                      </Text>
                    </View>
                    {d.acknowledgedAt ? (
                      <View className="flex-row items-center gap-1">
                        <Check size={14} color="#059669" />
                        <Text className="font-sans-medium text-[11px] text-emerald-700">Accepted</Text>
                      </View>
                    ) : (
                      <Badge status="upcoming" label="Action needed" />
                    )}
                  </View>
                  <Text className="mt-1.5 font-mono-semibold text-[15px] text-slate-900">{formatPeso(d.netProceeds)}</Text>
                </Pressable>
              ))}
              <Pager page={pag.page} pageCount={pag.pageCount} total={pag.total} start={pag.start} end={pag.end} onPage={pag.setPage} label="disbursements" />
              </>
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Detail sheet */}
      <Modal visible={!!preview} transparent animationType="slide" onRequestClose={() => setPreview(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[90%] rounded-t-3xl bg-white">
            <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-4">
              <Text className="font-sans-bold text-base text-slate-900">
                {preview ? `Disbursement ${preview.disbursementNumber}` : ''}
              </Text>
              <Pressable onPress={() => setPreview(null)} accessibilityLabel="Close" hitSlop={8}>
                <X size={22} color={colors.slate500} />
              </Pressable>
            </View>
            {preview && (
              <ScrollView contentContainerClassName="p-5 gap-4">
                <View className="items-center rounded-2xl bg-navy-50/70 py-4">
                  <Text className="font-sans-medium text-xs uppercase tracking-wide text-slate-500">Net Proceeds</Text>
                  <Text className="mt-1 font-mono-bold text-2xl text-navy-900">{formatPeso(preview.netProceeds)}</Text>
                </View>

                <Section title="Details">
                  <Row label="Status" value={(STATUS_META[preview.status] ?? STATUS_META.draft).label} />
                  <Row label="Disbursement date" value={formatDate(preview.disbursementDate)} />
                  {preview.agreementDate ? <Row label="Agreement date" value={formatDate(preview.agreementDate)} /> : null}
                  {preview.reference ? <Row label="Reference" value={preview.reference} mono /> : null}
                  <Row label="Mode" value={MODE_LABEL[preview.disbursementMode] ?? preview.disbursementMode} />
                </Section>

                {(preview.bankName || preview.bankAccountNumber) && (
                  <Section title="Bank">
                    {preview.bankName ? <Row label="Bank" value={preview.bankName} /> : null}
                    {preview.bankAccountName ? <Row label="Account name" value={preview.bankAccountName} /> : null}
                    {preview.bankAccountNumber ? <Row label="Account no." value={preview.bankAccountNumber} mono /> : null}
                  </Section>
                )}

                <Section title="Amounts">
                  <Row label="Total sanctioned" value={formatPeso(preview.totalSanctionedAmount)} mono />
                  <Row label="Gross amount" value={formatPeso(preview.grossAmount)} mono />
                  {preview.percentageOfTotal ? <Row label="% of total" value={`${preview.percentageOfTotal}%`} /> : null}
                </Section>

                {Array.isArray(preview.deductionItems) && preview.deductionItems.length > 0 && (
                  <Section title="Authorized deductions">
                    {preview.deductionItems.map((it: any) => (
                      <View key={it.id} className="flex-row items-center justify-between gap-2 py-1.5">
                        <View className="min-w-0 flex-1">
                          <Text className="font-sans text-[13px] text-slate-700" numberOfLines={1}>
                            {it.description}
                          </Text>
                          <Text className="font-sans text-[11px] text-slate-400">Due {formatDate(it.dueDate)}</Text>
                        </View>
                        <Text className="font-mono text-[13px] text-slate-900">{formatPeso(it.amount)}</Text>
                      </View>
                    ))}
                    <View className="mt-1 flex-row items-center justify-between border-t border-slate-100 pt-2">
                      <Text className="font-sans-semibold text-[13px] text-slate-700">Total deductions</Text>
                      <Text className="font-mono-semibold text-[13px] text-slate-900">{formatPeso(preview.totalDeductions)}</Text>
                    </View>
                  </Section>
                )}

                {/* Acknowledgment */}
                <View
                  className={`rounded-2xl border px-4 py-3 ${
                    preview.acknowledgedAt ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {preview.acknowledgedAt ? (
                    <View className="flex-row items-center gap-2">
                      <Check size={16} color="#059669" />
                      <Text className="flex-1 font-sans-medium text-[13px] text-emerald-800">
                        Accepted on {formatDate(String(preview.acknowledgedAt).slice(0, 10))}. Your administrator has
                        been notified.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text className="mb-3 font-sans text-[13px] text-slate-600">
                        I acknowledge the gross amount, the itemized deductions, and the net amount, and I accept the
                        terms of this loan disbursement agreement.
                      </Text>
                      <Button variant="gold" loading={ackBusy} disabled={ackBusy} onPress={() => doAcknowledge(preview)}>
                        Acknowledge &amp; accept
                      </Button>
                    </>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="rounded-2xl border border-slate-200 bg-white p-4">
      <Text className="mb-2 font-sans-semibold text-xs uppercase tracking-wide text-slate-500">{title}</Text>
      {children}
    </View>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <Text className="font-sans text-[13px] text-slate-500">{label}</Text>
      <Text className={`flex-1 text-right text-[13px] text-slate-900 ${mono ? 'font-mono' : 'font-sans-medium'}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}
