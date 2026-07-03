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
  mapLoan,
  mapPayment,
  mapPaymentLog,
  mapProfile,
  mapTransaction,
} from '../lib/dbMappers'
import { clearPageStore } from '../lib/pageStateStore'

// Borrower-only port of the web AppContext (loan-amortization-app/src/context/
// AppContext.jsx). Same value shapes so screen logic transplants 1:1; demo
// mode, admin mutations, and admin-only slices are stripped.

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

// Read every row of a table, paging past Supabase's default API row cap
// (~1000). Copied from the web AppContext — borrowers can exceed 1000 rows.
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
  const [users, setUsers] = useState<any[]>([]) // own profile + admins (RLS-scoped)
  const [loans, setLoans] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [paymentLogs, setPaymentLogs] = useState<any[]>([])

  // Progressive load: each slice paints as soon as it arrives instead of
  // waiting for the slowest one. `dataLoading` clears once the core slices
  // (loans + transactions) are in — the dashboard needs nothing else.
  const loadLiveData = useCallback(async () => {
    const failures: string[] = []
    const run = async (label: string, fetch: () => Promise<any>, apply: (rows: any[]) => void) => {
      try {
        const { data, error } = await fetch()
        if (error) failures.push(`${label} (${error.message})`)
        else apply(data ?? [])
      } catch (e: any) {
        failures.push(`${label} (${e?.message ?? 'unknown error'})`)
      }
    }

    try {
      // Secondary .order('id') keeps paging deterministic (web comment).
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
          (rows) => setTransactions(rows.map(mapTransaction).filter((t: any) => !t.archivedAt)),
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
        // Payments render immediately without thumbnails, then hydrate once
        // the signed URLs resolve (they're the slowest round-trip).
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
            // Resolve signed URLs mapped by REQUEST ORDER, not the returned
            // path — Supabase may re-encode keys with special characters.
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
      setDataLoading(false) // dashboard can paint now
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
  // then load the borrower's data. Mirrors the web flow (incl. the setTimeout
  // deferral — awaiting supabase inside the callback can deadlock).
  useEffect(() => {
    let mounted = true

    const loadProfile = async (sbSession: any) => {
      if (!sbSession) {
        if (mounted) {
          setSession(null)
          setAuthLoading(false)
        }
        return
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sbSession.user.id)
        .single()
      if (!mounted) return
      if (profile && !error) {
        const user = mapProfile(profile)
        if (user.role === 'admin') {
          // This app is borrower-facing; admins use the web dashboard.
          await supabase.auth.signOut()
          if (mounted) {
            setSession(null)
            setSyncError('This mobile app is for borrowers. Administrators should use the web app.')
            setAuthLoading(false)
          }
          return
        }
        setSession({
          source: 'supabase',
          user,
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

  // Mobile staleness guard: refetch when the app returns to the foreground
  // after more than a minute in the background (sockets/timers were paused).
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
    return { error: error?.message ?? null } // session arrives via onAuthStateChange
  }, [])

  // AUTH-3: sets the permanent password and activates the profile.
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
    clearPageStore()
    setSession(null)
  }, [])

  // Best-effort audit entry — never blocks or surfaces errors to the borrower.
  const log = useCallback((who: string, action: string, detail: string) => {
    supabase
      .from('audit_log')
      .insert({ actor: who, action, detail })
      .then(({ error }) => {
        if (error) console.warn('[supabase] audit insert failed:', error.message)
      })
  }, [])

  const updateMyProfile = useCallback(
    async ({
      firstName,
      lastName,
      nickname,
      phone,
    }: {
      firstName: string
      lastName: string
      nickname: string
      phone: string
    }) => {
      const me = session?.user
      if (!me) return { error: 'Not signed in' }
      const displayName = nickname.trim() || `${firstName} ${lastName}`.trim() || me.name
      const { error } = await supabase.rpc('update_my_profile', {
        p_first: firstName,
        p_last: lastName,
        p_nickname: nickname,
        p_phone: phone,
      })
      if (error) return { error: error.message }
      const patch = { firstName, lastName, nickname, phone, name: displayName }
      setUsers((prev) => prev.map((u) => (u.id === me.id ? { ...u, ...patch } : u)))
      setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev))
      log(displayName, 'USER_UPDATED', 'Own profile updated')
      return { error: null }
    },
    [log, session],
  )

  // Change (file) or delete (null) the borrower's profile photo.
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

  // Fresh signed URL for a payment proof (stored URLs expire after an hour).
  const getProofUrl = useCallback(async (payment: any) => {
    if (payment.filePath) {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(payment.filePath, 60 * 60)
      if (!error && data?.signedUrl) return data.signedUrl
    }
    return payment.fileUrl ?? null
  }, [])

  // Upload a proof + insert the payments row. RN version of the web flow:
  // same key sanitization, same path format, same rollback on insert failure.
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
        supabase.storage.from('payment-proofs').remove([path]) // roll back orphan
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
        return { error: error.message }
      }
      setPayments((prev) => prev.filter((p) => p.id !== payment.id))
      log(session?.user?.name ?? 'Borrower', 'PAYMENT_DELETED', `Proof ${payment.fileName} (${payment.reference}) deleted`)
      return { error: null }
    },
    [log, session],
  )

  const value = useMemo(
    () => ({
      session,
      authLoading,
      dataLoading,
      refreshing,
      syncError,
      users,
      loans,
      transactions,
      payments,
      paymentLogs,
      refreshData,
      signInWithPassword,
      completePasswordSetup,
      signOut,
      updateMyProfile,
      setMyAvatar,
      getProofUrl,
      submitPayment,
      deletePayment,
    }),
    [
      session,
      authLoading,
      dataLoading,
      refreshing,
      syncError,
      users,
      loans,
      transactions,
      payments,
      paymentLogs,
      refreshData,
      signInWithPassword,
      completePasswordSetup,
      signOut,
      updateMyProfile,
      setMyAvatar,
      getProofUrl,
      submitPayment,
      deletePayment,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
