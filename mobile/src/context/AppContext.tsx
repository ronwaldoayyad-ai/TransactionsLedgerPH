import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../lib/supabase'
import {
  mapArbitrageLoan,
  mapAudit,
  mapInterestRate,
  mapLoan,
  mapPayment,
  mapPaymentLog,
  mapProfile,
  mapTrackedLoan,
  mapTransaction,
  toDbArbitrageLoan,
  toDbPaymentLog,
  toDbTrackedLoan,
  toDbTransaction,
} from '../lib/dbMappers'
import {
  addMonthsClamped,
  buildDisclosure,
  parseISODate,
  toISODate,
} from '../lib/amortization'
import { allocate } from '../lib/paymentLogs'
import { clearPageStore } from '../lib/pageStateStore'

// Full port of the web AppContext (loan-amortization-app/src/context/
// AppContext.jsx). Same value shapes so screen logic transplants 1:1. This
// mobile build is LIVE-only (no demo/mock store), so the web's `isLive`
// branches collapse to the Supabase path. Both roles are served here: admins
// route to (admin), borrowers to (tabs) — mirrors the role-gated web app.

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  status: string
  firstName?: string
  lastName?: string
  nickname?: string
  phone?: string
  avatarPath?: string | null
  avatarUrl?: string | null
}

export type Session = {
  source: 'supabase'
  user: SessionUser
  needsPasswordSetup: boolean
}

type PickedFile = { uri: string; name: string; mimeType?: string | null }

const AppContext = createContext<any>(null)

const nowStamp = () =>
  new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

// RN has no global crypto.randomUUID on all engines — a v4 generator suffices
// for a profile id that the invite-adoption migration later reconciles by email.
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Error sink so fire-and-forget writes can surface failures in the sync banner.
let reportDbError: ((msg: string) => void) | null = null
const logDbError = (op: string) => ({ error }: any) => {
  if (error) {
    console.error(`[supabase] ${op} failed:`, error.message)
    reportDbError?.(`${op} failed: ${error.message}`)
  }
}

// One transaction per amortization installment, across every loan. Single
// source of truth for payment status (web parity).
const buildTransactions = (loanList: any[]) =>
  loanList.flatMap((loan) => {
    const txnDate =
      loan.txnDate ?? toISODate(addMonthsClamped(parseISODate(loan.firstPaymentDate), -1))
    const typeLabel = loan.txnType === 'straight' ? 'Straight' : 'Installment'
    return loan.disclosure.schedule.rows.map((row: any) => {
      const paid = row.n <= (loan.paidMonths ?? 0)
      return {
        id: `${loan.id}-${row.n}`,
        loanId: loan.id,
        userId: loan.userId,
        n: row.n,
        description:
          typeLabel === 'Straight' ? loan.label : `${loan.label} (${row.n} of ${loan.durationMonths})`,
        amount: row.total,
        type: typeLabel,
        txnDate,
        dueDate: row.date,
        status: paid ? 'paid' : 'unpaid',
        datePaid: paid ? row.date : null,
      }
    })
  })

// Read every row, paging past Supabase's ~1000-row API cap. `build` returns a
// fresh select each call so range applies.
const PAGE = 1000
async function fetchAllRows(build: () => any) {
  const all: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: all, error }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) return { data: all, error: null }
  }
}

// Read a picked file into an ArrayBuffer for Supabase Storage. RN's Blob
// support is unreliable for uploads — base64 → ArrayBuffer is the proven path.
async function readFileAsArrayBuffer(uri: string) {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
  return decode(b64)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true) // first fetch after sign-in
  const [refreshing, setRefreshing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  // Admin "view as borrower": the real session stays admin; screens see the
  // borrower through the effective session below.
  const [viewAs, setViewAs] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [loans, setLoans] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [archivedTransactions, setArchivedTransactions] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [paymentLogs, setPaymentLogs] = useState<any[]>([])
  const [arbitrageLoans, setArbitrageLoans] = useState<any[]>([])
  const [interestRates, setInterestRates] = useState<any[]>([])
  const [trackedLoans, setTrackedLoans] = useState<any[]>([])
  const [auditLog, setAuditLog] = useState<any[]>([])

  const actor = session?.user?.name ?? 'Admin'

  useEffect(() => {
    reportDbError = (msg) => setSyncError(msg)
    return () => {
      reportDbError = null
    }
  }, [])

  // Append an audit entry. Best-effort — never blocks the user's action.
  const log = useCallback((who: string, action: string, detail: string) => {
    supabase
      .from('audit_log')
      .insert({ actor: who, action, detail })
      .select()
      .single()
      .then(({ data, error }: any) => {
        if (error) console.warn('[supabase] audit insert failed:', error.message)
        else if (data) setAuditLog((prev) => [mapAudit(data), ...prev])
      })
  }, [])

  // Progressive load: core slices (loans + transactions) clear dataLoading so
  // the first screen paints; the rest (including admin-only slices) hydrate after.
  // RLS scopes rows — admins get everything, borrowers only their own.
  const loadLiveData = useCallback(async () => {
    const failures: string[] = []
    const run = async (label: string, fetch: () => any, apply: (rows: any[]) => void) => {
      try {
        const { data, error } = await fetch()
        if (error) failures.push(`${label} (${error.message})`)
        else apply(data ?? [])
      } catch (e: any) {
        failures.push(`${label} (${e?.message ?? 'unknown error'})`)
      }
    }

    try {
      const core = Promise.all([
        run(
          'loans',
          () => fetchAllRows(() => supabase.from('loans').select('*').order('created_at').order('id')),
          (rows) => setLoans(rows.map(mapLoan)),
        ),
        run(
          'transactions',
          () =>
            fetchAllRows(() => supabase.from('transactions').select('*').order('due_date').order('id')),
          (rows) => {
            const all = rows.map(mapTransaction)
            setTransactions(all.filter((t: any) => !t.archivedAt))
            setArchivedTransactions(all.filter((t: any) => t.archivedAt))
          },
        ),
      ])

      const rest = Promise.all([
        run(
          'profiles',
          () => fetchAllRows(() => supabase.from('profiles').select('*').order('created_at').order('id')),
          (rows) => setUsers(rows.map(mapProfile)),
        ),
        run(
          'payment logs',
          () =>
            fetchAllRows(() => supabase.from('payment_logs').select('*').order('created_at').order('id')),
          (rows) => setPaymentLogs(rows.map(mapPaymentLog)),
        ),
        // Admin-only slices — RLS returns an empty set for borrowers (not an error).
        run(
          'arbitrage',
          () =>
            fetchAllRows(() => supabase.from('arbitrage_loans').select('*').order('created_at').order('id')),
          (rows) => setArbitrageLoans(rows.map(mapArbitrageLoan)),
        ),
        run(
          'interest rates',
          () => fetchAllRows(() => supabase.from('interest_rates').select('*').order('kind').order('rate')),
          (rows) => setInterestRates(rows.map(mapInterestRate)),
        ),
        run(
          'loan tracker',
          () =>
            fetchAllRows(() => supabase.from('tracked_loans').select('*').order('created_at').order('id')),
          (rows) => setTrackedLoans(rows.map(mapTrackedLoan)),
        ),
        run(
          'audit log',
          () => supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(500),
          (rows) => setAuditLog(rows.map(mapAudit)),
        ),
        // Payments render immediately, then hydrate once signed URLs resolve.
        (async () => {
          try {
            const { data, error } = await fetchAllRows(() =>
              supabase.from('payments').select('*').order('submitted_at', { ascending: false }).order('id'),
            )
            if (error) {
              failures.push(`payments (${error.message})`)
              return
            }
            const paymentRows = data ?? []
            setPayments(paymentRows.map((p: any) => mapPayment(p, null)))
            const paths = [...new Set(paymentRows.map((p: any) => p.file_path).filter(Boolean))]
            if (paths.length === 0) return
            const urlByPath: Record<string, string> = {}
            const { data: signed } = await supabase.storage
              .from('payment-proofs')
              .createSignedUrls(paths as string[], 60 * 60)
            ;(signed ?? []).forEach((s: any, i: number) => {
              if (s?.signedUrl) urlByPath[paths[i] as string] = s.signedUrl
            })
            setPayments(paymentRows.map((p: any) => mapPayment(p, urlByPath[p.file_path] ?? null)))
          } catch (e: any) {
            console.error('[supabase] payments load failed:', e?.message ?? e)
          }
        })(),
      ])

      await core
      setDataLoading(false)
      await rest
      setSyncError(
        failures.length > 0 ? `Some records could not be refreshed: ${failures.join(', ')}.` : null,
      )
    } catch (e: any) {
      const msg = e?.message ?? 'Unexpected error while syncing with the database.'
      console.error('[supabase] loadLiveData crashed:', msg)
      setSyncError(msg)
    } finally {
      setDataLoading(false)
    }
  }, [])

  // Restore the session on launch, react to auth changes, resolve the profile,
  // then load data. Admins are NO LONGER blocked — routing handles the split.
  const authedUserId = useRef<string | null>(null)
  useEffect(() => {
    let mounted = true

    const loadProfile = async (sbSession: any) => {
      if (!sbSession) {
        authedUserId.current = null
        if (mounted) {
          setSession(null)
          setAuthLoading(false)
        }
        return
      }
      // Dedup redundant events: supabase-js on mobile re-fires SIGNED_IN /
      // INITIAL_SESSION on token refresh and app focus. Re-setting the session
      // object each time re-creates a new identity, re-running every consumer
      // and every dependent effect (realtime resubscribes, refetches) — which
      // presents as a periodic UI flicker. Only (re)load for a NEW user id.
      if (authedUserId.current === sbSession.user.id) {
        if (mounted) setAuthLoading(false)
        return
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sbSession.user.id)
        .single()
      if (!mounted) return
      if (profile && !error) {
        authedUserId.current = sbSession.user.id
        setSession({
          source: 'supabase',
          user: mapProfile(profile),
          needsPasswordSetup: profile.status === 'invited',
        })
        loadLiveData()
      }
      setAuthLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => loadProfile(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, sbSession) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setTimeout(() => loadProfile(sbSession), 0)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadLiveData])

  // Refetch when returning to the foreground after >1min backgrounded.
  const backgroundedAt = useRef<number | null>(null)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now()
      } else if (state === 'active') {
        const away = backgroundedAt.current ? Date.now() - backgroundedAt.current : 0
        backgroundedAt.current = null
        if (away > 60_000 && session) loadLiveData()
      }
    })
    return () => sub.remove()
  }, [session, loadLiveData])

  const refreshData = useCallback(async () => {
    clearPageStore()
    setRefreshing(true)
    await loadLiveData()
    setRefreshing(false)
  }, [loadLiveData])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }, [])

  // Admin "remote screen share": see what a borrower sees while staying admin.
  const startViewAs = useCallback((user: any) => setViewAs(user), [])
  const stopViewAs = useCallback(() => setViewAs(null), [])
  const isViewingAs = !!viewAs && session?.user?.role === 'admin'
  const effectiveSession = useMemo(
    () =>
      isViewingAs
        ? { ...session, user: { ...viewAs, role: 'user' }, needsPasswordSetup: false }
        : session,
    [isViewingAs, session, viewAs],
  )

  const completePasswordSetup = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: error.message }
    await supabase.rpc('activate_my_account')
    setSession((prev) =>
      prev ? { ...prev, user: { ...prev.user, status: 'active' }, needsPasswordSetup: false } : prev,
    )
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setViewAs(null)
    clearPageStore()
    setSession(null)
  }, [])

  const updateMyProfile = useCallback(
    async ({
      firstName,
      lastName,
      nickname,
      phone,
      email,
    }: {
      firstName: string
      lastName: string
      nickname: string
      phone: string
      email?: string
    }) => {
      const me = session?.user
      if (!me) return { error: 'Not signed in' }
      const displayName = nickname.trim() || `${firstName} ${lastName}`.trim() || me.name
      const emailChanged = !!email && email !== me.email && me.role === 'admin'
      const { error } = await supabase.rpc('update_my_profile', {
        p_first: firstName,
        p_last: lastName,
        p_nickname: nickname,
        p_phone: phone,
      })
      if (error) return { error: error.message }
      if (emailChanged) {
        const { error: profileErr } = await supabase.from('profiles').update({ email }).eq('id', me.id)
        if (profileErr) return { error: profileErr.message }
        const { error: authErr } = await supabase.auth.updateUser({ email })
        if (authErr) console.error('[supabase] auth email update failed:', authErr.message)
      }
      const patch = {
        firstName,
        lastName,
        nickname,
        phone,
        name: displayName,
        ...(emailChanged ? { email } : {}),
      }
      setUsers((prev) => prev.map((u) => (u.id === me.id ? { ...u, ...patch } : u)))
      setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev))
      log(displayName, 'USER_UPDATED', `Own profile updated${emailChanged ? ' (email changed)' : ''}`)
      return { error: null }
    },
    [log, session],
  )

  const setMyAvatar = useCallback(
    async (file: PickedFile | null) => {
      const me = session?.user
      if (!me) return { error: 'Not signed in' }
      let patch: any
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const path = `${me.id}/avatar-${Date.now()}.${ext}`
        const buffer = await readFileAsArrayBuffer(file.uri)
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, buffer, { contentType: file.mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}` })
        if (upErr) return { error: upErr.message }
        const { error } = await supabase.rpc('set_my_avatar', { p_path: path })
        if (error) return { error: error.message }
        if (me.avatarPath) supabase.storage.from('avatars').remove([me.avatarPath])
        patch = {
          avatarPath: path,
          avatarUrl: supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl,
        }
      } else {
        const { error } = await supabase.rpc('set_my_avatar', { p_path: null })
        if (error) return { error: error.message }
        if (me.avatarPath) supabase.storage.from('avatars').remove([me.avatarPath])
        patch = { avatarPath: null, avatarUrl: null }
      }
      setUsers((prev) => prev.map((u) => (u.id === me.id ? { ...u, ...patch } : u)))
      setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev))
      log(me.name, 'USER_UPDATED', file ? 'Profile photo updated' : 'Profile photo removed')
      return { error: null }
    },
    [log, session],
  )

  const getProofUrl = useCallback(async (payment: any) => {
    if (payment.filePath) {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(payment.filePath, 60 * 60)
      if (!error && data?.signedUrl) return data.signedUrl
    }
    return payment.fileUrl ?? null
  }, [])

  // ---- Admin: user management ----
  const inviteUser = useCallback(
    (data: any) => {
      const user = {
        id: uuidv4(),
        ...data,
        role: 'user',
        status: 'invited',
        invitedAt: toISODate(new Date()),
        lastLogin: null,
      }
      supabase
        .from('profiles')
        .insert({
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: 'user',
          status: 'invited',
        })
        .then(({ error }: any) => {
          if (error) {
            console.error('[supabase] invite failed:', error.message)
            setUsers((prev) => prev.filter((u) => u.id !== user.id))
          }
        })
      setUsers((prev) => [...prev, user])
      log(
        actor,
        'INVITE_SENT',
        `Profile created for ${user.email} — send the sign-in invite from Supabase Dashboard (Authentication → Users)`,
      )
      return user
    },
    [log, actor],
  )

  const updateUser = useCallback(
    (id: string, patch: any) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
      supabase
        .from('profiles')
        .update({ name: patch.name, email: patch.email, phone: patch.phone })
        .eq('id', id)
        .then(logDbError('profile update'))
      log(actor, 'USER_UPDATED', `Profile ${id} updated`)
    },
    [log, actor],
  )

  const deleteUser = useCallback(
    (id: string) => {
      const user = users.find((u) => u.id === id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
      supabase.from('profiles').delete().eq('id', id).then(logDbError('profile delete'))
      setLoans((prev) => prev.filter((l) => l.userId !== id))
      setTransactions((prev) => prev.filter((t) => t.userId !== id))
      setPayments((prev) => prev.filter((p) => p.userId !== id))
      log(actor, 'USER_DELETED', `Account removed: ${user?.email ?? id}`)
    },
    [log, actor, users],
  )

  const resendInvite = useCallback(
    (user: any) => log(actor, 'INVITE_SENT', `Invitation re-sent to ${user.email}`),
    [log, actor],
  )

  // ---- Borrower proof submission (RN file upload) ----
  const submitPayment = useCallback(
    async (
      who: string,
      data: {
        userId: string
        loanId: string
        amount: number
        method: string
        reference: string
        fileName: string
        fileType: string
        file: PickedFile
      },
    ) => {
      const ownerId = data.userId
      const ext = data.fileName.includes('.') ? `.${data.fileName.split('.').pop()}` : ''
      const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `proof${ext}`
      const path = `${ownerId}/${Date.now()}-${safeName}`
      let buffer: ArrayBuffer
      try {
        buffer = await readFileAsArrayBuffer(data.file.uri)
      } catch (e: any) {
        console.error('[upload] read failed:', e?.message ?? e)
        return null
      }
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, buffer, { contentType: data.fileType || undefined })
      if (upErr) {
        console.error('[supabase] proof upload failed:', upErr.message)
        reportDbError?.(`proof upload failed (${upErr.message})`)
        return null
      }
      const { data: row, error } = await supabase
        .from('payments')
        .insert({
          user_id: ownerId,
          loan_id: data.loanId,
          amount: data.amount,
          method: data.method,
          reference: data.reference,
          file_name: data.fileName,
          file_type: data.fileType,
          file_path: path,
        })
        .select()
        .single()
      if (error) {
        console.error('[supabase] payment insert failed:', error.message)
        reportDbError?.(`payment save failed (${error.message})`)
        supabase.storage.from('payment-proofs').remove([path])
        return null
      }
      const { data: signed } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(path, 60 * 60)
      const payment = mapPayment(row, signed?.signedUrl ?? null)
      setPayments((prev) => [payment, ...prev])
      log(who, 'PAYMENT_SUBMITTED', `Proof ${data.fileName} uploaded for ${data.loanId}`)
      return payment
    },
    [log],
  )

  // ---- Admin: review / delete a proof of payment ----
  const reviewPayment = useCallback(
    (id: string, status: string, note = '') => {
      const today = toISODate(new Date())
      setPayments((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status, note, reviewedAt: today } : p)),
      )
      supabase
        .from('payments')
        .update({ status, note, reviewed_at: today })
        .eq('id', id)
        .then(logDbError('payment review'))
      const payment = payments.find((p) => p.id === id)
      log(
        actor,
        status === 'approved' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
        `${payment?.reference ?? id} ${status}${note ? ` — ${note}` : ''}`,
      )
    },
    [log, actor, payments],
  )

  const deletePayment = useCallback(
    async (payment: any) => {
      if (payment.filePath) {
        const { error: rmErr } = await supabase.storage
          .from('payment-proofs')
          .remove([payment.filePath])
        if (rmErr) console.error('[supabase] proof file delete failed:', rmErr.message)
      }
      const { error } = await supabase.from('payments').delete().eq('id', payment.id)
      if (error) {
        console.error('[supabase] payment delete failed:', error.message)
        reportDbError?.(`delete proof (${error.message})`)
        return { error: error.message }
      }
      setPayments((prev) => prev.filter((p) => p.id !== payment.id))
      log(actor, 'PAYMENT_DELETED', `Proof ${payment.fileName} (${payment.reference}) deleted`)
      return { error: null }
    },
    [log, actor],
  )

  // ---- Admin: assign / unassign loans ("Assign & push live") ----
  const assignLoan = useCallback(
    async (loan: any) => {
      const borrower = users.find((u) => u.id === loan.userId)
      const { data: loanRow, error } = await supabase
        .from('loans')
        .insert({
          user_id: loan.userId,
          label: loan.label,
          txn_type: loan.txnType ?? 'installment',
          principal: loan.principal,
          monthly_rate: loan.monthlyRate,
          duration_months: loan.durationMonths,
          txn_date: loan.txnDate,
          first_payment_date: loan.firstPaymentDate,
          dst: loan.dst ?? 0,
          processing_fee: loan.processingFee ?? 0,
          notarial_fee: loan.notarialFee ?? 0,
          deduct_from_proceeds: loan.deductFromProceeds,
        })
        .select()
        .single()
      if (error) {
        console.error('[supabase] loan insert failed:', error.message)
        return null
      }
      const newLoan = { ...mapLoan(loanRow), disclosure: loan.disclosure }
      const txns = buildTransactions([{ ...newLoan, paidMonths: 0 }])
      const { data: txnRows, error: txnErr } = await supabase
        .from('transactions')
        .insert(txns.map(toDbTransaction))
        .select()
      if (txnErr) {
        console.error('[supabase] ledger insert failed:', txnErr.message)
        await supabase.from('loans').delete().eq('id', newLoan.id)
        return null
      }
      setLoans((prev) => [...prev, newLoan])
      setTransactions((prev) => [...prev, ...txnRows.map(mapTransaction)])
      log(actor, 'LOAN_ASSIGNED', `${newLoan.id} assigned to ${borrower?.name ?? loan.userId}`)
      return newLoan
    },
    [log, actor, users],
  )

  const unassignLoan = useCallback(
    async (loanId: string) => {
      const { error } = await supabase.from('loans').delete().eq('id', loanId)
      if (error) {
        console.error('[supabase] unassign failed:', error.message)
        return false
      }
      setLoans((prev) => prev.filter((l) => l.id !== loanId))
      setTransactions((prev) => prev.filter((t) => t.loanId !== loanId))
      log(actor, 'LOAN_UNASSIGNED', `${loanId} assignment undone — schedule and ledger records removed`)
      return true
    },
    [log, actor],
  )

  // ---- Admin: Overall Transactions ledger ----
  const setTransactionStatus = useCallback(
    (ids: string[], status: string) => {
      const idSet = new Set(ids)
      const today = toISODate(new Date())
      const resultingDatePaid = (t: any) =>
        status === 'paid' ? (t.datePaid ?? today) : status === 'refunded' ? t.datePaid : null
      const groups = new Map<string, string[]>()
      transactions
        .filter((t) => idSet.has(t.id))
        .forEach((t) => {
          const key = resultingDatePaid(t) ?? ''
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(t.id)
        })
      groups.forEach((groupIds, key) => {
        supabase
          .from('transactions')
          .update({ status, date_paid: key || null })
          .in('id', groupIds)
          .then(logDbError('status update'))
      })
      setTransactions((prev) =>
        prev.map((t) => (idSet.has(t.id) ? { ...t, status, datePaid: resultingDatePaid(t) } : t)),
      )
      log(
        actor,
        'PAYMENT_STATUS_UPDATED',
        `${idSet.size} installment${idSet.size === 1 ? '' : 's'} marked ${status.replace('_', ' ')}`,
      )
    },
    [log, actor, transactions],
  )

  const archiveTransactions = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      const archivedAt = toISODate(new Date())
      supabase
        .from('transactions')
        .update({ archived_at: archivedAt })
        .in('id', [...idSet])
        .then(logDbError('archive'))
      const moving = transactions.filter((t) => idSet.has(t.id)).map((t) => ({ ...t, archivedAt }))
      setArchivedTransactions((prev) => [...moving, ...prev])
      setTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
      log(
        actor,
        'TXN_ARCHIVED',
        `${idSet.size} installment${idSet.size === 1 ? '' : 's'} deleted and moved to Archives`,
      )
    },
    [log, actor, transactions],
  )

  const restoreTransactions = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      supabase
        .from('transactions')
        .update({ archived_at: null })
        .in('id', [...idSet])
        .then(logDbError('restore'))
      const moving = archivedTransactions
        .filter((t) => idSet.has(t.id))
        .map((t) => ({ ...t, archivedAt: null }))
      setTransactions((prev) => [...prev, ...moving])
      setArchivedTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
      log(
        actor,
        'TXN_RESTORED',
        `${idSet.size} installment${idSet.size === 1 ? '' : 's'} restored from Archives`,
      )
    },
    [log, actor, archivedTransactions],
  )

  const purgeArchivedTransactions = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids)
      const { error } = await supabase.from('transactions').delete().in('id', [...idSet])
      if (error) {
        console.error('[supabase] purge archived failed:', error.message)
        return false
      }
      setArchivedTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
      log(
        actor,
        'TXN_PURGED',
        `${idSet.size} archived installment${idSet.size === 1 ? '' : 's'} permanently deleted`,
      )
      return true
    },
    [log, actor],
  )

  const purgeAuditEntries = useCallback(
    async (ids: string[]) => {
      const idSet = new Set(ids)
      const dbIds = [...idSet].filter((id) => /^\d+$/.test(id))
      if (dbIds.length > 0) {
        const { error } = await supabase.from('audit_log').delete().in('id', dbIds)
        if (error) {
          console.error('[supabase] purge audit failed:', error.message)
          return false
        }
      }
      setAuditLog((prev) => prev.filter((e) => !idSet.has(e.id)))
      log(
        actor,
        'AUDIT_PURGED',
        `${idSet.size} audit entr${idSet.size === 1 ? 'y' : 'ies'} permanently deleted`,
      )
      return true
    },
    [log, actor],
  )

  const importTransactions = useCallback(
    async (rows: any[]) => {
      const dbRows = rows.map((r) => ({
        id: r.id,
        loan_id: null,
        user_id: r.userId,
        n: r.n,
        description: r.description,
        amount: r.amount,
        type: r.type,
        txn_date: r.txnDate,
        due_date: r.dueDate,
        status: r.status,
        date_paid: r.datePaid,
      }))
      const { data, error } = await supabase.from('transactions').insert(dbRows).select()
      if (error) {
        console.error('[supabase] import failed:', error.message)
        return { error: error.message }
      }
      setTransactions((prev) => [...prev, ...data.map(mapTransaction)])
      log(actor, 'TXN_IMPORTED', `${rows.length} ledger record${rows.length === 1 ? '' : 's'} imported from CSV`)
      return { error: null }
    },
    [log, actor],
  )

  const importLoans = useCallback(
    async (groups: any[]) => {
      let loanCount = 0
      let txnCount = 0
      for (const g of groups) {
        const { data: loanRow, error } = await supabase
          .from('loans')
          .insert({
            user_id: g.loan.userId,
            label: g.loan.label,
            txn_type: g.loan.txnType,
            principal: g.loan.principal,
            monthly_rate: g.loan.monthlyRate,
            duration_months: g.loan.durationMonths,
            txn_date: g.loan.txnDate,
            first_payment_date: g.loan.firstPaymentDate,
            dst: g.loan.dst,
            processing_fee: g.loan.processingFee,
            notarial_fee: g.loan.notarialFee,
            deduct_from_proceeds: g.loan.deductFromProceeds,
          })
          .select()
          .single()
        if (error) return { error: `${g.loan.label}: ${error.message}` }
        const newLoan = mapLoan(loanRow)
        const dbRows = g.rows.map((r: any) => ({
          id: `${newLoan.id}-${r.n}`,
          loan_id: newLoan.id,
          user_id: g.loan.userId,
          n: r.n,
          description: r.description,
          amount: r.amount,
          type: r.type,
          txn_date: r.txnDate,
          due_date: r.dueDate,
          status: r.status,
          date_paid: r.datePaid,
        }))
        const { data: txnRows, error: txnErr } = await supabase.from('transactions').insert(dbRows).select()
        if (txnErr) {
          await supabase.from('loans').delete().eq('id', newLoan.id)
          return { error: `${g.loan.label}: ${txnErr.message}` }
        }
        setLoans((prev) => [...prev, newLoan])
        setTransactions((prev) => [...prev, ...txnRows.map(mapTransaction)])
        loanCount += 1
        txnCount += txnRows.length
      }
      log(
        actor,
        'TXN_IMPORTED',
        `${loanCount} loan${loanCount === 1 ? '' : 's'} with ${txnCount} installment${txnCount === 1 ? '' : 's'} imported from CSV`,
      )
      return { error: null, loanCount, txnCount }
    },
    [log, actor],
  )

  const updateTransaction = useCallback(
    (id: string, patch: any) => {
      const current = transactions.find((t) => t.id === id)
      if (!current) return
      const next = { ...current, ...patch }
      if ('datePaid' in patch) {
        if (patch.datePaid && (next.status === 'unpaid' || next.status === 'past_due')) next.status = 'paid'
        if (!patch.datePaid && next.status === 'paid') next.status = 'unpaid'
      }
      if ('status' in patch && next.status === 'paid' && !next.datePaid) next.datePaid = toISODate(new Date())
      if (['unpaid', 'cancelled', 'past_due'].includes(next.status)) next.datePaid = null
      supabase
        .from('transactions')
        .update({
          txn_date: next.txnDate,
          due_date: next.dueDate,
          date_paid: next.datePaid,
          status: next.status,
          amount: next.amount,
          description: next.description,
        })
        .eq('id', id)
        .then(logDbError('transaction update'))
      setTransactions((prev) => prev.map((t) => (t.id === id ? next : t)))
      log(actor, 'TXN_UPDATED', `Installment ${id} updated (${Object.keys(patch).join(', ')})`)
    },
    [log, actor, transactions],
  )

  const updateLoan = useCallback(
    (id: string, patch: any) => {
      const current = loans.find((l) => l.id === id)
      if (!current) return
      const merged = { ...current, ...patch }
      merged.disclosure = buildDisclosure(merged)
      supabase
        .from('loans')
        .update({
          label: merged.label,
          principal: merged.principal,
          monthly_rate: merged.monthlyRate,
          duration_months: merged.durationMonths,
          txn_date: merged.txnDate,
          first_payment_date: merged.firstPaymentDate,
          dst: merged.dst,
          processing_fee: merged.processingFee,
          notarial_fee: merged.notarialFee,
          deduct_from_proceeds: merged.deductFromProceeds,
        })
        .eq('id', id)
        .then(logDbError('loan update'))
      setLoans((prev) => prev.map((l) => (l.id === id ? merged : l)))
      log(actor, 'LOAN_UPDATED', `Loan ${id} disclosure updated (${Object.keys(patch).join(', ')})`)
    },
    [log, actor, loans],
  )

  // ---- Admin: payment logs ----
  const createPaymentLog = useCallback(
    async (input: any) => {
      const borrower = users.find((u) => u.id === input.userId)
      const { remaining, status: computedStatus } = allocate(input.amountOwed, input.fundsApplied)
      const status = input.status ?? computedStatus
      const paymentDraft = {
        userId: input.userId,
        kind: 'payment',
        txnDate: input.txnDate,
        reference: input.reference ?? '',
        subject: input.subject ?? '',
        dueDate: input.dueDate ?? null,
        amountOwed: input.amountOwed,
        method: input.method,
        fundsApplied: input.fundsApplied,
        remainingBalance: remaining,
        allocStatus: status,
        carryApplied: 0,
        parentId: null,
        consumed: false,
        consumedBy: null,
        note: input.note ?? '',
      }
      const { data: payRow, error } = await supabase
        .from('payment_logs')
        .insert(toDbPaymentLog(paymentDraft))
        .select()
        .single()
      if (error) {
        console.error('[supabase] payment log insert failed:', error.message)
        reportDbError?.(`payment log save failed (${error.message}) — a migration may be missing`)
        return null
      }
      const payment = mapPaymentLog(payRow)
      setPaymentLogs((prev) => [...prev, payment])
      log(actor, 'PAYMENT_LOG_CREATED', `Payment logged for ${borrower?.name ?? input.userId} (${status})`)
      return payment
    },
    [log, actor, users],
  )

  const deletePaymentLog = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('payment_logs').delete().eq('id', id)
      if (error) {
        console.error('[supabase] payment log delete failed:', error.message)
        reportDbError?.(`delete payment log (${error.message})`)
        return false
      }
      setPaymentLogs((prev) =>
        prev
          .filter((l) => l.id !== id)
          .map((l) =>
            l.parentId === id
              ? { ...l, parentId: null }
              : l.consumedBy === id
                ? { ...l, consumedBy: null }
                : l,
          ),
      )
      log(actor, 'PAYMENT_LOG_DELETED', `Payment log ${id} deleted`)
      return true
    },
    [log, actor],
  )

  const updatePaymentLog = useCallback(
    async (id: string, patch: any) => {
      supabase
        .from('payment_logs')
        .update({
          txn_date: patch.txnDate,
          reference: patch.reference,
          subject: patch.subject,
          due_date: patch.dueDate,
          amount_owed: patch.amountOwed,
          method: patch.method,
          funds_applied: patch.fundsApplied,
          remaining_balance: patch.remainingBalance,
          alloc_status: patch.allocStatus,
        })
        .eq('id', id)
        .then(logDbError('payment log update'))
      setPaymentLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
      log(actor, 'PAYMENT_LOG_UPDATED', `Payment log ${id} updated`)
      return true
    },
    [log, actor],
  )

  // ---- Admin: arbitrage ----
  const createArbitrageLoan = useCallback(
    async (input: any) => {
      const borrower = users.find((u) => u.id === input.userId)
      const { data: row, error } = await supabase
        .from('arbitrage_loans')
        .insert(toDbArbitrageLoan(input))
        .select()
        .single()
      if (error) {
        console.error('[supabase] arbitrage insert failed:', error.message)
        reportDbError?.(`arbitrage save failed (${error.message}) — a migration may be missing`)
        return null
      }
      const record = mapArbitrageLoan(row)
      setArbitrageLoans((prev) => [...prev, record])
      log(actor, 'ARBITRAGE_CREATED', `Arbitrage logged for ${borrower?.name ?? input.userId}`)
      return record
    },
    [log, actor, users],
  )

  const deleteArbitrageLoan = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('arbitrage_loans').delete().eq('id', id)
      if (error) {
        console.error('[supabase] arbitrage delete failed:', error.message)
        reportDbError?.(`delete arbitrage (${error.message})`)
        return false
      }
      setArbitrageLoans((prev) => prev.filter((r) => r.id !== id))
      log(actor, 'ARBITRAGE_DELETED', `Arbitrage record ${id} deleted`)
      return true
    },
    [log, actor],
  )

  const addInterestRate = useCallback(
    async (kind: string, rate: number) => {
      const value = Math.round((Number(rate) + Number.EPSILON) * 10000) / 10000
      if (!Number.isFinite(value) || value < 0) return null
      if (interestRates.some((r) => r.kind === kind && r.rate === value)) return null
      const { data: row, error } = await supabase
        .from('interest_rates')
        .insert({ kind, rate: value })
        .select()
        .single()
      if (error) {
        console.error('[supabase] rate insert failed:', error.message)
        reportDbError?.(`add rate failed (${error.message})`)
        return null
      }
      const mapped = mapInterestRate(row)
      setInterestRates((prev) => [...prev, mapped])
      return mapped
    },
    [interestRates],
  )

  const deleteInterestRate = useCallback(async (id: string) => {
    const { error } = await supabase.from('interest_rates').delete().eq('id', id)
    if (error) {
      console.error('[supabase] rate delete failed:', error.message)
      reportDbError?.(`delete rate (${error.message})`)
      return false
    }
    setInterestRates((prev) => prev.filter((r) => r.id !== id))
    return true
  }, [])

  // ---- Admin: loan tracker ----
  const createTrackedLoan = useCallback(
    async (input: any) => {
      const { data: row, error } = await supabase
        .from('tracked_loans')
        .insert(toDbTrackedLoan(input))
        .select()
        .single()
      if (error) {
        console.error('[supabase] tracked loan insert failed:', error.message)
        reportDbError?.(`loan tracker save failed (${error.message}) — a migration may be missing`)
        return null
      }
      const record = mapTrackedLoan(row)
      setTrackedLoans((prev) => [...prev, record])
      log(actor, 'TRACKED_LOAN_CREATED', `Tracked loan added (${input.bankName})`)
      return record
    },
    [log, actor],
  )

  const deleteTrackedLoan = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('tracked_loans').delete().eq('id', id)
      if (error) {
        console.error('[supabase] tracked loan delete failed:', error.message)
        reportDbError?.(`delete tracked loan (${error.message})`)
        return false
      }
      setTrackedLoans((prev) => prev.filter((r) => r.id !== id))
      log(actor, 'TRACKED_LOAN_DELETED', `Tracked loan ${id} deleted`)
      return true
    },
    [log, actor],
  )

  const value = useMemo(
    () => ({
      session: effectiveSession,
      realSession: session,
      isViewingAs,
      startViewAs,
      stopViewAs,
      authLoading,
      dataLoading,
      refreshing,
      syncError,
      users,
      loans,
      transactions,
      archivedTransactions,
      payments,
      paymentLogs,
      arbitrageLoans,
      interestRates,
      trackedLoans,
      auditLog,
      refreshData,
      signInWithPassword,
      completePasswordSetup,
      signOut,
      updateMyProfile,
      setMyAvatar,
      getProofUrl,
      // admin: users
      inviteUser,
      updateUser,
      deleteUser,
      resendInvite,
      // payments
      submitPayment,
      reviewPayment,
      deletePayment,
      // loans / ledger
      assignLoan,
      unassignLoan,
      setTransactionStatus,
      archiveTransactions,
      restoreTransactions,
      purgeArchivedTransactions,
      purgeAuditEntries,
      importTransactions,
      importLoans,
      updateTransaction,
      updateLoan,
      // payment logs
      createPaymentLog,
      deletePaymentLog,
      updatePaymentLog,
      // arbitrage
      createArbitrageLoan,
      deleteArbitrageLoan,
      addInterestRate,
      deleteInterestRate,
      // loan tracker
      createTrackedLoan,
      deleteTrackedLoan,
    }),
    [
      effectiveSession,
      session,
      isViewingAs,
      startViewAs,
      stopViewAs,
      authLoading,
      dataLoading,
      refreshing,
      syncError,
      users,
      loans,
      transactions,
      archivedTransactions,
      payments,
      paymentLogs,
      arbitrageLoans,
      interestRates,
      trackedLoans,
      auditLog,
      refreshData,
      signInWithPassword,
      completePasswordSetup,
      signOut,
      updateMyProfile,
      setMyAvatar,
      getProofUrl,
      inviteUser,
      updateUser,
      deleteUser,
      resendInvite,
      submitPayment,
      reviewPayment,
      deletePayment,
      assignLoan,
      unassignLoan,
      setTransactionStatus,
      archiveTransactions,
      restoreTransactions,
      purgeArchivedTransactions,
      purgeAuditEntries,
      importTransactions,
      importLoans,
      updateTransaction,
      updateLoan,
      createPaymentLog,
      deletePaymentLog,
      updatePaymentLog,
      createArbitrageLoan,
      deleteArbitrageLoan,
      addInterestRate,
      deleteInterestRate,
      createTrackedLoan,
      deleteTrackedLoan,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
