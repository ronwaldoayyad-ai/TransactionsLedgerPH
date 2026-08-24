import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatPeso, toISODate } from '../../lib/amortization'
import { DEFAULT_PROCESSING_FEE, autoDST, byBorrower, computeArbitrage, lastPaymentDate, summarize } from '../../lib/arbitrage'
import CurrencyInput from '../../components/ui/CurrencyInput'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import SegmentedTabs from '../../components/ui/SegmentedTabs'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

export default function AdminArbitrage() {
  const { users, arbitrageLoans, interestRates, createArbitrageLoan, deleteArbitrageLoan, addInterestRate, deleteInterestRate, refreshing, refreshData } =
    useApp()
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const today = toISODate(new Date())
  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? id

  const borrowerRates = useMemo(() => interestRates.filter((r: any) => r.kind === 'borrower').sort((a: any, b: any) => a.rate - b.rate), [interestRates])
  const costRates = useMemo(() => interestRates.filter((r: any) => r.kind === 'cost').sort((a: any, b: any) => a.rate - b.rate), [interestRates])

  const [tab, setTab] = useState('ledger')
  const [saving, setSaving] = useState(false)
  const [ratesOpen, setRatesOpen] = useState(false)
  const [borrowerPicker, setBorrowerPicker] = useState(false)

  const blank = {
    userId: '',
    principal: null as number | null,
    txnDate: today,
    durationMonths: '',
    firstPaymentDate: '',
    borrowerRate: '',
    costRate: '',
    dst: 0 as number,
    processingFee: DEFAULT_PROCESSING_FEE as number,
    notarialFee: 0 as number,
    dstTouched: false,
  }
  const [form, setForm] = useState(blank)
  const update = (patch: any) =>
    setForm((f) => {
      const next = { ...f, ...patch }
      if ('principal' in patch && !next.dstTouched) next.dst = autoDST(next.principal)
      return next
    })

  const lastPay = lastPaymentDate(form.firstPaymentDate, form.durationMonths)
  const calc = computeArbitrage({ ...form, principal: form.principal ?? 0 })
  const overall = useMemo(() => summarize(arbitrageLoans), [arbitrageLoans])
  const perBorrower = useMemo(() => byBorrower(arbitrageLoans, users), [arbitrageLoans, users])
  const ledger = useMemo(
    () => [...arbitrageLoans].sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    [arbitrageLoans],
  )

  const canSave = form.userId && Number(form.principal) > 0 && Math.floor(Number(form.durationMonths)) >= 1 && form.txnDate && form.firstPaymentDate

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await createArbitrageLoan({
      userId: form.userId,
      principal: Number(form.principal),
      txnDate: form.txnDate,
      firstPaymentDate: form.firstPaymentDate,
      durationMonths: Math.floor(Number(form.durationMonths)),
      lastPaymentDate: lastPay,
      borrowerRate: Number(form.borrowerRate) || 0,
      costRate: Number(form.costRate) || 0,
      dst: Number(form.dst) || 0,
      processingFee: Number(form.processingFee) || 0,
      notarialFee: Number(form.notarialFee) || 0,
    })
    setSaving(false)
    setForm({ ...blank })
  }

  const confirmDelete = (r: any) =>
    Alert.alert('Delete arbitrage record?', 'This does not affect the loan ledger.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteArbitrageLoan(r.id) },
    ])

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-900'

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Interest / Arbitrage</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Your private record of lending spread — borrower interest vs. your cost, plus fees.
          </Text>
        </FadeInView>

        {/* Summary tiles */}
        <FadeInView delay={60} className="flex-row flex-wrap justify-between gap-y-3">
          {[
            ['Borrower Interest', overall.borrowerInterest, 'text-blue-700'],
            ['Your Interest Cost', overall.interestCost, 'text-red-700'],
            ['Fees Collected', overall.fees, 'text-sky-700'],
            ['Overall Net Gain', overall.netGain, 'text-emerald-700'],
          ].map(([label, v, tint]) => (
            <View key={label as string} className="w-[48.7%] rounded-2xl bg-white p-4">
              <Text className="font-sans-medium text-xs text-slate-500">{label}</Text>
              <Text className={`mt-1 font-mono-semibold text-lg ${tint}`} numberOfLines={1} adjustsFontSizeToFit>
                {formatPeso(v as number)}
              </Text>
            </View>
          ))}
        </FadeInView>

        {/* Log form */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader
              title="Log New Arbitrage Loan"
              action={
                <PressableScale onPress={() => setRatesOpen(true)} haptic={false}>
                  <Text className="font-sans-medium text-sm text-navy-700">Manage rates</Text>
                </PressableScale>
              }
            />
            <View className="gap-3 px-4 py-4">
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Borrower</Text>
                <Pressable onPress={() => setBorrowerPicker(true)} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <Text className="font-sans-medium text-sm text-slate-900">{form.userId ? nameOf(form.userId) : 'Select a borrower…'}</Text>
                  <ChevronDown size={18} color={colors.slate400} />
                </Pressable>
              </View>
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Principal (₱)</Text>
                <CurrencyInput value={form.principal} onValueChange={(v) => update({ principal: v })} className={input} />
              </View>
              <View className="flex-row gap-3">
                <Field label="Transaction Date"><TextInput value={form.txnDate} onChangeText={(v) => update({ txnDate: v })} className={input} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} /></Field>
                <Field label="Duration (mo.)"><TextInput value={form.durationMonths} onChangeText={(v) => update({ durationMonths: v })} keyboardType="number-pad" className={input} placeholder="12" placeholderTextColor={colors.slate400} /></Field>
              </View>
              <View className="flex-row gap-3">
                <Field label="First Payment"><TextInput value={form.firstPaymentDate} onChangeText={(v) => update({ firstPaymentDate: v })} className={input} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} /></Field>
                <Field label="Last Payment (auto)"><Text className={`${input} text-slate-500`}>{lastPay ?? '—'}</Text></Field>
              </View>
              <View className="flex-row gap-3">
                <Field label={`Borrower %/mo${borrowerRates.length ? ` (${borrowerRates.map((r: any) => r.rate.toFixed(2)).join(', ')})` : ''}`}>
                  <TextInput value={form.borrowerRate} onChangeText={(v) => update({ borrowerRate: v })} keyboardType="decimal-pad" className={input} placeholder="1.79" placeholderTextColor={colors.slate400} />
                </Field>
                <Field label={`Cost %/mo${costRates.length ? ` (${costRates.map((r: any) => r.rate.toFixed(2)).join(', ')})` : ''}`}>
                  <TextInput value={form.costRate} onChangeText={(v) => update({ costRate: v })} keyboardType="decimal-pad" className={input} placeholder="1.00" placeholderTextColor={colors.slate400} />
                </Field>
              </View>
              <Text className="border-t border-slate-100 pt-3 font-sans-semibold text-sm text-navy-700">Additional Fees (₱)</Text>
              <View className="flex-row gap-3">
                <Field label="DST"><CurrencyInput value={form.dst} onValueChange={(v) => setForm((f) => ({ ...f, dst: v ?? 0, dstTouched: true }))} className={input} /></Field>
                <Field label="Processing"><CurrencyInput value={form.processingFee} onValueChange={(v) => update({ processingFee: v ?? 0 })} className={input} /></Field>
              </View>
              <Field label="Notarial"><CurrencyInput value={form.notarialFee} onValueChange={(v) => update({ notarialFee: v ?? 0 })} className={input} /></Field>

              <View className="gap-1 rounded-xl border-l-4 border-navy-600 bg-slate-50 px-4 py-3">
                <CalcRow label="Total Borrower Interest" value={formatPeso(calc.borrowerInterest)} tint="text-blue-700" />
                <CalcRow label="Total Your Interest Cost" value={`- ${formatPeso(calc.interestCost)}`} tint="text-red-600" />
                <CalcRow label="Total Fees" value={`+ ${formatPeso(calc.fees)}`} tint="text-sky-700" />
                <View className="border-t border-slate-200 pt-1.5">
                  <CalcRow label="Projected Net Gain" value={formatPeso(calc.netGain)} tint="text-emerald-700" strong />
                </View>
              </View>

              <Button onPress={handleSave} loading={saving} disabled={!canSave || saving}>
                {saving ? 'Saving…' : 'Save Loan Record'}
              </Button>
            </View>
          </Card>
        </FadeInView>

        {/* Ledger / per-borrower */}
        <FadeInView delay={140}>
          <Card>
            <View className="px-4 pt-4">
              <SegmentedTabs
                tabs={[{ value: 'ledger', label: 'Per Loan' }, { value: 'summary', label: 'Per Borrower' }]}
                active={tab}
                onChange={setTab}
              />
            </View>
            {arbitrageLoans.length === 0 ? (
              <EmptyState title="No arbitrage records yet" body="Log a loan to track your interest spread." />
            ) : tab === 'ledger' ? (
              <View className="mt-2">
                {ledger.map((r: any, idx: number) => {
                  const c = computeArbitrage(r)
                  return (
                    <View key={r.id} className={`px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1">
                          <Text className="font-sans-semibold text-sm text-slate-900" numberOfLines={1}>{nameOf(r.userId)}</Text>
                          <Text className="font-sans text-xs text-slate-500">{r.firstPaymentDate} → {r.lastPaymentDate}</Text>
                        </View>
                        <Pressable onPress={() => confirmDelete(r)} className="p-1.5"><Trash2 size={15} color={colors.slate500} /></Pressable>
                      </View>
                      <View className="mt-1 flex-row flex-wrap gap-x-3">
                        <Text className="font-mono text-xs text-slate-600">P {formatPeso(r.principal)}</Text>
                        <Text className="font-mono text-xs text-blue-700">+{formatPeso(c.borrowerInterest)}</Text>
                        <Text className="font-mono text-xs text-red-600">-{formatPeso(c.interestCost)}</Text>
                        <Text className="font-mono text-xs text-sky-700">fee {formatPeso(c.fees)}</Text>
                        <Text className="font-mono-semibold text-xs text-emerald-700">net {formatPeso(c.netGain)}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className="mt-2">
                {perBorrower.map((b: any, idx: number) => (
                  <View key={b.userId} className={`flex-row items-center justify-between px-4 py-3 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View>
                      <Text className="font-sans-semibold text-sm text-slate-900">{b.name}</Text>
                      <Text className="font-sans text-xs text-slate-500">{b.loanCount} loan(s) · {formatPeso(b.totalPrincipal)}</Text>
                    </View>
                    <Text className="font-mono-semibold text-sm text-emerald-700">{formatPeso(b.totalNetGain)}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </FadeInView>
      </ScrollView>

      {/* Borrower picker */}
      <Modal visible={borrowerPicker} transparent animationType="slide" onRequestClose={() => setBorrowerPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setBorrowerPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select borrower</Text>
            <ScrollView>
              {borrowers.map((b: any) => (
                <Pressable key={b.id} onPress={() => { update({ userId: b.id }); setBorrowerPicker(false) }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50">
                  <Text className="font-sans-medium text-sm text-slate-900">{b.name}</Text>
                  {form.userId === b.id ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Manage rates */}
      <Modal visible={ratesOpen} transparent animationType="slide" onRequestClose={() => setRatesOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[85%] rounded-t-3xl bg-white p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sans-bold text-lg text-slate-900">Manage interest rates</Text>
              <Pressable onPress={() => setRatesOpen(false)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
            </View>
            <ScrollView>
              <RateList title="Borrower rates" kind="borrower" rates={borrowerRates} onAdd={addInterestRate} onDelete={deleteInterestRate} />
              <View className="h-4" />
              <RateList title="Your cost rates" kind="cost" rates={costRates} onAdd={addInterestRate} onDelete={deleteInterestRate} />
              <View className="h-4" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-1">
      <Text className="mb-1.5 font-sans-medium text-xs text-slate-500" numberOfLines={1}>{label}</Text>
      {children}
    </View>
  )
}

function CalcRow({ label, value, tint, strong }: { label: string; value: string; tint: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className={`font-sans text-sm ${strong ? 'font-sans-semibold text-slate-800' : 'text-slate-600'}`}>{label}</Text>
      <Text className={`font-mono text-sm ${strong ? 'font-mono-semibold' : ''} ${tint}`}>{value}</Text>
    </View>
  )
}

function RateList({ title, kind, rates, onAdd, onDelete }: any) {
  const [value, setValue] = useState('')
  const add = async () => {
    const ok = await onAdd(kind, value)
    if (ok) setValue('')
  }
  return (
    <View>
      <Text className="mb-2 font-sans-semibold text-sm text-slate-700">{title}</Text>
      <View className="gap-1.5">
        {rates.length === 0 ? <Text className="font-sans text-xs text-slate-400">No rates yet.</Text> : null}
        {rates.map((r: any) => (
          <View key={r.id} className="flex-row items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
            <Text className="font-mono text-sm text-slate-700">{r.rate.toFixed(4)}%</Text>
            <Pressable onPress={() => onDelete(r.id)} className="p-1"><Trash2 size={16} color={colors.slate400} /></Pressable>
          </View>
        ))}
      </View>
      <View className="mt-2 flex-row gap-2">
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="e.g. 1.7900"
          placeholderTextColor={colors.slate400}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900"
        />
        <PressableScale onPress={add} className="items-center justify-center rounded-xl bg-navy-800 px-4">
          <Plus size={18} color="#ffffff" />
        </PressableScale>
      </View>
    </View>
  )
}
