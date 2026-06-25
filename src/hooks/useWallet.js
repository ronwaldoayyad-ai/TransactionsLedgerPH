import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../supabaseClient'
import { walletRound2 as round2 } from '../lib/wallet'

// Isolated data layer for the Card & Bills Wallet. Completely separate from the
// app's main AppContext store — it owns its own Supabase reads/writes against
// the wallet_* tables (rows scoped to the signed-in user by RLS). Demo sessions
// fall back to in-memory state (prototype only).

const num = (v) => (v == null ? 0 : Number(v))
const day = (v) => (v ? String(v).slice(0, 10) : null)

const mapCard = (r) => ({
  id: r.id,
  bankName: r.bank_name ?? '',
  bankLogo: r.bank_logo ?? '',
  networkLogo: r.network_logo ?? '',
  primaryColor: r.primary_color ?? '#1e3a8a',
  secondaryColor: r.secondary_color ?? '#0ea5e9',
  first6: r.first6 ?? '',
  last4: r.last4 ?? '',
  network: r.network ?? 'Visa',
  tier: r.tier ?? 'Classic',
  category: r.category ?? '',
  creditLimit: num(r.credit_limit),
  availableLimit: num(r.available_limit),
  statementDate: r.statement_date ?? '',
  dueDate: r.due_date ?? '',
  expiryDate: day(r.expiry_date),
  activationDate: day(r.activation_date),
  naffl: !!r.naffl,
  amf: num(r.amf),
  amfDate: day(r.amf_date),
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at ?? null,
})
// Note: sort_order is managed separately (addCard / moveCard), never via the
// edit form, so it is intentionally excluded here.
const toDbCard = (c) => ({
  bank_name: c.bankName,
  bank_logo: c.bankLogo || null,
  network_logo: c.networkLogo || null,
  primary_color: c.primaryColor,
  secondary_color: c.secondaryColor,
  first6: c.first6,
  last4: c.last4,
  network: c.network,
  tier: c.tier,
  category: c.category || null,
  credit_limit: c.creditLimit,
  available_limit: c.availableLimit,
  statement_date: c.statementDate,
  due_date: c.dueDate,
  expiry_date: c.expiryDate || null,
  activation_date: c.activationDate || null,
  naffl: !!c.naffl,
  amf: c.naffl ? 0 : c.amf || 0,
  amf_date: c.naffl ? null : c.amfDate || null,
})
const mapBill = (r) => ({
  id: r.id,
  cardId: r.card_id,
  amountDue: num(r.amount_due),
  dueDate: day(r.due_date),
  createdAt: r.created_at ?? null,
})
const toDbBill = (b) => ({ card_id: b.cardId, amount_due: b.amountDue, due_date: b.dueDate })
const mapPayment = (r) => ({
  id: r.id,
  billId: r.bill_id,
  amount: num(r.amount),
  paidOn: day(r.paid_on),
  note: r.note ?? '',
  accountId: r.account_id ?? null,
  createdAt: r.created_at ?? null,
})

const mapAccount = (r) => ({
  id: r.id,
  accountNumber: r.account_number ?? '',
  productType: r.product_type ?? '',
  bankName: r.bank_name ?? '',
  bankCode: r.bank_code ?? '',
  swiftCode: r.swift_code ?? '',
  branch: r.branch ?? '',
  ownership: r.ownership ?? '',
  availableBalance: num(r.available_balance),
  maintainingBalance: num(r.maintaining_balance),
  debitCardNumber: r.debit_card_number ?? '',
  sortOrder: r.sort_order ?? 0,
  createdAt: r.created_at ?? null,
})
const toDbAccount = (a) => ({
  account_number: a.accountNumber,
  product_type: a.productType,
  bank_name: a.bankName,
  bank_code: a.bankCode,
  swift_code: a.swiftCode,
  branch: a.branch,
  ownership: a.ownership,
  available_balance: a.availableBalance,
  maintaining_balance: a.maintainingBalance,
  debit_card_number: a.debitCardNumber,
})

let demoSeq = 0
const demoId = () => `w-${Date.now()}-${++demoSeq}`

export function useWallet() {
  const { realSession } = useApp()
  const isLive = realSession?.source === 'supabase'

  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(isLive)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    const [c, ac, b, p] = await Promise.all([
      supabase.from('wallet_cards').select('*').order('sort_order').order('created_at'),
      supabase.from('wallet_accounts').select('*').order('sort_order').order('created_at'),
      supabase.from('wallet_bills').select('*').order('due_date'),
      supabase.from('wallet_payments').select('*').order('paid_on', { ascending: false }),
    ])
    const failed = c.error || ac.error || b.error || p.error
    if (failed) {
      console.error('[wallet] load failed:', failed.message)
      setError(`${failed.message} — a migration may be missing`)
    } else setError(null)
    setCards((c.data ?? []).map(mapCard))
    setAccounts((ac.data ?? []).map(mapAccount))
    setBills((b.data ?? []).map(mapBill))
    setPayments((p.data ?? []).map(mapPayment))
  }, [])

  // Manual refresh (button / user event) — may set loading synchronously.
  const reload = useCallback(async () => {
    if (!isLive) return
    setLoading(true)
    await fetchAll()
    setLoading(false)
  }, [isLive, fetchAll])

  // Initial load: every setState happens AFTER the first await, so the effect
  // never sets state synchronously.
  useEffect(() => {
    if (!isLive) return undefined
    let active = true
    ;(async () => {
      await fetchAll()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isLive, fetchAll])

  // ---- Cards ----
  const addCard = useCallback(
    async (input) => {
      const sortOrder = cards.length ? Math.max(...cards.map((c) => c.sortOrder ?? 0)) + 1 : 0
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_cards')
          .insert({ ...toDbCard(input), sort_order: sortOrder })
          .select()
          .single()
        if (e) {
          setError(e.message)
          return { error: e.message }
        }
        const card = mapCard(data)
        setCards((prev) => [...prev, card])
        return { card }
      }
      const card = { ...input, id: demoId(), sortOrder }
      setCards((prev) => [...prev, card])
      return { card }
    },
    [isLive, cards],
  )

  // Reorder a card up/down. Reassigns sequential sort_order across all cards and
  // persists, so the Coverflow stack and the list stay in sync (and survive reload).
  const moveCard = useCallback(
    async (id, dir) => {
      const ordered = [...cards]
      const i = ordered.findIndex((c) => c.id === id)
      const j = i + (dir === 'up' ? -1 : 1)
      if (i < 0 || j < 0 || j >= ordered.length) return
      ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
      const reindexed = ordered.map((c, idx) => ({ ...c, sortOrder: idx }))
      setCards(reindexed)
      if (isLive) {
        await Promise.all(
          reindexed.map((c) =>
            supabase.from('wallet_cards').update({ sort_order: c.sortOrder }).eq('id', c.id),
          ),
        )
      }
    },
    [isLive, cards],
  )

  const updateCard = useCallback(
    async (id, patch) => {
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      if (isLive) {
        const merged = { ...cards.find((c) => c.id === id), ...patch }
        const { error: e } = await supabase.from('wallet_cards').update(toDbCard(merged)).eq('id', id)
        if (e) {
          setError(e.message)
          return e.message
        }
      }
      return null
    },
    [isLive, cards],
  )

  const deleteCard = useCallback(
    async (id) => {
      if (isLive) {
        const { error: e } = await supabase.from('wallet_cards').delete().eq('id', id)
        if (e) {
          setError(e.message)
          return
        }
      }
      // Cascade in DB removes the card's bills/payments; mirror locally.
      const billIds = new Set(bills.filter((b) => b.cardId === id).map((b) => b.id))
      setCards((prev) => prev.filter((c) => c.id !== id))
      setBills((prev) => prev.filter((b) => b.cardId !== id))
      setPayments((prev) => prev.filter((p) => !billIds.has(p.billId)))
    },
    [isLive, bills],
  )

  // ---- Accounts ---- (mirror the card CRUD + sort_order)
  const addAccount = useCallback(
    async (input) => {
      const sortOrder = accounts.length ? Math.max(...accounts.map((a) => a.sortOrder ?? 0)) + 1 : 0
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_accounts')
          .insert({ ...toDbAccount(input), sort_order: sortOrder })
          .select()
          .single()
        if (e) {
          setError(e.message)
          return { error: e.message }
        }
        const account = mapAccount(data)
        setAccounts((prev) => [...prev, account])
        return { account }
      }
      const account = { ...input, id: demoId(), sortOrder }
      setAccounts((prev) => [...prev, account])
      return { account }
    },
    [isLive, accounts],
  )

  const updateAccount = useCallback(
    async (id, patch) => {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      if (isLive) {
        const merged = { ...accounts.find((a) => a.id === id), ...patch }
        const { error: e } = await supabase.from('wallet_accounts').update(toDbAccount(merged)).eq('id', id)
        if (e) {
          setError(e.message)
          return e.message
        }
      }
      return null
    },
    [isLive, accounts],
  )

  const deleteAccount = useCallback(
    async (id) => {
      if (isLive) {
        const { error: e } = await supabase.from('wallet_accounts').delete().eq('id', id)
        if (e) {
          setError(e.message)
          return
        }
      }
      // DB sets payments.account_id to null on delete; mirror locally.
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      setPayments((prev) => prev.map((p) => (p.accountId === id ? { ...p, accountId: null } : p)))
    },
    [isLive],
  )

  const moveAccount = useCallback(
    async (id, dir) => {
      const ordered = [...accounts]
      const i = ordered.findIndex((a) => a.id === id)
      const j = i + (dir === 'up' ? -1 : 1)
      if (i < 0 || j < 0 || j >= ordered.length) return
      ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
      const reindexed = ordered.map((a, idx) => ({ ...a, sortOrder: idx }))
      setAccounts(reindexed)
      if (isLive) {
        await Promise.all(
          reindexed.map((a) =>
            supabase.from('wallet_accounts').update({ sort_order: a.sortOrder }).eq('id', a.id),
          ),
        )
      }
    },
    [isLive, accounts],
  )

  // ---- Bills ----
  const addBill = useCallback(
    async (input) => {
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_bills')
          .insert(toDbBill(input))
          .select()
          .single()
        if (e) {
          setError(e.message)
          return null
        }
        const bill = mapBill(data)
        setBills((prev) => [...prev, bill])
        return bill
      }
      const bill = { ...input, id: demoId() }
      setBills((prev) => [...prev, bill])
      return bill
    },
    [isLive],
  )

  const updateBill = useCallback(
    async (id, patch) => {
      setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)))
      if (isLive) {
        const merged = { ...bills.find((b) => b.id === id), ...patch }
        const { error: e } = await supabase.from('wallet_bills').update(toDbBill(merged)).eq('id', id)
        if (e) setError(e.message)
      }
    },
    [isLive, bills],
  )

  const deleteBill = useCallback(
    async (id) => {
      if (isLive) {
        const { error: e } = await supabase.from('wallet_bills').delete().eq('id', id)
        if (e) {
          setError(e.message)
          return
        }
      }
      setBills((prev) => prev.filter((b) => b.id !== id))
      setPayments((prev) => prev.filter((p) => p.billId !== id))
    },
    [isLive],
  )

  // ---- Payments ---- (FR2.5: paying a bill frees the tied card's available limit)
  const bumpAvailable = useCallback(
    async (cardId, delta) => {
      const card = cards.find((c) => c.id === cardId)
      if (!card) return
      const next = Math.min(
        card.creditLimit,
        Math.max(0, round2((Number(card.availableLimit) || 0) + delta)),
      )
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, availableLimit: next } : c)))
      if (isLive) {
        const { error: e } = await supabase
          .from('wallet_cards')
          .update({ available_limit: next })
          .eq('id', cardId)
        if (e) setError(e.message)
      }
    },
    [isLive, cards],
  )

  // Debit/credit an account's available balance (delta negative = debit).
  const bumpAccount = useCallback(
    async (accountId, delta) => {
      const account = accounts.find((a) => a.id === accountId)
      if (!account) return
      const next = round2((Number(account.availableBalance) || 0) + delta)
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, availableBalance: next } : a)))
      if (isLive) {
        const { error: e } = await supabase
          .from('wallet_accounts')
          .update({ available_balance: next })
          .eq('id', accountId)
        if (e) setError(e.message)
      }
    },
    [isLive, accounts],
  )

  const payBill = useCallback(
    async (billId, { amount, paidOn, note = '', accountId = null }) => {
      const bill = bills.find((b) => b.id === billId)
      if (!bill || !(amount > 0)) return null
      let payment
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_payments')
          .insert({ bill_id: billId, amount, paid_on: paidOn, note, account_id: accountId })
          .select()
          .single()
        if (e) {
          setError(e.message)
          return null
        }
        payment = mapPayment(data)
      } else {
        payment = { id: demoId(), billId, amount: round2(amount), paidOn, note, accountId }
      }
      setPayments((prev) => [payment, ...prev])
      await bumpAvailable(bill.cardId, amount)
      // Deduct from the source account's available balance, if one was chosen.
      if (accountId) await bumpAccount(accountId, -amount)
      return payment
    },
    [isLive, bills, bumpAvailable, bumpAccount],
  )

  // Edit a logged payment's note and/or source account. Changing the account
  // re-balances both: the old account is refunded, the new one debited.
  const updatePayment = useCallback(
    async (paymentId, { note, accountId = null }) => {
      const payment = payments.find((p) => p.id === paymentId)
      if (!payment) return
      const prevAccountId = payment.accountId ?? null
      const nextAccountId = accountId || null
      setPayments((prev) =>
        prev.map((p) => (p.id === paymentId ? { ...p, note: note ?? p.note, accountId: nextAccountId } : p)),
      )
      if (isLive) {
        const { error: e } = await supabase
          .from('wallet_payments')
          .update({ note: note ?? payment.note, account_id: nextAccountId })
          .eq('id', paymentId)
        if (e) {
          setError(e.message)
          return
        }
      }
      if (prevAccountId !== nextAccountId) {
        if (prevAccountId) await bumpAccount(prevAccountId, payment.amount) // refund old source
        if (nextAccountId) await bumpAccount(nextAccountId, -payment.amount) // debit new source
      }
    },
    [isLive, payments, bumpAccount],
  )

  // ---- Account transactions (Add Income / Add Expense) ----
  // Standalone account ledger entries: an expense debits the account's available
  // balance, an income credits it. The row is persisted for the record; the
  // balance change is the user-visible effect (mirrors payBill's insert→bump).
  const addAccountTxn = useCallback(
    async ({ accountId, kind, amount, merchant = '', category = '', txnDate = null, note = '' }) => {
      if (!accountId || !(amount > 0) || (kind !== 'expense' && kind !== 'income')) {
        return { error: 'Enter a valid amount and account.' }
      }
      if (isLive) {
        const { error: e } = await supabase.from('wallet_account_txns').insert({
          account_id: accountId,
          kind,
          amount,
          merchant,
          category,
          txn_date: txnDate,
          note,
        })
        if (e) {
          setError(e.message)
          return { error: e.message }
        }
      }
      await bumpAccount(accountId, kind === 'expense' ? -amount : amount)
      return {}
    },
    [isLive, bumpAccount],
  )

  const deletePayment = useCallback(
    async (paymentId) => {
      const payment = payments.find((p) => p.id === paymentId)
      if (!payment) return
      const bill = bills.find((b) => b.id === payment.billId)
      if (isLive) {
        const { error: e } = await supabase.from('wallet_payments').delete().eq('id', paymentId)
        if (e) {
          setError(e.message)
          return
        }
      }
      setPayments((prev) => prev.filter((p) => p.id !== paymentId))
      if (bill) await bumpAvailable(bill.cardId, -payment.amount)
      if (payment.accountId) await bumpAccount(payment.accountId, payment.amount) // refund
    },
    [isLive, payments, bills, bumpAvailable, bumpAccount],
  )

  return useMemo(
    () => ({
      cards,
      accounts,
      bills,
      payments,
      loading,
      error,
      reload,
      addCard,
      updateCard,
      deleteCard,
      moveCard,
      addAccount,
      updateAccount,
      deleteAccount,
      moveAccount,
      addBill,
      updateBill,
      deleteBill,
      payBill,
      updatePayment,
      deletePayment,
      addAccountTxn,
    }),
    [cards, accounts, bills, payments, loading, error, reload, addCard, updateCard, deleteCard, moveCard, addAccount, updateAccount, deleteAccount, moveAccount, addBill, updateBill, deleteBill, payBill, updatePayment, deletePayment, addAccountTxn],
  )
}
