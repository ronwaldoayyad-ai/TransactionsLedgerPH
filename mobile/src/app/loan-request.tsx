import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import { Check, ChevronDown, Lock, Mail, Send, X } from 'lucide-react-native'
import { useApp } from '../context/AppContext'
import { useLoanRequests } from '../context/LoanRequestsContext'
import { formatPeso } from '../lib/amortization'
import {
  BANKS,
  PROCESSING_FEE,
  TERMS,
  buildRequestSchedule,
  canCancel,
  computeNotarial,
  computeRequestDST,
  isTerminal,
  requestSummary,
} from '../lib/loanRequest'
import CurrencyInput from '../components/ui/CurrencyInput'
import Button from '../components/ui/Button'
import FadeInView from '../components/ui/FadeInView'
import PressableScale from '../components/ui/PressableScale'
import EmptyState from '../components/ui/EmptyState'
import SegmentedTabs from '../components/ui/SegmentedTabs'
import { Card, CardHeader } from '../components/ui/Card'
import { colors, fonts } from '../theme'

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
const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  pending: 'Pending',
  coordinating: 'Coordinating',
  bank_approved: 'Bank Approved',
  transfer: 'Transfer',
  completed: 'Completed',
  declined: 'Declined',
  canceled: 'Canceled',
}
function StatusPill({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.submitted
  return (
    <View className={`rounded-full px-2.5 py-1 ${t.bg}`}>
      <Text className={`font-sans-semibold text-[10px] uppercase ${t.text}`}>{STATUS_LABELS[status] ?? status}</Text>
    </View>
  )
}
const fmtDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className={`font-sans text-sm ${strong ? 'font-sans-semibold text-slate-800' : 'text-slate-500'}`}>{label}</Text>
      <Text className={`font-mono text-sm ${strong ? 'font-mono-semibold text-slate-900' : 'text-slate-800'}`}>{value}</Text>
    </View>
  )
}

function RequestForm() {
  const { session } = useApp()
  const { ratesByTerm, submitRequest } = useLoanRequests()
  const [amount, setAmount] = useState<number | null>(null)
  const [bankName, setBankName] = useState('')
  const [bankPicker, setBankPicker] = useState(false)
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState(session.user.name ?? '')
  const [term, setTerm] = useState(3)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const rate = ratesByTerm[term] ?? 0
  const notarial = amount ? computeNotarial(amount) : 0
  const dst = amount ? computeRequestDST(amount) : 0
  const summary = useMemo(
    () => (amount ? requestSummary({ amount, termMonths: term, monthlyRate: rate, notarialFee: notarial, dst }) : null),
    [amount, term, rate, notarial, dst],
  )
  const schedule = useMemo(
    () => (amount ? buildRequestSchedule({ amount, termMonths: term, monthlyRate: rate, notarialFee: notarial, dst }) : []),
    [amount, term, rate, notarial, dst],
  )
  const canSubmit = (amount ?? 0) > 0 && !!bankName && accountNumber.trim() && accountName.trim() && consent && !saving

  const submit = async () => {
    if (!amount || amount <= 0) return setError('Please enter your desired loan amount.')
    if (!bankName) return setError('Please select your bank.')
    if (!accountNumber.trim() || !accountName.trim()) return setError('Please provide your bank account number and name.')
    if (!consent) return setError('Please confirm the details are correct.')
    setError('')
    setSaving(true)
    const { error: err } = await submitRequest({ amount, termMonths: term, bankName, bankAccountNumber: accountNumber.trim(), bankAccountName: accountName.trim() })
    setSaving(false)
    if (err) return setError(err)
    setDone(true)
  }

  if (done) {
    return (
      <Card>
        <View className="items-center gap-3 px-6 py-12">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <Check size={28} color="#059669" />
          </View>
          <Text className="font-sans-bold text-lg text-slate-900">Request submitted!</Text>
          <Text className="max-w-xs text-center font-sans text-sm text-slate-600">
            Your loan request has been received and is waiting to be processed. Track it under My Loan Requests.
          </Text>
        </View>
      </Card>
    )
  }

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'

  return (
    <View className="gap-4">
      <Card>
        <CardHeader title="Loan Details" />
        <View className="gap-4 px-4 py-4">
          <View>
            <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Desired Loan Amount</Text>
            <CurrencyInput value={amount} onValueChange={setAmount} className={`${input} font-mono`} />
          </View>
          <View>
            <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Bank Name</Text>
            <Pressable onPress={() => setBankPicker(true)} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
              <Text className={`font-sans-medium text-sm ${bankName ? 'text-slate-900' : 'text-slate-400'}`}>{bankName || 'Select your bank'}</Text>
              <ChevronDown size={18} color={colors.slate400} />
            </Pressable>
          </View>
          <View>
            <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Bank Account Number</Text>
            <TextInput value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" placeholder="1234567890" placeholderTextColor={colors.slate400} className={input} />
          </View>
          <View>
            <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Bank Account Name</Text>
            <TextInput value={accountName} onChangeText={setAccountName} placeholder="Juan Dela Cruz" placeholderTextColor={colors.slate400} className={input} />
          </View>
        </View>
      </Card>

      <Card>
        <CardHeader title="Select Payment Term" />
        <View className="flex-row flex-wrap gap-2 px-4 py-4">
          {TERMS.map((t) => {
            const active = term === t
            const r = ratesByTerm[t] ?? 0
            return (
              <Pressable
                key={t}
                onPress={() => setTerm(t)}
                className={`w-[31%] rounded-xl border px-2 py-3 ${active ? 'border-navy-400 bg-navy-50' : 'border-slate-200 bg-white'}`}
              >
                <Text className="text-center font-sans-semibold text-sm text-slate-800">{t} mo</Text>
                <Text className="mt-0.5 text-center font-mono text-xs text-slate-500">{(r * 100).toFixed(2)}%</Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <Card>
        <CardHeader title="Cash Loan Summary" />
        <View className="px-4 py-4">
          {!amount ? (
            <Text className="py-6 text-center font-sans text-sm text-slate-500">Enter a loan amount to see your summary and schedule.</Text>
          ) : (
            <>
              <SummaryRow label="Desired Loan Amount" value={formatPeso(amount)} />
              <SummaryRow label="Monthly Add-on Rate" value={`${(rate * 100).toFixed(4)}%`} />
              <SummaryRow label="Processing Fee" value={formatPeso(PROCESSING_FEE)} />
              <SummaryRow label="DST Amount" value={formatPeso(dst)} />
              <SummaryRow label="Notarial Fee" value={formatPeso(notarial)} />
              <SummaryRow label="Payment Terms" value={`${term} Months`} />
              <View className="mt-1 border-t border-slate-200 pt-1">
                <SummaryRow label="Total Monthly Installment" value={formatPeso(summary!.monthlyInstallment)} strong />
              </View>
            </>
          )}
        </View>
      </Card>

      {amount ? (
        <Card>
          <CardHeader title="Amortization Schedule" />
          <View className="flex-row border-b border-slate-200 px-4 py-2">
            <Text className="w-12 font-sans-semibold text-[11px] uppercase text-slate-500">Mo.</Text>
            <Text className="flex-1 text-right font-sans-semibold text-[11px] uppercase text-slate-500">Total</Text>
            <Text className="flex-1 text-right font-sans-semibold text-[11px] uppercase text-slate-500">Remaining</Text>
          </View>
          {schedule.map((row: any) => (
            <View key={row.month} className="flex-row border-b border-slate-50 px-4 py-2.5">
              <Text className="w-12 font-mono text-sm text-slate-700">{row.month}</Text>
              <Text className="flex-1 text-right font-mono text-sm text-slate-900">{formatPeso(row.totalPayment)}</Text>
              <Text className="flex-1 text-right font-mono text-sm text-slate-700">{formatPeso(row.remainingBalance)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {error ? (
        <Text className="rounded-xl bg-red-50 px-3 py-2.5 font-sans text-sm text-red-700">{error}</Text>
      ) : null}

      <Pressable onPress={() => setConsent((c) => !c)} className="flex-row items-start gap-2.5 px-1">
        <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${consent ? 'border-navy-700 bg-navy-700' : 'border-slate-300'}`}>
          {consent ? <Check size={14} color="#ffffff" /> : null}
        </View>
        <Text className="flex-1 font-sans text-sm text-slate-700">
          I confirm I have read and agree to the terms and conditions, and that all details are correct.
        </Text>
      </Pressable>

      <Button variant="gold" onPress={submit} disabled={!canSubmit} icon={<Send size={15} color="#ffffff" />}>
        {saving ? 'Submitting…' : 'Submit Request'}
      </Button>

      <Modal visible={bankPicker} transparent animationType="slide" onRequestClose={() => setBankPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setBankPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select your bank</Text>
            <ScrollView>
              {BANKS.map((b) => (
                <Pressable key={b} onPress={() => { setBankName(b); setBankPicker(false) }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50">
                  <Text className="font-sans-medium text-sm text-slate-900">{b}</Text>
                  {bankName === b ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

function MyRequests() {
  const { myRequests, eventsFor, cancelRequest } = useLoanRequests()
  const [detail, setDetail] = useState<any>(null)

  if (myRequests.length === 0) {
    return <EmptyState title="No loan requests yet" body="Your submitted requests will appear here." />
  }

  const cancel = (r: any) =>
    Alert.alert('Cancel request?', `Cancel ${r.reference}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => { await cancelRequest(r.id, 'Canceled by borrower.'); setDetail(null) } },
    ])

  return (
    <>
      <Card>
        {myRequests.map((r: any, idx: number) => (
          <Pressable key={r.id} onPress={() => setDetail(r)} className={`flex-row items-center justify-between gap-3 px-4 py-4 active:bg-slate-50 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
            <View className="min-w-0 flex-1">
              <Text className="font-mono text-sm font-semibold text-slate-900">{r.reference}</Text>
              <Text className="font-sans text-xs text-slate-500">
                {formatPeso(r.amount)} · {r.termMonths} mo · {fmtDate(r.createdAt)}
              </Text>
            </View>
            <StatusPill status={r.status} />
          </Pressable>
        ))}
      </Card>

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[88%] rounded-t-3xl bg-white p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-mono text-base font-bold text-slate-900">{detail?.reference}</Text>
              <Pressable onPress={() => setDetail(null)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
            </View>
            {detail ? (
              <ScrollView>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="font-sans text-xs text-slate-500">Submitted {fmtDate(detail.createdAt)}</Text>
                  <StatusPill status={detail.status} />
                </View>
                <View className="flex-row gap-3">
                  <Stat label="Amount" value={formatPeso(detail.amount)} />
                  <Stat label="Term" value={`${detail.termMonths} mo`} />
                  <Stat label="Rate" value={`${(detail.monthlyRate * 100).toFixed(2)}%`} />
                </View>
                <View className="mt-3 gap-1 rounded-xl bg-slate-50 p-4">
                  <SummaryRow label="Bank" value={detail.bankName} />
                  <SummaryRow label="Account Name" value={detail.bankAccountName} />
                  <SummaryRow label="Account No." value={detail.bankAccountNumber} />
                </View>
                <Text className="mb-2 mt-4 font-sans-semibold text-sm text-slate-900">History</Text>
                {eventsFor(detail.id).length === 0 ? (
                  <Text className="font-sans text-sm text-slate-400">No history yet.</Text>
                ) : (
                  eventsFor(detail.id).map((e: any) => (
                    <View key={e.id} className="mb-2 flex-row gap-2">
                      <View className="mt-1.5 h-2 w-2 rounded-full bg-navy-600" />
                      <View className="flex-1">
                        <Text className="font-sans-medium text-sm text-slate-800">{STATUS_LABELS[e.status] ?? e.status}</Text>
                        {e.note ? <Text className="font-sans text-xs text-slate-500">{e.note}</Text> : null}
                        <Text className="font-sans text-[11px] text-slate-400">{fmtDate(String(e.createdAt))}</Text>
                      </View>
                    </View>
                  ))
                )}
                {canCancel(detail.status) ? (
                  <View className="mt-4">
                    <Button variant="danger" onPress={() => cancel(detail)}>Cancel Request</Button>
                  </View>
                ) : null}
                <View className="h-6" />
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-xl bg-slate-50 py-3">
      <Text className="font-sans text-[11px] text-slate-500">{label}</Text>
      <Text className="mt-0.5 font-mono-semibold text-sm text-slate-900" numberOfLines={1}>{value}</Text>
    </View>
  )
}

function NotEligible() {
  const { users } = useApp()
  const router = useRouter()
  const admin = users.find((u: any) => u.role === 'admin')
  const adminName = admin?.name?.split(' ')[0] || 'the admin'
  return (
    <Card>
      <View className="items-center gap-4 px-6 py-12">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-navy-50">
          <Lock size={28} color={colors.navy700} />
        </View>
        <View className="items-center">
          <Text className="text-center font-sans-bold text-lg text-slate-900">Loan requests aren't enabled yet</Text>
          <Text className="mt-1 max-w-xs text-center font-sans text-sm text-slate-600">
            Message {adminName} to check if this offer is available to you.
          </Text>
        </View>
        <Button variant="gold" onPress={() => router.replace('/(tabs)/messages')} icon={<Mail size={15} color="#ffffff" />}>
          Message {adminName}
        </Button>
      </View>
    </Card>
  )
}

export default function LoanRequest() {
  const { canRequest } = useLoanRequests()
  const [tab, setTab] = useState('new')

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Cash Loan Request', headerTitleStyle: { fontFamily: fonts.sansSemibold } }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
        <FadeInView>
          <SegmentedTabs
            tabs={[{ value: 'new', label: 'Request New' }, { value: 'mine', label: 'My Requests' }]}
            active={tab}
            onChange={setTab}
          />
        </FadeInView>
        {tab === 'new' ? (canRequest ? <RequestForm /> : <NotEligible />) : <MyRequests />}
      </ScrollView>
    </SafeAreaView>
  )
}
