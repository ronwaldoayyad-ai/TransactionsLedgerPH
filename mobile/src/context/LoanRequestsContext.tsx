import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useApp } from './AppContext'
import { supabase } from '../lib/supabase'

// Data layer for the Loan Request feature (borrower submit + admin approval).
// Live Supabase, RLS-scoped, with Realtime refetch. Tolerates a missing schema
// (before the migration is run) by degrading to empty data. Mirrors the web
// LoanRequestsContext 1:1.

const LoanRequestsContext = createContext<any>(null)

const mapRate = (r: any) => ({ termMonths: r.term_months, monthlyRate: Number(r.monthly_rate) })
const mapAccess = (r: any) => ({ userId: r.user_id, enabled: !!r.enabled })
const mapRequest = (r: any) => ({
  id: r.id,
  reference: r.reference,
  userId: r.user_id,
  amount: Number(r.amount),
  termMonths: r.term_months,
  monthlyRate: Number(r.monthly_rate),
  bankName: r.bank_name,
  bankAccountNumber: r.bank_account_number,
  bankAccountName: r.bank_account_name,
  processingFee: Number(r.processing_fee),
  notarialFee: Number(r.notarial_fee),
  dst: Number(r.dst),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})
const mapEvent = (r: any) => ({
  id: r.id,
  requestId: r.request_id,
  status: r.status,
  note: r.note ?? '',
  actor: r.actor ?? '',
  createdAt: r.created_at,
})

export function LoanRequestsProvider({ children }: { children: ReactNode }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const me = session?.user ?? null
  const meId = me?.id ?? null
  const isAdmin = me?.role === 'admin'

  const [rates, setRates] = useState<any[]>([])
  const [accessList, setAccessList] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(isLive)

  const fetchAll = useCallback(async () => {
    if (!isLive || !meId) return
    const results = await Promise.allSettled([
      supabase.from('loan_request_rates').select('*').order('term_months'),
      supabase.from('loan_request_access').select('*'),
      supabase.from('loan_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('loan_request_events').select('*').order('created_at'),
    ])
    const [ratesRes, accessRes, reqRes, evRes] = results as any[]
    if (ratesRes.status === 'fulfilled' && !ratesRes.value.error) {
      setRates((ratesRes.value.data ?? []).map(mapRate))
    } else {
      console.warn('[loan-requests] rates unavailable (run the migration?)')
    }
    if (accessRes.status === 'fulfilled' && !accessRes.value.error) {
      setAccessList((accessRes.value.data ?? []).map(mapAccess))
    }
    if (reqRes.status === 'fulfilled' && !reqRes.value.error) {
      setRequests((reqRes.value.data ?? []).map(mapRequest))
    }
    if (evRes.status === 'fulfilled' && !evRes.value.error) {
      setEvents((evRes.value.data ?? []).map(mapEvent))
    }
  }, [isLive, meId])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    let active = true
    ;(async () => {
      await fetchAll()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isLive, meId, fetchAll])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    const channel = supabase
      .channel(`loan-requests-rt-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_request_events' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_request_rates' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_request_access' }, () => fetchAll())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchAll])

  const ratesByTerm = useMemo(() => {
    const map: Record<number, number> = {}
    rates.forEach((r) => {
      map[r.termMonths] = r.monthlyRate
    })
    return map
  }, [rates])

  const canRequest = useMemo(() => {
    if (isAdmin) return false
    return accessList.some((a) => a.userId === meId && a.enabled)
  }, [accessList, meId, isAdmin])

  const myRequests = useMemo(() => requests.filter((r) => r.userId === meId), [requests, meId])

  const eventsFor = useCallback(
    (requestId: string) =>
      events
        .filter((e) => e.requestId === requestId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [events],
  )

  const submitRequest = useCallback(
    async ({ amount, termMonths, bankName, bankAccountNumber, bankAccountName }: any) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase.rpc('submit_loan_request', {
        p_amount: amount,
        p_term: termMonths,
        p_bank_name: bankName,
        p_account_number: bankAccountNumber,
        p_account_name: bankAccountName,
      })
      if (error) {
        console.error('[loan-requests] submit failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const cancelRequest = useCallback(
    async (id: string, note = '') => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase.rpc('cancel_my_loan_request', { p_id: id, p_note: note })
      if (error) {
        console.error('[loan-requests] cancel failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const updateMyBank = useCallback(
    async (id: string, { bankName, bankAccountNumber, bankAccountName }: any) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase.rpc('update_my_loan_request_bank', {
        p_id: id,
        p_bank_name: bankName,
        p_account_number: bankAccountNumber,
        p_account_name: bankAccountName,
      })
      if (error) {
        console.error('[loan-requests] bank update failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const updateStatus = useCallback(
    async (id: string, status: string, note = '') => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase.rpc('update_loan_request_status', {
        p_id: id,
        p_status: status,
        p_note: note,
      })
      if (error) {
        console.error('[loan-requests] status update failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const updateFees = useCallback(
    async (id: string, { notarialFee, dst }: any) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase
        .from('loan_requests')
        .update({ notarial_fee: notarialFee, dst })
        .eq('id', id)
      if (error) {
        console.error('[loan-requests] fee update failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const setRate = useCallback(
    async (termMonths: number, monthlyRate: number) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase
        .from('loan_request_rates')
        .upsert({ term_months: termMonths, monthly_rate: monthlyRate, updated_at: new Date().toISOString() })
      if (error) {
        console.error('[loan-requests] rate save failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const setAccess = useCallback(
    async (userId: string, enabled: boolean) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase
        .from('loan_request_access')
        .upsert({ user_id: userId, enabled, updated_at: new Date().toISOString() })
      if (error) {
        console.error('[loan-requests] access save failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const deleteRequests = useCallback(
    async (ids: string | string[]) => {
      if (!isLive) return { error: 'Live session required.' }
      const list = Array.isArray(ids) ? ids : [ids]
      if (list.length === 0) return {}
      const { error } = await supabase.from('loan_requests').delete().in('id', list)
      if (error) {
        console.error('[loan-requests] delete failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const accessFor = useCallback(
    (userId: string) => accessList.find((a) => a.userId === userId)?.enabled ?? false,
    [accessList],
  )

  const value = useMemo(
    () => ({
      loading,
      rates,
      ratesByTerm,
      canRequest,
      myRequests,
      requests,
      eventsFor,
      accessFor,
      submitRequest,
      cancelRequest,
      updateMyBank,
      updateStatus,
      updateFees,
      deleteRequests,
      setRate,
      setAccess,
    }),
    [
      loading,
      rates,
      ratesByTerm,
      canRequest,
      myRequests,
      requests,
      eventsFor,
      accessFor,
      submitRequest,
      cancelRequest,
      updateMyBank,
      updateStatus,
      updateFees,
      deleteRequests,
      setRate,
      setAccess,
    ],
  )

  return <LoanRequestsContext.Provider value={value}>{children}</LoanRequestsContext.Provider>
}

export function useLoanRequests() {
  const ctx = useContext(LoanRequestsContext)
  if (!ctx) throw new Error('useLoanRequests must be used within LoanRequestsProvider')
  return ctx
}
