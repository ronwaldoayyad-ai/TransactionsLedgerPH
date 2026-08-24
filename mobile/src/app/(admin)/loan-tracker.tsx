import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, Trash2 } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { BANKS, computeLoan, isFullyPaid, lastPaymentDate, portfolioSummary } from '../../lib/loanTracker'
import CurrencyInput from '../../components/ui/CurrencyInput'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

function BankBadge({ acronym, color, size = 36 }: { acronym: string; color: string; size?: number }) {
  return (
    <View
      style={{ width: size, height: size, backgroundColor: color || colors.navy800 }}
      className="items-center justify-center rounded-lg"
    >
      <Text style={{ fontSize: size * 0.3 }} className="font-sans-bold text-white">
        {acronym || '—'}
      </Text>
    </View>
  )
}

function LabeledDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <Text className="mb-1 font-sans-medium text-xs text-slate-500">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        placeholderTextColor={colors.slate400}
        className="rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-900"
      />
    </View>
  )
}

function LoanCard({ loan, today, onDelete }: { loan: any; today: string; onDelete: (l: any) => void }) {
  const [open, setOpen] = useState(false)
  const c = computeLoan(loan)
  const last = lastPaymentDate(loan.firstPaymentDate, loan.durationMonths)
  const outstanding = !isFullyPaid(loan, today)
  const Row = ({ label, value, strong }: any) => (
    <View className="flex-row items-center justify-between py-0.5">
      <Text className="font-sans text-sm text-slate-500">{label}</Text>
      <Text className={`font-mono text-sm ${strong ? 'font-mono-semibold text-slate-900' : 'text-slate-800'}`}>
        {value}
      </Text>
    </View>
  )
  return (
    <View className="rounded-2xl bg-white p-4">
      <View className="flex-row items-center gap-2">
        <BankBadge acronym={loan.bankAcronym} color={loan.bankColor} size={40} />
        <Text className="min-w-0 flex-1 font-sans-bold text-[15px] text-slate-900" numberOfLines={1}>
          {loan.bankName}
        </Text>
        <View className={`rounded-full px-2.5 py-1 ${outstanding ? 'bg-blue-50' : 'bg-emerald-50'}`}>
          <Text className={`font-sans-bold text-[10px] uppercase ${outstanding ? 'text-blue-700' : 'text-emerald-700'}`}>
            {outstanding ? 'Outstanding' : 'Fully Paid'}
          </Text>
        </View>
        <Pressable onPress={() => onDelete(loan)} className="p-1.5" accessibilityLabel="Delete tracked loan">
          <Trash2 size={16} color={colors.slate400} />
        </Pressable>
      </View>

      <Pressable onPress={() => setOpen((o) => !o)} className="mt-2">
        <Row label="Principal" value={formatPeso(loan.principal)} strong />
        {open ? (
          <>
            <Row label="Transaction Date" value={formatDate(loan.txnDate)} />
            <Row label="Processing Fee" value={formatPeso(loan.processingFee)} />
            <Row label="Duration" value={`${loan.durationMonths} months`} />
            <Row label="Add-on Rate" value={`${Number(loan.monthlyRate).toFixed(2)}%`} />
            <View className="my-2 border-t border-dashed border-slate-200" />
            <Row label="Total Interest" value={formatPeso(c.interest)} />
            <Row label="Total Repayment" value={formatPeso(c.repayment)} strong />
            <View className="my-2 border-t border-dashed border-slate-200" />
            <Row label="First Payment" value={formatDate(loan.firstPaymentDate)} />
            <Row label="Last Payment" value={formatDate(last)} />
            <View className="mt-3 flex-row items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <Text className="font-sans-medium text-sm text-slate-600">Monthly Payment</Text>
              <Text className="font-mono-semibold text-base text-slate-900">{formatPeso(c.monthly)}</Text>
            </View>
          </>
        ) : (
          <View className="mt-1 flex-row items-center gap-1">
            <ChevronDown size={14} color={colors.slate400} />
            <Text className="font-sans text-xs text-slate-400">Tap for details</Text>
          </View>
        )}
      </Pressable>
    </View>
  )
}

export default function AdminLoanTracker() {
  const { trackedLoans, createTrackedLoan, deleteTrackedLoan, refreshing, refreshData } = useApp()
  const today = toISODate(new Date())

  const [bankIdx, setBankIdx] = useState(0)
  const [bankPicker, setBankPicker] = useState(false)
  const [principal, setPrincipal] = useState<number | null>(null)
  const [processingFee, setProcessingFee] = useState<number | null>(null)
  const [monthlyRate, setMonthlyRate] = useState('')
  const [durationMonths, setDurationMonths] = useState('')
  const [txnDate, setTxnDate] = useState(today)
  const [firstPaymentDate, setFirstPaymentDate] = useState('')
  const [saving, setSaving] = useState(false)

  const bank = BANKS[bankIdx]
  const summary = useMemo(() => portfolioSummary(trackedLoans), [trackedLoans])
  const { outstanding, paid } = useMemo(() => {
    const sorted = [...trackedLoans].sort((a, b) =>
      String(b.txnDate ?? '').localeCompare(String(a.txnDate ?? '')),
    )
    return {
      outstanding: sorted.filter((l) => !isFullyPaid(l, today)),
      paid: sorted.filter((l) => isFullyPaid(l, today)),
    }
  }, [trackedLoans, today])
  const outstandingMonthly =
    Math.round(outstanding.reduce((s, l) => s + computeLoan(l).monthly, 0) * 100) / 100

  const canSave =
    Number(principal) > 0 && Math.floor(Number(durationMonths)) >= 1 && !!txnDate && !!firstPaymentDate

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await createTrackedLoan({
      bankName: bank.name,
      bankAcronym: bank.acronym,
      bankColor: bank.color,
      bankDomain: bank.domain,
      principal: Number(principal),
      processingFee: Number(processingFee) || 0,
      monthlyRate: Number(monthlyRate) || 0,
      durationMonths: Math.floor(Number(durationMonths)),
      txnDate,
      firstPaymentDate,
    })
    setSaving(false)
    setPrincipal(null)
    setProcessingFee(null)
    setMonthlyRate('')
    setDurationMonths('')
    setFirstPaymentDate('')
  }

  const confirmDelete = (l: any) =>
    Alert.alert('Delete tracked loan?', `Remove the ${l.bankName} loan from your portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTrackedLoan(l.id) },
    ])

  const numInput =
    'rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-900'

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Loan Tracker</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Your private record of loans availed from banks. As of {formatDate(today)}.
          </Text>
        </FadeInView>

        {/* Summary tiles */}
        <FadeInView delay={60} className="flex-row flex-wrap justify-between gap-y-3">
          {[
            { label: 'Total Principal', total: summary.principal, metric: 'principal' },
            { label: 'Total Interest', total: summary.interest, metric: 'interest' },
            { label: 'Total Repayment', total: summary.repayment, metric: 'repayment' },
            { label: 'Monthly (Outstanding)', total: outstandingMonthly, metric: null },
          ].map((t) => (
            <View key={t.label} className="w-[48.7%] rounded-2xl bg-white p-4">
              <Text className="font-sans-medium text-xs text-slate-500">{t.label}</Text>
              <Text className="mt-1 font-mono-semibold text-lg text-slate-900" numberOfLines={1} adjustsFontSizeToFit>
                {formatPeso(t.total)}
              </Text>
            </View>
          ))}
        </FadeInView>

        {/* Add form */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Add New Loan" />
            <View className="gap-3 px-4 py-4">
              <View>
                <Text className="mb-1 font-sans-medium text-xs text-slate-500">Bank</Text>
                <Pressable
                  onPress={() => setBankPicker(true)}
                  className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                >
                  <BankBadge acronym={bank.acronym} color={bank.color} size={28} />
                  <Text className="flex-1 font-sans-medium text-sm text-slate-900" numberOfLines={1}>
                    {bank.name}
                  </Text>
                  <ChevronDown size={18} color={colors.slate400} />
                </Pressable>
              </View>
              <View>
                <Text className="mb-1 font-sans-medium text-xs text-slate-500">Principal Amount (PHP)</Text>
                <CurrencyInput value={principal} onValueChange={setPrincipal} className={numInput} />
              </View>
              <View>
                <Text className="mb-1 font-sans-medium text-xs text-slate-500">Processing Fee (PHP)</Text>
                <CurrencyInput value={processingFee} onValueChange={setProcessingFee} className={numInput} />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 font-sans-medium text-xs text-slate-500">Add-on Rate (%)</Text>
                  <TextInput
                    value={monthlyRate}
                    onChangeText={setMonthlyRate}
                    keyboardType="decimal-pad"
                    placeholder="1.15"
                    placeholderTextColor={colors.slate400}
                    className={numInput}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 font-sans-medium text-xs text-slate-500">Duration (mo.)</Text>
                  <TextInput
                    value={durationMonths}
                    onChangeText={setDurationMonths}
                    keyboardType="number-pad"
                    placeholder="36"
                    placeholderTextColor={colors.slate400}
                    className={numInput}
                  />
                </View>
              </View>
              <LabeledDate label="Transaction Date" value={txnDate} onChange={setTxnDate} />
              <LabeledDate label="First Payment Date" value={firstPaymentDate} onChange={setFirstPaymentDate} />
              <Button onPress={handleSave} loading={saving} disabled={!canSave || saving}>
                {saving ? 'Saving…' : 'Track Loan'}
              </Button>
            </View>
          </Card>
        </FadeInView>

        {/* Outstanding */}
        <FadeInView delay={140}>
          <View className="mb-2 flex-row items-center gap-2 px-1">
            <Text className="font-sans-bold text-lg text-slate-900">Outstanding Loans</Text>
            <View className="rounded-full bg-slate-200 px-2 py-0.5">
              <Text className="font-sans-semibold text-xs text-slate-600">{outstanding.length}</Text>
            </View>
          </View>
          {outstanding.length === 0 ? (
            <Card>
              <EmptyState icon={<Check size={20} color="#059669" />} title="No outstanding loans" />
            </Card>
          ) : (
            <View className="gap-3">
              {outstanding.map((l) => (
                <LoanCard key={l.id} loan={l} today={today} onDelete={confirmDelete} />
              ))}
            </View>
          )}
        </FadeInView>

        {/* Fully paid */}
        <FadeInView delay={180}>
          <View className="mb-2 flex-row items-center gap-2 px-1">
            <Text className="font-sans-bold text-lg text-slate-900">Fully Paid Loans</Text>
            <View className="rounded-full bg-slate-200 px-2 py-0.5">
              <Text className="font-sans-semibold text-xs text-slate-600">{paid.length}</Text>
            </View>
          </View>
          {paid.length === 0 ? (
            <Card>
              <EmptyState title="No fully paid loans" />
            </Card>
          ) : (
            <View className="gap-3">
              {paid.map((l) => (
                <LoanCard key={l.id} loan={l} today={today} onDelete={confirmDelete} />
              ))}
            </View>
          )}
        </FadeInView>
      </ScrollView>

      {/* Bank picker */}
      <Modal visible={bankPicker} transparent animationType="slide" onRequestClose={() => setBankPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setBankPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select bank</Text>
            <ScrollView>
              {BANKS.map((b, i) => (
                <Pressable
                  key={b.domain}
                  onPress={() => {
                    setBankIdx(i)
                    setBankPicker(false)
                  }}
                  className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-slate-50"
                >
                  <BankBadge acronym={b.acronym} color={b.color} size={30} />
                  <Text className="flex-1 font-sans-medium text-sm text-slate-900">{b.name}</Text>
                  {i === bankIdx ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
