import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../lib/supabase'
import { walletRound2 as round2 } from '../lib/wallet'

// Isolated Supabase data layer for the Card & Bills Wallet (wallet_* tables,
// RLS-scoped to the signed-in admin). Live-only port of the web useWallet hook.

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
const mapBill = (r) => ({ id: r.id, cardId: r.card_id, amountDue: num(r.amount_due), dueDate: day(r.due_date), createdAt: r.created_at ?? null })
const toDbBill = (b) => ({ card_id: b.cardId, amount_due: b.amountDue, due_date: b.dueDate })
const mapPayment = (r) => ({ id: r.id, billId: r.bill_id, amount: num(r.amount), paidOn: day(r.paid_on), note: r.note ?? '', accountId: r.account_id ?? null, createdAt: r.created_at ?? null })
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

export function useWallet() {
  const { realSession } = useApp()
  const isLive = realSession?.source === 'supabase'

  const [cards, setCards] = useState([])
  const [accounts, setAccounts] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
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

  const reload = useCallback(async () => {
    setLoading(true)
    await fetchAll()
    setLoading(false)
  }, [fetchAll])

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

  const addCard = useCallback(
    async (input) => {
      const sortOrder = cards.length ? Math.max(...cards.map((c) => c.sortOrder ?? 0)) + 1 : 0
      const { data, error: e } = await supabase.from('wallet_cards').insert({ ...toDbCard(input), sort_order: sortOrder }).select().single()
      if (e) {
        setError(e.message)
        return { error: e.message }
      }
      const card = mapCard(data)
      setCards((prev) => [...prev, card])
      return { card }
    },
    [cards],
  )

  const updateCard = useCallback(
    async (id, patch) => {
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      const merged = { ...cards.find((c) => c.id === id), ...patch }
      const { error: e } = await supabase.from('wallet_cards').update(toDbCard(merged)).eq('id', id)
      if (e) {
        setError(e.message)
        return e.message
      }
      return null
    },
    [cards],
  )

  const deleteCard = useCallback(
    async (id) => {
      const { error: e } = await supabase.from('wallet_cards').delete().eq('id', id)
      if (e) {
        setError(e.message)
        return
      }
      const billIds = new Set(bills.filter((b) => b.cardId === id).map((b) => b.id))
      setCards((prev) => prev.filter((c) => c.id !== id))
      setBills((prev) => prev.filter((b) => b.cardId !== id))
      setPayments((prev) => prev.filter((p) => !billIds.has(p.billId)))
    },
    [bills],
  )

  const addAccount = useCallback(
    async (input) => {
      const sortOrder = accounts.length ? Math.max(...accounts.map((a) => a.sortOrder ?? 0)) + 1 : 0
      const { data, error: e } = await supabase.from('wallet_accounts').insert({ ...toDbAccount(input), sort_order: sortOrder }).select().single()
      if (e) {
        setError(e.message)
        return { error: e.message }
      }
      const account = mapAccount(data)
      setAccounts((prev) => [...prev, account])
      return { account }
    },
    [accounts],
  )

  const updateAccount = useCallback(
    async (id, patch) => {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      const merged = { ...accounts.find((a) => a.id === id), ...patch }
      const { error: e } = await supabase.from('wallet_accounts').update(toDbAccount(merged)).eq('id', id)
      if (e) {
        setError(e.message)
        return e.message
      }
      return null
    },
    [accounts],
  )

  const deleteAccount = useCallback(async (id) => {
    const { error: e } = await supabase.from('wallet_accounts').delete().eq('id', id)
    if (e) {
      setError(e.message)
      return
    }
    setAccounts((prev) => prev.filter((a) => a.id !== id))
    setPayments((prev) => prev.map((p) => (p.accountId === id ? { ...p, accountId: null } : p)))
  }, [])

  const addBill = useCallback(async (input) => {
    const { data, error: e } = await supabase.from('wallet_bills').insert(toDbBill(input)).select().single()
    if (e) {
      setError(e.message)
      return null
    }
    const bill = mapBill(data)
    setBills((prev) => [...prev, bill])
    return bill
  }, [])

  const deleteBill = useCallback(async (id) => {
    const { error: e } = await supabase.from('wallet_bills').delete().eq('id', id)
    if (e) {
      setError(e.message)
      return
    }
    setBills((prev) => prev.filter((b) => b.id !== id))
    setPayments((prev) => prev.filter((p) => p.billId !== id))
  }, [])

  const bumpAvailable = useCallback(
    async (cardId, delta) => {
      const card = cards.find((c) => c.id === cardId)
      if (!card) return
      const next = Math.min(card.creditLimit, Math.max(0, round2((Number(card.availableLimit) || 0) + delta)))
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, availableLimit: next } : c)))
      const { error: e } = await supabase.from('wallet_cards').update({ available_limit: next }).eq('id', cardId)
      if (e) setError(e.message)
    },
    [cards],
  )

  const bumpAccount = useCallback(
    async (accountId, delta) => {
      const account = accounts.find((a) => a.id === accountId)
      if (!account) return
      const next = round2((Number(account.availableBalance) || 0) + delta)
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, availableBalance: next } : a)))
      const { error: e } = await supabase.from('wallet_accounts').update({ available_balance: next }).eq('id', accountId)
      if (e) setError(e.message)
    },
    [accounts],
  )

  const payBill = useCallback(
    async (billId, { amount, paidOn, note = '', accountId = null }) => {
      const bill = bills.find((b) => b.id === billId)
      if (!bill || !(amount > 0)) return null
      const { data, error: e } = await supabase.from('wallet_payments').insert({ bill_id: billId, amount, paid_on: paidOn, note, account_id: accountId }).select().single()
      if (e) {
        setError(e.message)
        return null
      }
      const payment = mapPayment(data)
      setPayments((prev) => [payment, ...prev])
      await bumpAvailable(bill.cardId, amount)
      if (accountId) await bumpAccount(accountId, -amount)
      return payment
    },
    [bills, bumpAvailable, bumpAccount],
  )

  const deletePayment = useCallback(
    async (paymentId) => {
      const payment = payments.find((p) => p.id === paymentId)
      if (!payment) return
      const bill = bills.find((b) => b.id === payment.billId)
      const { error: e } = await supabase.from('wallet_payments').delete().eq('id', paymentId)
      if (e) {
        setError(e.message)
        return
      }
      setPayments((prev) => prev.filter((p) => p.id !== paymentId))
      if (bill) await bumpAvailable(bill.cardId, -payment.amount)
      if (payment.accountId) await bumpAccount(payment.accountId, payment.amount)
    },
    [payments, bills, bumpAvailable, bumpAccount],
  )

  const addAccountTxn = useCallback(
    async ({ accountId, kind, amount, merchant = '', category = '', txnDate = null, note = '' }) => {
      if (!accountId || !(amount > 0) || (kind !== 'expense' && kind !== 'income')) {
        return { error: 'Enter a valid amount and account.' }
      }
      const { error: e } = await supabase.from('wallet_account_txns').insert({ account_id: accountId, kind, amount, merchant, category, txn_date: txnDate, note })
      if (e) {
        setError(e.message)
        return { error: e.message }
      }
      await bumpAccount(accountId, kind === 'expense' ? -amount : amount)
      return {}
    },
    [bumpAccount],
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
      addAccount,
      updateAccount,
      deleteAccount,
      addBill,
      deleteBill,
      payBill,
      deletePayment,
      addAccountTxn,
    }),
    [cards, accounts, bills, payments, loading, error, reload, addCard, updateCard, deleteCard, addAccount, updateAccount, deleteAccount, addBill, deleteBill, payBill, deletePayment, addAccountTxn],
  )
}
