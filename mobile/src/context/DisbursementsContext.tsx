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

// Loan Disbursement data layer (mobile). Mirrors the web DisbursementsContext.
// RLS scopes reads: admins get every disbursement, borrowers only their own
// ASSIGNED ones. Admin writes go through create_loan_disbursement + assign/
// status/delete; the borrower's acceptance flows through
// acknowledge_loan_disbursement (SECURITY DEFINER — notifies admins). Realtime
// keeps both sides in sync.

const DisbursementsContext = createContext<any>(null)

const mapDisbursement = (r: any) => ({
  id: r.id,
  disbursementNumber: r.disbursement_number,
  reference: r.reference ?? '',
  requestId: r.request_id ?? null,
  userId: r.user_id,
  status: r.status,
  disbursementDate: r.disbursement_date,
  agreementDate: r.agreement_date,
  loanAccountNumber: r.loan_account_number ?? '',
  bankName: r.bank_name ?? '',
  bankAccountNumber: r.bank_account_number ?? '',
  bankAccountName: r.bank_account_name ?? '',
  totalSanctionedAmount: Number(r.total_sanctioned_amount),
  grossAmount: Number(r.gross_amount),
  percentageOfTotal: Number(r.percentage_of_total),
  valueDate: r.value_date,
  processingFee: Number(r.processing_fee),
  notarialFee: Number(r.notarial_fee),
  dst: Number(r.dst),
  totalDeductions: Number(r.total_deductions),
  netProceeds: Number(r.net_proceeds),
  disbursementMode: r.disbursement_mode,
  deductionItems: r.deduction_items ?? [],
  acknowledgedAt: r.acknowledged_at,
  acknowledgedBy: r.acknowledged_by,
  createdBy: r.created_by ?? '',
  createdAt: r.created_at,
})

// Demo seed mirrors the web context so the accept loop is clickable offline.
const DEMO_DEDUCTIONS = [
  { id: 'dd-2', txnDate: '2026-08-03', description: 'Cash Loan (2 of 6)', dueDate: '2026-09-03', amount: 8333.33, sourceLoanLabel: 'Cash Loan' },
  { id: 'dd-3', txnDate: '2026-08-03', description: 'Cash Loan (3 of 6)', dueDate: '2026-10-03', amount: 8333.33, sourceLoanLabel: 'Cash Loan' },
  { id: 'dd-4', txnDate: '2026-08-03', description: 'Cash Loan (4 of 6)', dueDate: '2026-11-03', amount: 8333.33, sourceLoanLabel: 'Cash Loan' },
  { id: 'dd-5', txnDate: '2026-08-03', description: 'Cash Loan (5 of 6)', dueDate: '2026-12-03', amount: 8333.33, sourceLoanLabel: 'Cash Loan' },
  { id: 'dd-6', txnDate: '2026-08-03', description: 'Cash Loan (6 of 6)', dueDate: '2027-01-03', amount: 8333.35, sourceLoanLabel: 'Cash Loan' },
]
let demoDisbursements: any[] = [
  {
    id: 'disb-demo-1',
    disbursementNumber: 'DISB-2026-0001',
    reference: 'LOAN-20260831-0006',
    requestId: null,
    userId: 'u-001',
    status: 'assigned',
    disbursementDate: '2026-08-31',
    agreementDate: '2026-08-31',
    loanAccountNumber: 'LOAN-20260831-0006',
    bankName: 'Security Bank',
    bankAccountNumber: '0000004102332',
    bankAccountName: 'Maria Santos',
    totalSanctionedAmount: 650000,
    grossAmount: 650000,
    percentageOfTotal: 100,
    valueDate: '2026-08-31',
    processingFee: 1500,
    notarialFee: 2275,
    dst: 4875,
    totalDeductions: 41666.67,
    netProceeds: 608333.33,
    disbursementMode: 'bank_transfer',
    deductionItems: DEMO_DEDUCTIONS,
    acknowledgedAt: null,
    acknowledgedBy: null,
    createdBy: 'admin-1',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
]
let demoDisbSeq = 0
const demoDisbId = () => `disb-${Date.now()}-${++demoDisbSeq}`
const demoDisbNumber = () =>
  `DISB-${new Date().getFullYear()}-${String(demoDisbursements.length + 1).padStart(4, '0')}`

export function DisbursementsProvider({ children }: { children: ReactNode }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const meId = session?.user?.id ?? null
  const isAdmin = session?.user?.role === 'admin'

  const [liveDisbursements, setLiveDisbursements] = useState<any[]>([])
  const [demoVersion, setDemoVersion] = useState(0)
  const [loading, setLoading] = useState(isLive)

  const disbursements = useMemo(() => {
    if (!meId) return []
    const base = isLive ? liveDisbursements : demoDisbursements
    const scoped = isAdmin || isLive ? base : base.filter((d) => d.userId === meId)
    return [...scoped].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveDisbursements, demoVersion, meId, isAdmin])

  const fetchAll = useCallback(async () => {
    if (!isLive || !meId) return
    const { data, error } = await supabase
      .from('loan_disbursements')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[disbursements] load failed (run the migration?):', error.message)
      return
    }
    setLiveDisbursements((data ?? []).map(mapDisbursement))
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
      .channel(`disbursements-rt-${meId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loan_disbursements' },
        () => fetchAll(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchAll])

  const createDisbursement = useCallback(
    async (d: any) => {
      if (!isLive) {
        const rec = {
          id: demoDisbId(),
          disbursementNumber: demoDisbNumber(),
          reference: d.reference ?? '',
          requestId: d.requestId ?? null,
          userId: d.userId,
          status: 'draft',
          disbursementDate: d.disbursementDate ?? null,
          agreementDate: d.agreementDate ?? null,
          loanAccountNumber: d.loanAccountNumber ?? '',
          bankName: d.bankName ?? '',
          bankAccountNumber: d.bankAccountNumber ?? '',
          bankAccountName: d.bankAccountName ?? '',
          totalSanctionedAmount: Number(d.totalSanctionedAmount) || 0,
          grossAmount: Number(d.grossAmount) || 0,
          percentageOfTotal: Number(d.percentageOfTotal) || 0,
          valueDate: d.valueDate ?? null,
          processingFee: Number(d.processingFee) || 0,
          notarialFee: Number(d.notarialFee) || 0,
          dst: Number(d.dst) || 0,
          totalDeductions: Number(d.totalDeductions) || 0,
          netProceeds: Number(d.netProceeds) || 0,
          disbursementMode: d.disbursementMode ?? 'bank_transfer',
          deductionItems: d.deductionItems ?? [],
          acknowledgedAt: null,
          acknowledgedBy: null,
          createdBy: meId,
          createdAt: new Date().toISOString(),
        }
        demoDisbursements = [rec, ...demoDisbursements]
        setDemoVersion((v) => v + 1)
        return { disbursement: rec }
      }
      const { data, error } = await supabase.rpc('create_loan_disbursement', {
        p_user_id: d.userId,
        p_request_id: d.requestId ?? null,
        p_reference: d.reference ?? '',
        p_agreement_date: d.agreementDate ?? null,
        p_loan_account_number: d.loanAccountNumber ?? '',
        p_bank_name: d.bankName ?? '',
        p_bank_account_number: d.bankAccountNumber ?? '',
        p_bank_account_name: d.bankAccountName ?? '',
        p_total_sanctioned_amount: d.totalSanctionedAmount ?? 0,
        p_gross_amount: d.grossAmount ?? 0,
        p_percentage_of_total: d.percentageOfTotal ?? 0,
        p_value_date: d.valueDate ?? null,
        p_disbursement_date: d.disbursementDate ?? null,
        p_processing_fee: d.processingFee ?? 0,
        p_notarial_fee: d.notarialFee ?? 0,
        p_dst: d.dst ?? 0,
        p_total_deductions: d.totalDeductions ?? 0,
        p_net_proceeds: d.netProceeds ?? 0,
        p_disbursement_mode: d.disbursementMode ?? 'bank_transfer',
        p_deduction_items: d.deductionItems ?? [],
      })
      if (error) {
        console.error('[disbursements] create failed:', error.message)
        return { error: error.message }
      }
      const row = Array.isArray(data) ? data[0] : data
      await fetchAll()
      return { disbursement: row ? mapDisbursement(row) : null }
    },
    [isLive, meId, fetchAll],
  )

  const assignDisbursement = useCallback(
    async (id: string) => {
      if (!isLive) {
        demoDisbursements = demoDisbursements.map((d) => (d.id === id ? { ...d, status: 'assigned' } : d))
        setDemoVersion((v) => v + 1)
        return {}
      }
      const { error } = await supabase
        .from('loan_disbursements')
        .update({ status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('[disbursements] assign failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const updateDisbursementStatus = useCallback(
    async (id: string, status: string) => {
      if (!isLive) {
        demoDisbursements = demoDisbursements.map((d) => (d.id === id ? { ...d, status } : d))
        setDemoVersion((v) => v + 1)
        return {}
      }
      const { error } = await supabase
        .from('loan_disbursements')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('[disbursements] status update failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const deleteDisbursement = useCallback(
    async (id: string) => {
      if (!isLive) {
        demoDisbursements = demoDisbursements.filter((d) => d.id !== id)
        setDemoVersion((v) => v + 1)
        return {}
      }
      const { error } = await supabase.from('loan_disbursements').delete().eq('id', id)
      if (error) {
        console.error('[disbursements] delete failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const acknowledgeDisbursement = useCallback(
    async (id: string) => {
      if (!isLive) {
        let updated: any = null
        demoDisbursements = demoDisbursements.map((d) => {
          if (d.id !== id) return d
          updated = { ...d, acknowledgedAt: new Date().toISOString(), acknowledgedBy: meId }
          return updated
        })
        setDemoVersion((v) => v + 1)
        return { disbursement: updated }
      }
      const { data, error } = await supabase.rpc('acknowledge_loan_disbursement', { p_id: id })
      if (error) {
        console.error('[disbursements] acknowledge failed:', error.message)
        return { error: error.message }
      }
      const row = Array.isArray(data) ? data[0] : data
      await fetchAll()
      return { disbursement: row ? mapDisbursement(row) : null }
    },
    [isLive, meId, fetchAll],
  )

  const value = useMemo(
    () => ({
      disbursements,
      loading,
      createDisbursement,
      assignDisbursement,
      updateDisbursementStatus,
      deleteDisbursement,
      acknowledgeDisbursement,
      refreshDisbursements: fetchAll,
    }),
    [
      disbursements,
      loading,
      createDisbursement,
      assignDisbursement,
      updateDisbursementStatus,
      deleteDisbursement,
      acknowledgeDisbursement,
      fetchAll,
    ],
  )

  return <DisbursementsContext.Provider value={value}>{children}</DisbursementsContext.Provider>
}

export function useDisbursements() {
  const ctx = useContext(DisbursementsContext)
  if (!ctx) throw new Error('useDisbursements must be used within DisbursementsProvider')
  return ctx
}
