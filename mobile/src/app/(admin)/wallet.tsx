import { useMemo, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, ChevronDown, CreditCard, Plus, Trash2, X } from 'lucide-react-native'
import { useWallet } from '../../hooks/useWallet'
import { formatPeso, toISODate } from '../../lib/amortization'
import {
  CATEGORIES,
  INCOME_CATEGORIES,
  NETWORKS,
  TIERS,
  accountLast4,
  accountTotals,
  billState,
  portfolioTotals,
  urgencyBadge,
} from '../../lib/wallet'
import CurrencyInput from '../../components/ui/CurrencyInput'
import Button from '../../components/ui/Button'
import FadeInView from '../../components/ui/FadeInView'
import PressableScale from '../../components/ui/PressableScale'
import EmptyState from '../../components/ui/EmptyState'
import SegmentedTabs from '../../components/ui/SegmentedTabs'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

const input = 'rounded-xl border border-slate-200 bg-white px-3 py-3 font-sans text-sm text-slate-900'

export default function AdminWallet() {
  const wallet = useWallet()
  const { cards, accounts, bills, payments, loading, reload, addCard, deleteCard, addBill, deleteBill, payBill, addAccount, deleteAccount, addAccountTxn } = wallet
  const today = toISODate(new Date())
  const [tab, setTab] = useState('cards')

  const totals = useMemo(() => portfolioTotals(cards), [cards])
  const acctTotals = useMemo(() => accountTotals(accounts, payments), [accounts, payments])

  // Modal state
  const [cardModal, setCardModal] = useState(false)
  const [billModal, setBillModal] = useState(false)
  const [acctModal, setAcctModal] = useState(false)
  const [payModal, setPayModal] = useState<any>(null)
  const [txnModal, setTxnModal] = useState<any>(null)

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Cards & Bills Wallet</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">Your private record of cards, bills, and funding accounts.</Text>
        </FadeInView>

        <FadeInView delay={60} className="flex-row gap-2">
          <Tile label="Credit Limit" value={formatPeso(totals.creditLimit)} />
          <Tile label="Available" value={formatPeso(totals.availableLimit)} />
          <Tile label="Accounts" value={formatPeso(acctTotals.available)} />
        </FadeInView>

        <FadeInView delay={100}>
          <SegmentedTabs
            tabs={[{ value: 'cards', label: 'Cards' }, { value: 'bills', label: 'Bills' }, { value: 'accounts', label: 'Accounts' }]}
            active={tab}
            onChange={setTab}
          />
        </FadeInView>

        {tab === 'cards' ? (
          <FadeInView delay={120} className="gap-3">
            <PressableScale onPress={() => setCardModal(true)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3">
              <Plus size={18} color="#ffffff" />
              <Text className="font-sans-semibold text-sm text-white">Add Card</Text>
            </PressableScale>
            {cards.length === 0 ? (
              <Card><EmptyState icon={<CreditCard size={20} color={colors.slate500} />} title="No cards yet" body="Add a credit card to track its limit and bills." /></Card>
            ) : (
              cards.map((c: any) => (
                <View key={c.id} className="overflow-hidden rounded-2xl">
                  <LinearGradient colors={[c.primaryColor || '#1e3a8a', c.secondaryColor || '#0ea5e9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
                    <View className="flex-row items-start justify-between">
                      <Text className="font-sans-bold text-base text-white" numberOfLines={1}>{c.bankName || 'Card'}</Text>
                      <Pressable onPress={() => Alert.alert('Delete card?', `Remove ${c.bankName} ••${c.last4}? Its bills are removed too.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteCard(c.id) }])}>
                        <Trash2 size={16} color="#ffffff" />
                      </Pressable>
                    </View>
                    <Text className="mt-6 font-mono text-lg tracking-widest text-white">•••• {c.last4 || '••••'}</Text>
                    <View className="mt-4 flex-row items-end justify-between">
                      <View>
                        <Text className="font-sans text-[10px] uppercase text-white/70">Available</Text>
                        <Text className="font-mono-semibold text-sm text-white">{formatPeso(c.availableLimit)}</Text>
                      </View>
                      <View className="items-end">
                        <Text className="font-sans text-[10px] uppercase text-white/70">Limit · {c.network}</Text>
                        <Text className="font-mono-semibold text-sm text-white">{formatPeso(c.creditLimit)}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              ))
            )}
          </FadeInView>
        ) : tab === 'bills' ? (
          <FadeInView delay={120} className="gap-3">
            <PressableScale onPress={() => cards.length ? setBillModal(true) : Alert.alert('Add a card first', 'Bills are tied to a card.')} className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3">
              <Plus size={18} color="#ffffff" />
              <Text className="font-sans-semibold text-sm text-white">Add Bill</Text>
            </PressableScale>
            {bills.length === 0 ? (
              <Card><EmptyState title="No bills yet" body="Add a card bill to track due dates and payments." /></Card>
            ) : (
              <Card>
                {bills.map((b: any, idx: number) => {
                  const st = billState(b, payments, today)
                  const urg = urgencyBadge(b, today)
                  const card = cards.find((c: any) => c.id === b.cardId)
                  return (
                    <View key={b.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                      <View className="flex-row items-center justify-between">
                        <View className="min-w-0 flex-1">
                          <Text className="font-sans-semibold text-sm text-slate-900" numberOfLines={1}>{card?.bankName ?? 'Card'} ••{card?.last4}</Text>
                          <Text className="font-sans text-xs text-slate-500">Due {b.dueDate} · {urg.label}</Text>
                        </View>
                        <View className="items-end">
                          <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(b.amountDue)}</Text>
                          <Text className={`font-sans text-[11px] ${st.status === 'paid' ? 'text-emerald-700' : st.status === 'past_due' ? 'text-red-600' : 'text-amber-700'}`}>
                            {st.status === 'paid' ? 'Paid' : `${formatPeso(st.remaining)} left`}
                          </Text>
                        </View>
                      </View>
                      <View className="mt-2 flex-row gap-2">
                        {st.remaining > 0 ? (
                          <PressableScale onPress={() => setPayModal(b)} className="flex-1 items-center rounded-xl bg-navy-800 py-2">
                            <Text className="font-sans-semibold text-xs text-white">Pay bill</Text>
                          </PressableScale>
                        ) : null}
                        <PressableScale onPress={() => Alert.alert('Delete bill?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteBill(b.id) }])} className="items-center rounded-xl bg-red-50 px-3 py-2">
                          <Trash2 size={15} color="#dc2626" />
                        </PressableScale>
                      </View>
                    </View>
                  )
                })}
              </Card>
            )}
          </FadeInView>
        ) : (
          <FadeInView delay={120} className="gap-3">
            <PressableScale onPress={() => setAcctModal(true)} className="flex-row items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3">
              <Plus size={18} color="#ffffff" />
              <Text className="font-sans-semibold text-sm text-white">Add Account</Text>
            </PressableScale>
            {accounts.length === 0 ? (
              <Card><EmptyState title="No accounts yet" body="Add a funding account to pay bills from." /></Card>
            ) : (
              accounts.map((a: any) => (
                <Card key={a.id}>
                  <View className="flex-row items-center justify-between px-4 py-3.5">
                    <View className="min-w-0 flex-1">
                      <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>{a.bankName || 'Account'}</Text>
                      <Text className="font-mono text-xs text-slate-500">••{accountLast4(a)} · {a.productType || 'Account'}</Text>
                    </View>
                    <View className="items-end">
                      <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(a.availableBalance)}</Text>
                      <Text className="font-sans text-[10px] text-slate-500">available</Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2 border-t border-slate-100 px-4 py-2.5">
                    <PressableScale onPress={() => setTxnModal({ accountId: a.id, kind: 'income' })} className="flex-1 items-center rounded-xl bg-emerald-50 py-2">
                      <Text className="font-sans-semibold text-xs text-emerald-700">+ Income</Text>
                    </PressableScale>
                    <PressableScale onPress={() => setTxnModal({ accountId: a.id, kind: 'expense' })} className="flex-1 items-center rounded-xl bg-red-50 py-2">
                      <Text className="font-sans-semibold text-xs text-red-600">− Expense</Text>
                    </PressableScale>
                    <PressableScale onPress={() => Alert.alert('Delete account?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteAccount(a.id) }])} className="items-center rounded-xl bg-slate-100 px-3 py-2">
                      <Trash2 size={15} color={colors.slate500} />
                    </PressableScale>
                  </View>
                </Card>
              ))
            )}
          </FadeInView>
        )}
      </ScrollView>

      <AddCardModal visible={cardModal} onClose={() => setCardModal(false)} onSave={addCard} />
      <AddBillModal visible={billModal} cards={cards} onClose={() => setBillModal(false)} onSave={addBill} today={today} />
      <AddAccountModal visible={acctModal} onClose={() => setAcctModal(false)} onSave={addAccount} />
      <PayBillModal bill={payModal} accounts={accounts} onClose={() => setPayModal(null)} onSave={payBill} today={today} payments={payments} />
      <TxnModal draft={txnModal} onClose={() => setTxnModal(null)} onSave={addAccountTxn} today={today} />
    </SafeAreaView>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-3">
      <Text className="font-sans-medium text-[11px] text-slate-500">{label}</Text>
      <Text className="mt-0.5 font-mono-semibold text-sm text-slate-900" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  )
}

function Sheet({ visible, title, onClose, children }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View className="max-h-[90%] rounded-t-3xl bg-white p-5">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-sans-bold text-lg text-slate-900">{title}</Text>
            <Pressable onPress={onClose} className="p-1"><X size={22} color={colors.slate500} /></Pressable>
          </View>
          <ScrollView>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function Labeled({ label, children }: any) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 font-sans-medium text-xs text-slate-500">{label}</Text>
      {children}
    </View>
  )
}

function OptionRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Pressable key={o} onPress={() => onChange(o)} className={`rounded-xl border px-3 py-2 ${value === o ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'}`}>
          <Text className="font-sans-medium text-xs text-slate-800">{o}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function AddCardModal({ visible, onClose, onSave }: any) {
  const [bankName, setBankName] = useState('')
  const [last4, setLast4] = useState('')
  const [network, setNetwork] = useState(NETWORKS[0])
  const [tier, setTier] = useState(TIERS[0])
  const [category, setCategory] = useState(CATEGORIES[0])
  const [creditLimit, setCreditLimit] = useState<number | null>(null)
  const [availableLimit, setAvailableLimit] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!bankName.trim()) return Alert.alert('Missing', 'Enter the bank name.')
    setBusy(true)
    const res = await onSave({
      bankName: bankName.trim(), last4, network, tier, category,
      creditLimit: creditLimit ?? 0, availableLimit: availableLimit ?? creditLimit ?? 0,
      primaryColor: '#1e3a8a', secondaryColor: '#0ea5e9', first6: '', statementDate: '', dueDate: '',
    })
    setBusy(false)
    if (res?.error) Alert.alert('Failed', res.error)
    else { setBankName(''); setLast4(''); setCreditLimit(null); setAvailableLimit(null); onClose() }
  }

  return (
    <Sheet visible={visible} title="Add Card" onClose={onClose}>
      <Labeled label="Bank name"><TextInput value={bankName} onChangeText={setBankName} className={input} placeholder="BPI Gold" placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Last 4 digits"><TextInput value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} className={`${input} font-mono`} placeholder="1234" placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Network"><OptionRow options={NETWORKS} value={network} onChange={setNetwork} /></Labeled>
      <Labeled label="Tier"><OptionRow options={TIERS} value={tier} onChange={setTier} /></Labeled>
      <Labeled label="Category"><OptionRow options={CATEGORIES} value={category} onChange={setCategory} /></Labeled>
      <Labeled label="Credit limit"><CurrencyInput value={creditLimit} onValueChange={setCreditLimit} className={`${input} font-mono`} /></Labeled>
      <Labeled label="Available limit"><CurrencyInput value={availableLimit} onValueChange={setAvailableLimit} className={`${input} font-mono`} /></Labeled>
      <Button onPress={save} loading={busy} disabled={busy}>Save card</Button>
      <View className="h-4" />
    </Sheet>
  )
}

function AddBillModal({ visible, cards, onClose, onSave, today }: any) {
  const [cardId, setCardId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)
  const [dueDate, setDueDate] = useState(today)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!cardId) return Alert.alert('Missing', 'Select a card.')
    if (!(Number(amount) > 0)) return Alert.alert('Missing', 'Enter the amount due.')
    setBusy(true)
    await onSave({ cardId, amountDue: Number(amount), dueDate })
    setBusy(false)
    setAmount(null); setCardId(''); onClose()
  }

  return (
    <Sheet visible={visible} title="Add Bill" onClose={onClose}>
      <Labeled label="Card">
        <View className="gap-1.5">
          {cards.map((c: any) => (
            <Pressable key={c.id} onPress={() => setCardId(c.id)} className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${cardId === c.id ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'}`}>
              <Text className="font-sans-medium text-sm text-slate-900">{c.bankName} ••{c.last4}</Text>
              {cardId === c.id ? <Check size={16} color={colors.navy700} /> : null}
            </Pressable>
          ))}
        </View>
      </Labeled>
      <Labeled label="Amount due"><CurrencyInput value={amount} onValueChange={setAmount} className={`${input} font-mono`} /></Labeled>
      <Labeled label="Due date"><TextInput value={dueDate} onChangeText={setDueDate} autoCapitalize="none" placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} className={`${input} font-mono`} /></Labeled>
      <Button onPress={save} loading={busy} disabled={busy}>Save bill</Button>
      <View className="h-4" />
    </Sheet>
  )
}

function AddAccountModal({ visible, onClose, onSave }: any) {
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [productType, setProductType] = useState('')
  const [availableBalance, setAvailableBalance] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!bankName.trim()) return Alert.alert('Missing', 'Enter the bank name.')
    setBusy(true)
    const res = await onSave({ bankName: bankName.trim(), accountNumber, productType, bankCode: '', swiftCode: '', branch: '', ownership: '', availableBalance: availableBalance ?? 0, maintainingBalance: 0, debitCardNumber: '' })
    setBusy(false)
    if (res?.error) Alert.alert('Failed', res.error)
    else { setBankName(''); setAccountNumber(''); setAvailableBalance(null); onClose() }
  }

  return (
    <Sheet visible={visible} title="Add Account" onClose={onClose}>
      <Labeled label="Bank name"><TextInput value={bankName} onChangeText={setBankName} className={input} placeholder="BPI" placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Account number"><TextInput value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" className={`${input} font-mono`} placeholder="1234567890" placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Product type"><TextInput value={productType} onChangeText={setProductType} className={input} placeholder="Savings" placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Available balance"><CurrencyInput value={availableBalance} onValueChange={setAvailableBalance} className={`${input} font-mono`} /></Labeled>
      <Button onPress={save} loading={busy} disabled={busy}>Save account</Button>
      <View className="h-4" />
    </Sheet>
  )
}

function PayBillModal({ bill, accounts, onClose, onSave, today, payments }: any) {
  const [amount, setAmount] = useState<number | null>(null)
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState(false)
  const remaining = bill ? billState(bill, payments, today).remaining : 0

  const save = async () => {
    if (!(Number(amount) > 0)) return Alert.alert('Missing', 'Enter the payment amount.')
    setBusy(true)
    await onSave(bill.id, { amount: Number(amount), paidOn: today, accountId: accountId || null })
    setBusy(false)
    setAmount(null); setAccountId(''); onClose()
  }

  return (
    <Sheet visible={!!bill} title="Pay Bill" onClose={onClose}>
      <Text className="mb-3 font-sans text-sm text-slate-600">Remaining: {formatPeso(remaining)}</Text>
      <Labeled label="Payment amount"><CurrencyInput value={amount} onValueChange={setAmount} className={`${input} font-mono`} /></Labeled>
      <Labeled label="Pay from account (optional)">
        <View className="gap-1.5">
          <Pressable onPress={() => setAccountId('')} className={`rounded-xl border px-3 py-2.5 ${!accountId ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'}`}>
            <Text className="font-sans-medium text-sm text-slate-700">None</Text>
          </Pressable>
          {accounts.map((a: any) => (
            <Pressable key={a.id} onPress={() => setAccountId(a.id)} className={`flex-row items-center justify-between rounded-xl border px-3 py-2.5 ${accountId === a.id ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white'}`}>
              <Text className="font-sans-medium text-sm text-slate-900">{a.bankName} ••{accountLast4(a)}</Text>
              {accountId === a.id ? <Check size={16} color={colors.navy700} /> : null}
            </Pressable>
          ))}
        </View>
      </Labeled>
      <Button onPress={save} loading={busy} disabled={busy}>Record payment</Button>
      <View className="h-4" />
    </Sheet>
  )
}

function TxnModal({ draft, onClose, onSave, today }: any) {
  const [amount, setAmount] = useState<number | null>(null)
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState(false)
  const kind = draft?.kind
  const cats = kind === 'income' ? INCOME_CATEGORIES : ['Food', 'Bills', 'Shopping', 'Transport', 'Others']

  const save = async () => {
    if (!(Number(amount) > 0)) return Alert.alert('Missing', 'Enter a valid amount.')
    setBusy(true)
    const res = await onSave({ accountId: draft.accountId, kind, amount: Number(amount), merchant, category, txnDate: today })
    setBusy(false)
    if (res?.error) Alert.alert('Failed', res.error)
    else { setAmount(null); setMerchant(''); setCategory(''); onClose() }
  }

  return (
    <Sheet visible={!!draft} title={kind === 'income' ? 'Add Income' : 'Add Expense'} onClose={onClose}>
      <Labeled label="Amount"><CurrencyInput value={amount} onValueChange={setAmount} className={`${input} font-mono`} /></Labeled>
      <Labeled label={kind === 'income' ? 'Source' : 'Merchant'}><TextInput value={merchant} onChangeText={setMerchant} className={input} placeholderTextColor={colors.slate400} /></Labeled>
      <Labeled label="Category"><OptionRow options={cats} value={category} onChange={setCategory} /></Labeled>
      <Button onPress={save} loading={busy} disabled={busy}>Save</Button>
      <View className="h-4" />
    </Sheet>
  )
}
