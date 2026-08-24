import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Share, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, Send, Share2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { autoDST, computeDeductions, formatPeso, generateSchedule, toISODate } from '../../lib/amortization'
import CurrencyInput from '../../components/ui/CurrencyInput'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

export default function AdminCalculator() {
  const { users, interestRates, assignLoan, unassignLoan, refreshing, refreshData } = useApp()
  const borrowers = users.filter((u: any) => u.role === 'user')
  const borrowerRateOptions = interestRates.filter((r: any) => r.kind === 'borrower').sort((a: any, b: any) => a.rate - b.rate)
  const today = toISODate(new Date())
  const nextMonth = () => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return toISODate(d)
  }

  const [txnType, setTxnType] = useState<'installment' | 'straight'>('installment')
  const [principal, setPrincipal] = useState<number | null>(50000)
  const [ratePct, setRatePct] = useState('0')
  const [duration, setDuration] = useState('6')
  const [txnDate, setTxnDate] = useState(today)
  const [firstPaymentDate, setFirstPaymentDate] = useState(nextMonth())
  const [dstOverride, setDstOverride] = useState<{ forPrincipal: number; value: number } | null>(null)
  const [applyDST, setApplyDST] = useState(true)
  const [processingFee, setProcessingFee] = useState<number | null>(1500)
  const [addProcessingFee, setAddProcessingFee] = useState(false)
  const [notarialFee, setNotarialFee] = useState<number | null>(0)
  const [deductFromProceeds, setDeductFromProceeds] = useState(false)
  const [label, setLabel] = useState('Cash Loan')
  const [assigneeId, setAssigneeId] = useState('')
  const [assigned, setAssigned] = useState<{ message: string; loanId: string | null } | null>(null)
  const [picker, setPicker] = useState(false)

  const P = principal ?? 0
  const monthlyRate = (Number(ratePct) || 0) / 100
  const effectiveDuration = txnType === 'straight' ? 1 : duration

  const handleTypeChange = (value: 'installment' | 'straight') => {
    setTxnType(value)
    setRatePct('0')
    if (value === 'straight') {
      setLabel('Purchased Item')
      setPrincipal(0)
      setApplyDST(false)
      setDeductFromProceeds(false)
    } else {
      setLabel('Cash Loan')
      setApplyDST(true)
      setDeductFromProceeds(false)
    }
  }

  const dst = dstOverride && dstOverride.forPrincipal === P ? dstOverride.value : autoDST(P)
  const setDst = (value: number) => setDstOverride({ forPrincipal: P, value })
  const effectiveDst = applyDST ? dst ?? 0 : 0
  const effectiveProcessingFee = addProcessingFee ? processingFee ?? 0 : 0

  const deductions = useMemo(
    () => computeDeductions({ principal: P, processingFee: effectiveProcessingFee, notarialFee: notarialFee ?? 0, dst: effectiveDst, deductFromProceeds }),
    [P, effectiveProcessingFee, notarialFee, effectiveDst, deductFromProceeds],
  )
  const schedule = useMemo(
    () =>
      generateSchedule({
        principal: P,
        monthlyRate,
        durationMonths: effectiveDuration,
        firstPaymentDate,
        upfrontFees: deductFromProceeds ? 0 : deductions.totalDeductions,
      }),
    [P, monthlyRate, effectiveDuration, firstPaymentDate, deductFromProceeds, deductions.totalDeductions],
  )

  const selectedBorrower = borrowers.find((b: any) => b.id === assigneeId)

  const handleAssign = async () => {
    if (!schedule || !assigneeId) return
    const inputs = {
      userId: assigneeId,
      label,
      txnType,
      principal: P,
      monthlyRate,
      durationMonths: Number(effectiveDuration),
      txnDate,
      firstPaymentDate,
      dst: deductions.dst,
      processingFee: effectiveProcessingFee,
      notarialFee: notarialFee ?? 0,
      deductFromProceeds,
    }
    const loan = await assignLoan({ ...inputs, disclosure: { ...inputs, ...deductions, schedule } })
    if (!loan) {
      setAssigned({ message: 'Assignment failed — check the inputs and try again.', loanId: null })
      return
    }
    setAssigned({
      message: `Schedule ${loan.id} pushed live to ${selectedBorrower?.name}'s dashboard.`,
      loanId: loan.id,
    })
  }

  const handleUndo = async () => {
    if (!assigned?.loanId) return
    const ok = await unassignLoan(assigned.loanId)
    setAssigned({ message: ok ? 'Assignment undone.' : 'Undo failed — retry.', loanId: ok ? null : assigned.loanId })
    if (ok) setTimeout(() => setAssigned(null), 5000)
  }

  const shareStatement = async () => {
    if (!schedule) return
    const lines = [
      'LOAN DISCLOSURE STATEMENT',
      `Type: ${txnType === 'straight' ? 'Straight' : 'Installment'}`,
      `Description: ${label}`,
      `Principal: ${formatPeso(P)}`,
      `Monthly Add-on Rate: ${(Number(ratePct) || 0).toFixed(4)}%`,
      `Duration: ${effectiveDuration} month${Number(effectiveDuration) === 1 ? '' : 's'}`,
      `DST: ${formatPeso(deductions.dst)} | Processing: ${formatPeso(effectiveProcessingFee)} | Notarial: ${formatPeso(notarialFee ?? 0)}`,
      `Total Deductions: ${formatPeso(deductions.totalDeductions)}`,
      `NET PROCEEDS: ${formatPeso(deductions.netProceeds)}`,
      '',
      'AMORTIZATION SCHEDULE',
      ...schedule.rows.map((r: any) => `${r.n}. ${r.date} — ${formatPeso(r.total)}`),
      `TOTAL REPAYABLE: ${formatPeso(schedule.totals.total)}`,
    ]
    try {
      await Share.share({ title: 'Loan Disclosure Statement', message: lines.join('\n') })
    } catch {
      /* cancelled */
    }
  }

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'
  const numInput = `${input} font-mono`

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Loan Calculator</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Generate a PH-compliant disclosure statement and amortization schedule.
          </Text>
        </FadeInView>

        {/* Core inputs */}
        <FadeInView delay={60}>
          <Card>
            <CardHeader title="Core Inputs" />
            <View className="gap-4 px-4 py-4">
              <View>
                <Text className="mb-1.5 font-sans-medium text-sm text-slate-700">Transaction Type</Text>
                <View className="flex-row gap-1 rounded-xl bg-slate-100 p-1">
                  {(['installment', 'straight'] as const).map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => handleTypeChange(v)}
                      className={`flex-1 rounded-lg px-3 py-2 ${txnType === v ? 'bg-navy-800' : ''}`}
                    >
                      <Text className={`text-center font-sans-medium text-sm capitalize ${txnType === v ? 'text-white' : 'text-slate-600'}`}>{v}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Description</Text>
                <TextInput value={label} onChangeText={setLabel} className={input} />
              </View>
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">{txnType === 'straight' ? 'Amount (₱)' : 'Principal (₱)'}</Text>
                <CurrencyInput value={principal} onValueChange={setPrincipal} className={numInput} />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">
                    Rate %/mo{borrowerRateOptions.length ? ` (${borrowerRateOptions.map((r: any) => r.rate.toFixed(2)).join(', ')})` : ''}
                  </Text>
                  <TextInput value={ratePct} onChangeText={setRatePct} keyboardType="decimal-pad" className={numInput} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Duration (mo.)</Text>
                  <TextInput value={String(effectiveDuration)} onChangeText={setDuration} keyboardType="number-pad" editable={txnType !== 'straight'} className={numInput} />
                </View>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Transaction Date</Text>
                  <TextInput value={txnDate} onChangeText={setTxnDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} className={numInput} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">First Payment</Text>
                  <TextInput value={firstPaymentDate} onChangeText={setFirstPaymentDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} className={numInput} />
                </View>
              </View>
            </View>
          </Card>
        </FadeInView>

        {/* Fees */}
        <FadeInView delay={100}>
          <Card>
            <CardHeader title="Fees & Deductions" subtitle="Updates live with the principal" />
            <View className="gap-4 px-4 py-4">
              <View>
                <View className="mb-1.5 flex-row items-center justify-between">
                  <Text className="font-sans-medium text-sm text-slate-700">DST</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="font-sans text-xs text-slate-500">Apply</Text>
                    <Switch value={applyDST} onValueChange={setApplyDST} trackColor={{ true: colors.navy800, false: '#cbd5e1' }} thumbColor="#ffffff" />
                  </View>
                </View>
                <CurrencyInput value={effectiveDst} onValueChange={setDst} editable={applyDST} className={numInput} />
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <View className="mb-1.5 flex-row items-center justify-between">
                    <Text className="font-sans-medium text-xs text-slate-500">Processing</Text>
                    <Switch value={addProcessingFee} onValueChange={(v) => { setAddProcessingFee(v); if (v) setProcessingFee(1500) }} trackColor={{ true: colors.navy800, false: '#cbd5e1' }} thumbColor="#ffffff" />
                  </View>
                  <CurrencyInput value={effectiveProcessingFee} onValueChange={setProcessingFee} editable={addProcessingFee} className={numInput} />
                </View>
                <View className="flex-1">
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Notarial</Text>
                  <CurrencyInput value={notarialFee} onValueChange={setNotarialFee} className={numInput} />
                </View>
              </View>
              <Pressable onPress={() => setDeductFromProceeds((v) => !v)} className="flex-row items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <View className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${deductFromProceeds ? 'border-navy-700 bg-navy-700' : 'border-slate-300'}`}>
                  {deductFromProceeds ? <Check size={14} color="#ffffff" /> : null}
                </View>
                <View className="flex-1">
                  <Text className="font-sans-medium text-sm text-slate-900">Deduct from loan proceeds</Text>
                  <Text className="font-sans text-xs text-slate-500">Checked: fees taken from principal. Unchecked: collected with the first payment.</Text>
                </View>
              </Pressable>
              <View className="gap-2 rounded-xl bg-slate-50 p-4">
                <View className="flex-row justify-between">
                  <Text className="font-sans text-sm text-slate-600">Total Deductions</Text>
                  <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(deductions.totalDeductions)}</Text>
                </View>
                <View className="flex-row justify-between border-t border-slate-200 pt-2">
                  <Text className="font-sans-semibold text-sm text-navy-900">Net Proceeds to Borrower</Text>
                  <Text className="font-mono-semibold text-base text-emerald-700">{formatPeso(deductions.netProceeds)}</Text>
                </View>
              </View>
            </View>
          </Card>
        </FadeInView>

        {/* Distribution */}
        <FadeInView delay={140}>
          <Card>
            <CardHeader title="Distribution" subtitle="Assign in-app or share externally" />
            <View className="gap-3 px-4 py-4">
              <View>
                <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Assign to borrower</Text>
                <Pressable onPress={() => setPicker(true)} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <Text className="font-sans-medium text-sm text-slate-900">{selectedBorrower ? selectedBorrower.name : 'Select a borrower…'}</Text>
                  <ChevronDown size={18} color={colors.slate400} />
                </Pressable>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button onPress={handleAssign} disabled={!schedule || !assigneeId} icon={<Send size={15} color="#ffffff" />}>Assign & push live</Button>
                </View>
                <View className="flex-1">
                  <Button variant="secondary" onPress={shareStatement} disabled={!schedule} icon={<Share2 size={15} color={colors.navy700} />}>Share</Button>
                </View>
              </View>
              {assigned ? (
                <View className="flex-row items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <Check size={16} color="#059669" style={{ marginTop: 1 }} />
                  <Text className="flex-1 font-sans text-sm text-emerald-700">{assigned.message}</Text>
                  {assigned.loanId ? (
                    <Pressable onPress={handleUndo}><Text className="font-sans-semibold text-sm text-emerald-800 underline">Undo</Text></Pressable>
                  ) : null}
                  <Pressable onPress={() => setAssigned(null)}><X size={16} color="#059669" /></Pressable>
                </View>
              ) : null}
            </View>
          </Card>
        </FadeInView>

        {/* Schedule */}
        <FadeInView delay={180}>
          <Card>
            <CardHeader
              title="Amortization Schedule"
              subtitle={schedule ? 'Payment dates and totals (borrower view)' : 'Enter valid inputs to generate the schedule'}
            />
            {!schedule || schedule.rows.length === 0 ? (
              <EmptyState title="Awaiting valid inputs" body="Provide a principal, duration, and first payment date." />
            ) : (
              <>
                <View className="flex-row border-b border-slate-200 px-4 py-2">
                  <Text className="w-8 font-sans-semibold text-[11px] uppercase text-slate-500">#</Text>
                  <Text className="flex-1 font-sans-semibold text-[11px] uppercase text-slate-500">Due Date</Text>
                  <Text className="font-sans-semibold text-[11px] uppercase text-slate-500">Amount</Text>
                </View>
                {schedule.rows.map((r: any) => (
                  <View key={r.n} className="flex-row items-center border-b border-slate-50 px-4 py-2.5">
                    <Text className="w-8 font-mono text-sm text-slate-500">{r.n}</Text>
                    <Text className="flex-1 font-sans text-sm text-slate-700">{r.date}</Text>
                    <Text className="font-mono-medium text-sm text-slate-900">{formatPeso(r.total)}</Text>
                  </View>
                ))}
                <View className="flex-row items-center justify-between bg-navy-50/70 px-4 py-3">
                  <Text className="font-sans-semibold text-sm text-navy-900">Total Repayable</Text>
                  <Text className="font-mono-semibold text-sm text-navy-900">{formatPeso(schedule.totals.total)}</Text>
                </View>
              </>
            )}
          </Card>
        </FadeInView>

        {/* Disclosure summary */}
        {schedule && schedule.rows.length > 0 ? (
          <FadeInView delay={220} className="flex-row flex-wrap justify-between gap-y-3">
            {[
              ['Principal', formatPeso(P)],
              ['Net Proceeds', formatPeso(deductions.netProceeds)],
              ['Total Interest', formatPeso(schedule.totals.interest)],
              ['Total Repayable', formatPeso(schedule.totals.total)],
            ].map(([k, v]) => (
              <View key={k} className="w-[48.7%] rounded-2xl bg-white p-4">
                <Text className="font-sans-medium text-[11px] uppercase text-slate-500">{k}</Text>
                <Text className="mt-1 font-mono-semibold text-base text-slate-900" numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
              </View>
            ))}
          </FadeInView>
        ) : null}
      </ScrollView>

      {/* Borrower picker */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={() => setPicker(false)}>
          <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
            <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">Select borrower</Text>
            <ScrollView>
              {borrowers.map((b: any) => (
                <Pressable key={b.id} onPress={() => { setAssigneeId(b.id); setPicker(false) }} className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50">
                  <View>
                    <Text className="font-sans-medium text-sm text-slate-900">{b.name}</Text>
                    <Text className="font-sans text-xs text-slate-500">{b.email}</Text>
                  </View>
                  {assigneeId === b.id ? <Check size={18} color={colors.navy700} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
