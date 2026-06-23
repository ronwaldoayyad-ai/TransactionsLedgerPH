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
  createdAt: r.created_at ?? null,
})
const toDbCard = (c) => ({
  bank_name: c.bankName,
  bank_logo: c.bankLogo || null,
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
  createdAt: r.created_at ?? null,
})

let demoSeq = 0
const demoId = () => `w-${Date.now()}-${++demoSeq}`

export function useWallet() {
  const { realSession } = useApp()
  const isLive = realSession?.source === 'supabase'

  const [cards, setCards] = useState([])
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(isLive)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    const [c, b, p] = await Promise.all([
      supabase.from('wallet_cards').select('*').order('created_at'),
      supabase.from('wallet_bills').select('*').order('due_date'),
      supabase.from('wallet_payments').select('*').order('paid_on', { ascending: false }),
    ])
    const failed = c.error || b.error || p.error
    if (failed) {
      console.error('[wallet] load failed:', failed.message)
      setError(`${failed.message} — a migration may be missing`)
    } else setError(null)
    setCards((c.data ?? []).map(mapCard))
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
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_cards')
          .insert(toDbCard(input))
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
      const card = { ...input, id: demoId() }
      setCards((prev) => [...prev, card])
      return { card }
    },
    [isLive],
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

  const payBill = useCallback(
    async (billId, { amount, paidOn }) => {
      const bill = bills.find((b) => b.id === billId)
      if (!bill || !(amount > 0)) return null
      let payment
      if (isLive) {
        const { data, error: e } = await supabase
          .from('wallet_payments')
          .insert({ bill_id: billId, amount, paid_on: paidOn })
          .select()
          .single()
        if (e) {
          setError(e.message)
          return null
        }
        payment = mapPayment(data)
      } else {
        payment = { id: demoId(), billId, amount: round2(amount), paidOn }
      }
      setPayments((prev) => [payment, ...prev])
      await bumpAvailable(bill.cardId, amount)
      return payment
    },
    [isLive, bills, bumpAvailable],
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
    },
    [isLive, payments, bills, bumpAvailable],
  )

  return useMemo(
    () => ({
      cards,
      bills,
      payments,
      loading,
      error,
      reload,
      addCard,
      updateCard,
      deleteCard,
      addBill,
      updateBill,
      deleteBill,
      payBill,
      deletePayment,
    }),
    [cards, bills, payments, loading, error, reload, addCard, updateCard, deleteCard, addBill, updateBill, deleteBill, payBill, deletePayment],
  )
}
