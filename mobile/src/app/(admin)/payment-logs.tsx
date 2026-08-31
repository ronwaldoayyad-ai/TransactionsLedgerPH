import { memo, useMemo, useState } from 'react'
import { Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { isReceivable } from '../../lib/transactions'
import {
  PAY_LOG_METHODS,
  PAY_LOG_STATUSES,
  allocate,
  defaultSubject,
  suggestedAmountOwed,
} from '../../lib/paymentLogs'
import CurrencyInput from '../../components/ui/CurrencyInput'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import { CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const STATUS_TONE: Record<string, { bg: string; text: string }> = {
  Settled: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Overpayment: { bg: 'bg-sky-50', text: 'text-sky-700' },
  Underpayment: { bg: 'bg-red-50', text: 'text-red-700' },
  Credited: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
}

function StatusPill({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' }
  return (
    <View className={`rounded-full px-2.5 py-1 ${t.bg}`}>
      <Text className={`font-sans-semibold text-[10px] uppercase ${t.text}`}>{status}</Text>
    </View>
  )
}

// Memoized row: keeps typing in the search box (and opening the modal) from
// repainting every logged payment. Rendered inside a virtualized FlatList.
const PayLogRow = memo(function PayLogRow({
  log,
  name,
  first,
  onEdit,
  onDelete,
}: {
  log: any
  name: string
  first: boolean
  onEdit: (l: any) => void
  onDelete: (l: any) => void
}) {
  return (
    <View className={`border-x border-slate-200/70 bg-white px-4 py-3.5 ${first ? '' : 'border-t border-t-slate-100'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>{name}</Text>
          <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
            {formatDate(log.txnDate)} · {log.method ?? '—'}
            {log.reference ? ` · ${log.reference}` : ''}
          </Text>
        </View>
        <StatusPill status={log.allocStatus} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <View className="flex-row gap-3">
          <Text className="font-mono text-xs text-slate-600">Owed {formatPeso(log.amountOwed)}</Text>
          <Text className="font-mono text-xs text-slate-600">Applied {formatPeso(log.fundsApplied)}</Text>
          <Text className="font-mono-semibold text-xs text-slate-900">Rem {formatPeso(log.remainingBalance)}</Text>
        </View>
        <View className="flex-row gap-1">
          <Pressable onPress={() => onEdit(log)} className="p-1.5" accessibilityLabel="Edit">
            <Pencil size={15} color={colors.slate500} />
          </Pressable>
          <Pressable onPress={() => onDelete(log)} className="p-1.5" accessibilityLabel="Delete">
            <Trash2 size={15} color={colors.slate500} />
          </Pressable>
        </View>
      </View>
    </View>
  )
})

export default function AdminPaymentLogs() {
  const { users, transactions, paymentLogs, createPaymentLog, updatePaymentLog, deletePaymentLog, setTransactionStatus, refreshing, refreshData } =
    useApp()
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])
  const today = toISODate(new Date())
  // Map lookup instead of users.find() per row (was O(rows × users)).
  const nameById = useMemo(
    () => new Map<string, string>(users.map((u: any) => [u.id, u.name] as [string, string])),
    [users],
  )
  const nameOf = (id: string): string => nameById.get(id) ?? id

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [borrowerPicker, setBorrowerPicker] = useState(false)
  const [methodPicker, setMethodPicker] = useState(false)
  const [statusPicker, setStatusPicker] = useState(false)

  const blank = {
    userId: '',
    txnDate: today,
    reference: '',
    subject: '',
    dueDate: today,
    amountOwed: 0,
    method: PAY_LOG_METHODS[0],
    fundsApplied: 0,
    statusOverride: null as string | null,
    subjectTouched: false,
    owedTouched: false,
  }
  const [form, setForm] = useState(blank)

  const { remaining, status: computedStatus } = allocate(form.amountOwed, form.fundsApplied)
  const effectiveStatus = form.statusOverride ?? computedStatus

  const recompute = (next: any) => {
    const owed = next.owedTouched ? next.amountOwed : suggestedAmountOwed(transactions, next.userId, next.dueDate, today)
    const subject = next.subjectTouched ? next.subject : defaultSubject(next.dueDate)
    return { ...next, amountOwed: owed, subject }
  }
  const update = (patch: any) => setForm((f) => recompute({ ...f, ...patch }))

  const openForm = () => {
    setForm(blank)
    setEditingId(null)
    setOpen(true)
  }
  const openEdit = (l: any) => {
    setForm({
      userId: l.userId,
      txnDate: l.txnDate,
      reference: l.reference,
      subject: l.subject,
      dueDate: l.dueDate,
      amountOwed: l.amountOwed,
      method: l.method ?? PAY_LOG_METHODS[0],
      fundsApplied: l.fundsApplied,
      statusOverride: l.allocStatus,
      subjectTouched: true,
      owedTouched: true,
    })
    setEditingId(l.id)
    setOpen(true)
  }

  const handleSave = async () => {
    if (!form.userId) return
    setSaving(true)
    if (editingId) {
      await updatePaymentLog(editingId, {
        txnDate: form.txnDate,
        reference: form.reference,
        subject: form.subject,
        dueDate: form.dueDate,
        amountOwed: form.amountOwed,
        method: form.method,
        fundsApplied: form.fundsApplied,
        remainingBalance: remaining,
        allocStatus: effectiveStatus,
      })
    } else {
      const created = await createPaymentLog({
        userId: form.userId,
        txnDate: form.txnDate,
        reference: form.reference,
        subject: form.subject,
        dueDate: form.dueDate,
        amountOwed: form.amountOwed,
        method: form.method,
        fundsApplied: form.fundsApplied,
        status: effectiveStatus,
      })
      if (created && (effectiveStatus === 'Settled' || effectiveStatus === 'Overpayment')) {
        const ids = transactions
          .filter((t: any) => t.userId === form.userId && isReceivable(t, today) && (!form.dueDate || t.dueDate <= form.dueDate))
          .map((t: any) => t.id)
        if (ids.length) setTransactionStatus(ids, 'paid')
      }
    }
    setSaving(false)
    setOpen(false)
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = paymentLogs.filter((l: any) => {
      if (l.kind !== 'payment') return false
      if (q) {
        const name = nameOf(l.userId)
        const hay = [name, l.reference, l.subject, l.method, l.allocStatus].map((v) => String(v ?? '')).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    return [...list].sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentLogs, query, users])

  const totals = useMemo(
    () =>
      rows.reduce(
        (a: any, l: any) => ({
          amountOwed: a.amountOwed + (Number(l.amountOwed) || 0),
          fundsApplied: a.fundsApplied + (Number(l.fundsApplied) || 0),
          remaining: a.remaining + (Number(l.remainingBalance) || 0),
        }),
        { amountOwed: 0, fundsApplied: 0, remaining: 0 },
      ),
    [rows],
  )

  const confirmDelete = (l: any) =>
    Alert.alert('Delete payment log?', 'This removes the log entry. It does not affect the amortization ledger.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePaymentLog(l.id) },
    ])

  const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'
  const SelectRow = ({ label, value, onPress }: any) => (
    <View>
      <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">{label}</Text>
      <Pressable onPress={onPress} className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3">
        <Text className="font-sans-medium text-sm text-slate-900">{value}</Text>
        <ChevronDown size={18} color={colors.slate400} />
      </Pressable>
    </View>
  )

  const listHeader = (
    <View className="gap-4 pb-0">
      <FadeInView className="px-1">
        <Text className="font-sans-bold text-2xl text-slate-900">Payment Logs</Text>
        <Text className="mt-0.5 font-sans text-sm text-slate-500">
          Record payments received from borrowers. Separate from the amortization schedule.
        </Text>
      </FadeInView>

      <PressableScale onPress={openForm} className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3">
        <Plus size={18} color="#ffffff" />
        <Text className="font-sans-semibold text-sm text-white">Record Payment</Text>
      </PressableScale>

      {/* Totals */}
      <FadeInView delay={60} className="flex-row gap-2">
        {[
          ['Owed', totals.amountOwed],
          ['Applied', totals.fundsApplied],
          ['Remaining', totals.remaining],
        ].map(([label, v]) => (
          <View key={label as string} className="flex-1 rounded-2xl bg-white p-3">
            <Text className="font-sans-medium text-[11px] text-slate-500">{label}</Text>
            <Text className="mt-0.5 font-mono-semibold text-sm text-slate-900" numberOfLines={1} adjustsFontSizeToFit>
              {formatPeso(v as number)}
            </Text>
          </View>
        ))}
      </FadeInView>

      <View className="overflow-hidden rounded-t-2xl border border-b-0 border-slate-200/70 bg-white">
        <CardHeader title="Recorded payments" subtitle={`${rows.length} payment${rows.length === 1 ? '' : 's'} logged`} />
        <View className="px-4 pb-2 pt-2">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor={colors.slate400}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-sans text-sm text-slate-900"
          />
        </View>
      </View>
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(l: any) => l.id}
        renderItem={({ item, index }) => (
          <PayLogRow log={item} name={nameOf(item.userId)} first={index === 0} onEdit={openEdit} onDelete={confirmDelete} />
        )}
        initialNumToRender={12}
        windowSize={9}
        removeClippedSubviews
        contentContainerClassName="p-4 pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          rows.length === 0 ? null : (
            <View className="h-3 rounded-b-2xl border border-t-0 border-slate-200/70 bg-white" />
          )
        }
        ListEmptyComponent={
          <View className="overflow-hidden rounded-b-2xl border border-t-0 border-slate-200/70 bg-white">
            <EmptyState title="No payment logs" body="Use Record Payment to acknowledge a payment received." />
          </View>
        }
      />

      {/* Record / edit modal */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[92%] rounded-t-3xl bg-white p-5">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sans-bold text-lg text-slate-900">{editingId ? 'Edit Payment Log' : 'Record Payment'}</Text>
              <Pressable onPress={() => setOpen(false)} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
            </View>
            <ScrollView className="gap-3">
              <View className="gap-3">
                {!editingId ? (
                  <SelectRow label="Borrower" value={form.userId ? nameOf(form.userId) : 'Select a borrower…'} onPress={() => setBorrowerPicker(true)} />
                ) : (
                  <View>
                    <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Borrower</Text>
                    <Text className="rounded-xl bg-slate-100 px-3 py-3 font-sans-medium text-sm text-slate-700">{nameOf(form.userId)}</Text>
                  </View>
                )}
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Transaction Date</Text>
                    <TextInput value={form.txnDate} onChangeText={(v) => update({ txnDate: v })} className={`${input} font-mono`} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} />
                  </View>
                  <View className="flex-1">
                    <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Due Date</Text>
                    <TextInput value={form.dueDate} onChangeText={(v) => update({ dueDate: v })} className={`${input} font-mono`} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} />
                  </View>
                </View>
                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Reference #</Text>
                  <TextInput value={form.reference} onChangeText={(v) => update({ reference: v })} placeholder="e.g. GC-20260617-001" placeholderTextColor={colors.slate400} className={input} />
                </View>
                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Subject</Text>
                  <TextInput value={form.subject} onChangeText={(v) => setForm((f) => ({ ...f, subject: v, subjectTouched: true }))} className={input} />
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Amount Owed</Text>
                    <CurrencyInput value={form.amountOwed} onValueChange={(v) => setForm((f) => ({ ...f, amountOwed: v ?? 0, owedTouched: true }))} className={`${input} font-mono`} />
                  </View>
                  <View className="flex-1">
                    <SelectRow label="Method" value={form.method} onPress={() => setMethodPicker(true)} />
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">Funds Applied</Text>
                    <CurrencyInput value={form.fundsApplied} onValueChange={(v) => update({ fundsApplied: v ?? 0 })} className={`${input} font-mono`} />
                  </View>
                  <View className="flex-1">
                    <SelectRow label="Status" value={effectiveStatus} onPress={() => setStatusPicker(true)} />
                  </View>
                </View>
                <View className="flex-row items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <View>
                    <Text className="font-sans-medium text-[10px] uppercase text-slate-500">Remaining</Text>
                    <Text className="mt-0.5 font-mono-semibold text-lg text-slate-900">{formatPeso(remaining)}</Text>
                  </View>
                  <StatusPill status={effectiveStatus} />
                </View>
                <Button variant="gold" onPress={handleSave} disabled={!form.userId || saving}>
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save log'}
                </Button>
                <View className="h-4" />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PickerModal
        visible={borrowerPicker}
        title="Select borrower"
        options={borrowers.map((b: any) => ({ value: b.id, label: b.name }))}
        selected={form.userId}
        onSelect={(v: string) => update({ userId: v })}
        onClose={() => setBorrowerPicker(false)}
      />
      <PickerModal
        visible={methodPicker}
        title="Payment method"
        options={PAY_LOG_METHODS.map((m) => ({ value: m, label: m }))}
        selected={form.method}
        onSelect={(v: string) => update({ method: v })}
        onClose={() => setMethodPicker(false)}
      />
      <PickerModal
        visible={statusPicker}
        title="Status"
        options={PAY_LOG_STATUSES.map((s) => ({ value: s, label: s }))}
        selected={effectiveStatus}
        onSelect={(v: string) => setForm((f) => ({ ...f, statusOverride: v }))}
        onClose={() => setStatusPicker(false)}
      />
    </SafeAreaView>
  )
}

function PickerModal({ visible, title, options, selected, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <View className="max-h-[70%] rounded-t-3xl bg-white p-3">
          <Text className="px-2 py-2 font-sans-bold text-base text-slate-900">{title}</Text>
          <ScrollView>
            {options.map((o: any) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  onSelect(o.value)
                  onClose()
                }}
                className="flex-row items-center justify-between rounded-xl px-3 py-2.5 active:bg-slate-50"
              >
                <Text className="font-sans-medium text-sm text-slate-900">{o.label}</Text>
                {selected === o.value ? <Check size={18} color={colors.navy700} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  )
}
