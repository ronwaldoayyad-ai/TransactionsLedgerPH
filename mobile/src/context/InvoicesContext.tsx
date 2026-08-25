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

// Invoice data layer (mobile). RLS scopes reads: admins get every invoice,
// borrowers get only their own ASSIGNED invoices. Admin-only writes flow
// through the create_invoice RPC (atomic unique numbering) + assign/delete.
// Mirrors the web InvoicesContext.

const InvoicesContext = createContext<any>(null)

const mapInvoice = (r: any) => ({
  id: r.id,
  invoiceNumber: r.invoice_number,
  userId: r.user_id,
  billedToName: r.billed_to_name ?? '',
  status: r.status,
  invoiceDate: r.invoice_date,
  dueDate: r.due_date,
  selectedDueDates: r.selected_due_dates ?? [],
  subtotal: Number(r.subtotal),
  amountPaid: Number(r.amount_paid),
  processingFee: Number(r.processing_fee),
  totalDue: Number(r.total_due),
  lineItems: r.line_items ?? [],
  createdBy: r.created_by ?? '',
  createdAt: r.created_at,
})

export function InvoicesProvider({ children }: { children: ReactNode }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const meId = session?.user?.id ?? null

  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(isLive)

  const fetchAll = useCallback(async () => {
    if (!isLive || !meId) return
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[invoices] load failed (run the migration?):', error.message)
      return
    }
    setInvoices((data ?? []).map(mapInvoice))
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
      .channel(`invoices-rt-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => fetchAll())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchAll])

  const createInvoice = useCallback(
    async ({ userId, billedToName, dueDate, selectedDueDates, subtotal, amountPaid, processingFee, totalDue, lineItems }: any) => {
      if (!isLive) return { error: 'Live session required.' }
      const { data, error } = await supabase.rpc('create_invoice', {
        p_user_id: userId,
        p_billed_to_name: billedToName,
        p_due_date: dueDate,
        p_selected_due_dates: selectedDueDates ?? [],
        p_subtotal: subtotal,
        p_amount_paid: amountPaid,
        p_processing_fee: processingFee ?? 0,
        p_total_due: totalDue,
        p_line_items: lineItems ?? [],
      })
      if (error) {
        console.error('[invoices] create failed:', error.message)
        return { error: error.message }
      }
      const row = Array.isArray(data) ? data[0] : data
      await fetchAll()
      return { invoice: row ? mapInvoice(row) : null }
    },
    [isLive, fetchAll],
  )

  const assignInvoice = useCallback(
    async (id: string) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) {
        console.error('[invoices] assign failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const deleteInvoice = useCallback(
    async (id: string) => {
      if (!isLive) return { error: 'Live session required.' }
      const { error } = await supabase.from('invoices').delete().eq('id', id)
      if (error) {
        console.error('[invoices] delete failed:', error.message)
        return { error: error.message }
      }
      await fetchAll()
      return {}
    },
    [isLive, fetchAll],
  )

  const value = useMemo(
    () => ({ invoices, loading, createInvoice, assignInvoice, deleteInvoice, refreshInvoices: fetchAll }),
    [invoices, loading, createInvoice, assignInvoice, deleteInvoice, fetchAll],
  )

  return <InvoicesContext.Provider value={value}>{children}</InvoicesContext.Provider>
}

export function useInvoices() {
  const ctx = useContext(InvoicesContext)
  if (!ctx) throw new Error('useInvoices must be used within InvoicesProvider')
  return ctx
}
