import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, FileText, Pencil, Trash2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { formatDate, formatPeso } from '../../lib/amortization'
import { REQUEST_STATUSES, STATUS_LABEL, STATUS_NOTES, TERMS, requestSummary } from '../../lib/loanRequest'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  submitted: { bg: 'bg-slate-100', text: 'text-slate-700' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  coordinating: { bg: 'bg-sky-50', text: 'text-sky-700' },
  bank_approved: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  transfer: { bg: 'bg-violet-50', text: 'text-violet-700' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  declined: { bg: 'bg-red-50', text: 'text-red-700' },
  canceled: { bg: 'bg-slate-100', text: 'text-slate-500' },
}

function StatusPill({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.submitted
  return (
    <View className={`rounded-full px-2.5 py-1 ${t.bg}`}>
      <Text className={`font-sans-semibold text-[10px] uppercase ${t.text}`}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  )
}

export default function AdminLoanRequests() {
  const { users, refreshing, refreshData } = useApp()
  const { requests, rates, ratesByTerm, eventsFor, accessFor, updateStatus, updateFees, deleteRequests, setRate, setAccess } =
    useLoanRequests()
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? '—'

  const [detail, setDetail] = useState<any>(null)
  const [updating, setUpdating] = useState<any>(null)
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote] = useState('')

  // Rate config draft (per term, in %).
  const [rateDraft, setRateDraft] = useState<Record<number, string>>(() =>
    Object.fromEntries(TERMS.map((t) => [t, ((ratesByTerm[t] ?? 0) * 100).toFixed(4)])),
  )
  const [savingRates, setSavingRates] = useState(false)

  // Access control.
  const [accessUser, setAccessUser] = useState('')
  const [accessPicker, setAccessPicker] = useState(false)

  const openUpdate = (r: any) => {
    setUpdating(r)
    setNewStatus(r.status)
    setNote('')
  }
  const pickStatus = (key: string) => {
    setNewStatus(key)
    setNote(STATUS_NOTES[key] ?? '')
  }
  const saveStatus = async () => {
    const res = await updateStatus(updating.id, newStatus, note)
    if (res?.error) Alert.alert('Update failed', res.error)
    setUpdating(null)
  }

  const confirmDelete = (r: any) =>
    Alert.alert('Delete loan request?', `Permanently delete ${r.reference} and its history?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRequests(r.id) },
    ])

  const saveRates = async () => {
    setSavingRates(true)
    for (const t of TERMS) {
      const pct = Number(rateDraft[t])
      if (!Number.isNaN(pct)) await setRate(t, pct / 100)
    }
    setSavingRates(false)
    Alert.alert('Saved', 'Loan rates updated.')
  }

  const numInput = 'w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900'

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Loan Requests</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Configure rates, control access, and process borrower loan requests.
          </Text>
        </FadeInView>

        {/* Feature visibility */}
        <FadeInView delay={60}>
          <Card>
            <CardHeader title="Feature Visibility" subtitle="Enable cash loan requests per borrower." />
            <View className="gap-3 px-4 py-4">
              <Pressable
                onPress={() => setAccessPicker(true)}
                className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"
              >
                <Text className="font-sans-medium text-sm text-slate-900">
                  {accessUser ? nameOf(accessUser) : '— Select a borrower —'}
                </Text>
                <ChevronDown size={18} color={colors.slate400} />
              </Pressable>
              {accessUser ? (
                <View className="flex-row items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                  <Text className="font-sans-medium text-sm text-slate-700">
                    {accessFor(accessUser) ? 'Enabled' : 'Disabled'}
                  </Text>
                  <Switch
                    value={accessFor(accessUser)}
                    onValueChange={(v) => setAccess(accessUser, v)}
                    trackColor={{ true: colors.navy800, false: '#cbd5e1' }}
                    thumbColor="#ffffff"
                  />
                </View>
              ) : null}
            </View>
          </Card>
        </FadeInView>

        {/* Rate config */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Loan Rate Configuration" subtitle="Monthly add-on rate per term (%)." />
            {rates.length === 0 ? (
              <Text className="px-5 py-6 text-center font-sans text-sm text-slate-500">
                Rate configuration loads once the loan-requests schema is set up.
              </Text>
            ) : (
              <View className="gap-2.5 px-4 py-4">
                {TERMS.map((t) => (
                  <View key={t} className="flex-row items-center gap-3">
                    <Text className="w-20 font-sans-medium text-sm text-slate-700">{t} months</Text>
                    <TextInput
                      value={rateDraft[t]}
                      onChangeText={(v) => setRateDraft((d) => ({ ...d, [t]: v }))}
                      keyboardType="decimal-pad"
                      className={numInput}
                    />
                    <Text className="font-sans text-sm text-slate-500">%</Text>
                  </View>
                ))}
                <Button onPress={saveRates} loading={savingRates} disabled={savingRates}>
                  {savingRates ? 'Saving…' : 'Save Rates'}
                </Button>
              </View>
            )}
          </Card>
        </FadeInView>

        {/* Requests */}
        <FadeInView delay={140}>
          <Card>
            <CardHeader
              title="Loan Request Approval"
              subtitle={`${requests.length} request${requests.length === 1 ? '' : 's'}`}
            />
            {requests.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} color={colors.slate500} />}
                title="No loan requests yet"
                body="Borrower requests will appear here for review."
              />
            ) : (
              requests.map((r: any, idx: number) => (
                <View key={r.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>
                        {nameOf(r.userId)}
                      </Text>
                      <Text className="font-mono text-xs text-slate-500">
                        {r.reference} · {r.termMonths} mo
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(r.amount)}</Text>
                      <StatusPill status={r.status} />
                    </View>
                  </View>
                  <View className="mt-2.5 flex-row gap-1.5">
                    <ActBtn label="View" onPress={() => setDetail(r)} bg="bg-slate-100" tint={colors.slate500}>
                      <FileText size={14} color={colors.slate500} />
                      <Text className="font-sans-medium text-xs text-slate-600">View</Text>
                    </ActBtn>
                    <ActBtn label="Update status" onPress={() => openUpdate(r)} bg="bg-gold-500" tint="#fff">
                      <Pencil size={14} color="#ffffff" />
                      <Text className="font-sans-semibold text-xs text-white">Update</Text>
                    </ActBtn>
                    <ActBtn label="Delete" onPress={() => confirmDelete(r)} bg="bg-red-50" tint="#dc2626">
                      <Trash2 size={14} color="#dc2626" />
                      <Text className="font-sans-medium text-xs text-red-600">Delete</Text>
                    </ActBtn>
                  </View>
                </View>
              ))
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Detail modal */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[85%] rounded-t-3xl bg-white p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sans-bold text-lg text-slate-900">{detail?.reference}</Text>
              <Pressable onPress={() => setDetail(null)} className="p-1">
                <X size={22} color={colors.slate500} />
              </Pressable>
            </View>
            {detail ? (
              <ScrollView>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="font-sans text-sm text-slate-600">Borrower: {nameOf(detail.userId)}</Text>
                  <StatusPill status={detail.status} />
                </View>
                <DetailRow label="Amount" value={formatPeso(detail.amount)} />
                <DetailRow label="Term" value={`${detail.termMonths} months`} />
                <DetailRow label="Bank" value={detail.bankName} />
                <DetailRow label="Account" value={`${detail.bankAccountName} · ${detail.bankAccountNumber}`} />
                {(() => {
                  const s = requestSummary(detail)
                  return (
                    <>
                      <DetailRow label="Monthly installment" value={formatPeso(s.monthlyInstallment)} />
                      <DetailRow label="Processing fee" value={formatPeso(s.processing)} />
                      <DetailRow label="Notarial" value={formatPeso(s.notarial)} />
                      <DetailRow label="DST" value={formatPeso(s.dst)} />
                      <DetailRow label="First-month total" value={formatPeso(s.firstMonthTotal)} strong />
                    </>
                  )
                })()}
                <Text className="mb-2 mt-4 font-sans-semibold text-sm text-slate-900">History</Text>
                {eventsFor(detail.id).length === 0 ? (
                  <Text className="font-sans text-sm text-slate-400">No history yet.</Text>
                ) : (
                  eventsFor(detail.id).map((e: any) => (
                    <View key={e.id} className="mb-2 flex-row gap-2">
                      <View className="mt-1.5 h-2 w-2 rounded-full bg-navy-600" />
                      <View className="flex-1">
                        <Text className="font-sans-medium text-sm text-slate-800">{STATUS_LABEL[e.status] ?? e.status}</Text>
                        {e.note ? <Text className="font-sans text-xs text-slate-500">{e.note}</Text> : null}
                        <Text className="font-sans text-[11px] text-slate-400">
                          {e.actor ? `${e.actor} · ` : ''}
                          {formatDate(String(e.createdAt).slice(0, 10))}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
                <View className="h-6" />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Update status modal */}
      <Modal visible={!!updating} transparent animationType="slide" onRequestClose={() => setUpdating(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[85%] rounded-t-3xl bg-white p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sans-bold text-lg text-slate-900">Update status</Text>
              <Pressable onPress={() => setUpdating(null)} className="p-1">
                <X size={22} color={colors.slate500} />
              </Pressable>
            </View>
            <ScrollView>
              <View className="gap-1.5">
                {REQUEST_STATUSES.map((s: any) => (
                  <Pressable
                    key={s.key}
                    onPress={() => pickStatus(s.key)}
                    className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${
                      newStatus === s.key ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Text className="font-sans-medium text-sm text-slate-900">{s.label}</Text>
                    {newStatus === s.key ? <Check size={16} color={colors.navy700} /> : null}
                  </Pressable>
                ))}
              </View>
              <Text className="mb-1 mt-4 font-sans-medium text-xs text-slate-500">Note to borrower</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Optional note…"
                placeholderTextColor={colors.slate400}
                className="min-h-[80px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
                textAlignVertical="top"
              />
              <View className="mt-4">
                <Button onPress={saveStatus}>Save status</Button>
              </View>
              <View className="h-4" />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Borrower picker for access */}
      <Modal visible={accessPicker} transparent animationType="slide" onRequestClose={() => setAccessPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setAccessPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select borrower</Text>
            <ScrollView>
              {borrowers.map((b: any) => (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setAccessUser(b.id)
                    setAccessPicker(false)
                  }}
                  className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50"
                >
                  <Text className="font-sans-medium text-sm text-slate-900">{b.name}</Text>
                  {accessUser === b.id ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function ActBtn({ children, label, onPress, bg }: any) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl ${bg} py-2`}
    >
      {children}
    </PressableScale>
  )
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="font-sans text-sm text-slate-500">{label}</Text>
      <Text className={`font-mono text-sm ${strong ? 'font-mono-semibold text-slate-900' : 'text-slate-800'}`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}
