import { prepareManualTransaction, prepareTransactionEdit, persistTransactionEdit } from '../lib/transactionEditing'
import { companionEnabled } from '../lib/serviceEndpoint'
import { authenticatePassword } from '../lib/loginAccess'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { adminUser, mockAuditLog, mockLoans, mockPayments, mockUsers } from '../data/mock'
import { addMonthsClamped, buildDisclosure, parseISODate, toISODate } from '../lib/amortization'
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
import { allocate } from '../lib/paymentLogs'
import { clearPageStore } from '../lib/pageStateStore'
import { writeStoredOverrides } from '../lib/paymentDueConfig'
import { supabase } from '../supabaseClient'
import { mobileAction } from '../lib/mobileLocalFlow'
import { refreshRecords } from '../lib/recordRefresh'
import { saveBorrowerDetails } from '../lib/borrowerAdministration'
import { subscribeToInvalidations } from '../lib/realtimeInvalidation'

// Map a payment_due_overrides row (one per borrower) to the app's shape.
const mapPaymentDueOverride = (r) => ({
  borrowerId: r.borrower_id,
  dueDates: r.due_dates ?? [],
  nextDueDates: r.next_due_dates ?? [],
  appliedAt: r.applied_at ?? null,
})

// Dual-mode data layer.
//  - Real Supabase sessions ("live") read and write the Phase 2 backend;
//    every mutation also appends to the server-side audit_log.
//  - The prototype's "Demo access" sessions keep the in-memory mock store so
//    both role experiences stay demoable without credentials.
const AppContext = createContext(null)

const nowStamp = () =>
  new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

let seq = 100
const nextId = (prefix) => `${prefix}-${++seq}`

// One transaction per amortization installment, across every loan. This is
// the single source of truth for payment status: the admin's Overall
// Transactions ledger writes to it and the borrower views read from it.
const buildTransactions = (loanList) =>
  loanList.flatMap((loan) => {
    // Transaction date: captured from the calculator when assigned; seeded
    // loans fall back to the origination date, one month before first payment.
    const txnDate =
      loan.txnDate ?? toISODate(addMonthsClamped(parseISODate(loan.firstPaymentDate), -1))
    const typeLabel = loan.txnType === 'straight' ? 'Straight' : 'Installment'
    return loan.disclosure.schedule.rows.map((row) => {
      const paid = row.n <= (loan.paidMonths ?? 0)
      return {
        id: `${loan.id}-${row.n}`,
        loanId: loan.id,
        userId: loan.userId,
        n: row.n,
        description:
          typeLabel === 'Straight'
            ? loan.label
            : `${loan.label} (${row.n} of ${loan.durationMonths})`,
        amount: row.total,
        type: typeLabel,
        txnDate,
        dueDate: row.date,
        // paid | unpaid | refunded | cancelled | past_due
        status: paid ? 'paid' : 'unpaid',
        datePaid: paid ? row.date : null,
      }
    })
  })

// Error sink registered by AppProvider so fire-and-forget writes can surface
// failures (otherwise a rejected write is silent and the optimistic UI drifts
// from the database until the next refresh "loses" the change).
let reportDbError = null
const logDbError = (op) => ({ error }) => {
  if (error) {
    console.error(`[supabase] ${op} failed:`, error.message)
    reportDbError?.(`${op} failed: ${error.message}`)
  }
}

// Read every row of a table, paging past Supabase's default API row cap
// (~1000). Without this, rows that sort to the end silently disappear on
// refresh. `build` returns a fresh select query each call so range applies.
const PAGE = 1000
async function fetchAllRows(build) {
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) return { data: all, error }
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) return { data: all, error: null }
  }
}

export function AppProvider({ children }) {
  // session: { source: 'supabase' | 'demo', user, needsPasswordSetup }
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const [dataReady, setDataReady] = useState(false)
  const loadGeneration = useRef(0)
  const refreshFlight = useRef(null)
  const authenticatedOwner = useRef(null)
  const freshSignIn = useRef(false)
  // Admin "view as borrower": the real session stays admin; pages see the
  // borrower through the effective session below.
  const [viewAs, setViewAs] = useState(null)
  const [users, setUsers] = useState([])
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState([])
  const [transactions, setTransactions] = useState([])
  const [archivedTransactions, setArchivedTransactions] = useState([])
  const [paymentLogs, setPaymentLogs] = useState([])
  const [paymentPostings, setPaymentPostings] = useState([])
  const [arbitrageLoans, setArbitrageLoans] = useState([])
  const [interestRates, setInterestRates] = useState([])
  const [trackedLoans, setTrackedLoans] = useState([])
  const [auditLog, setAuditLog] = useState([])
  // Per-borrower admin overrides for the "Next Payment Due" tile. Loaded from
  // Supabase in live mode; the localStorage seed keeps the demo/dev flow alive.
  const [paymentDueOverrides, setPaymentDueOverrides] = useState([])
  const overrideGeneration=useRef(0)

  const isLive = session?.source === 'supabase'
  const actor = session?.user?.name ?? adminUser.name

  // Let fire-and-forget writes surface failures through the visible sync error.
  useEffect(() => {
    reportDbError = (msg) => setSyncError(msg)
    return () => {
      reportDbError = null
    }
  }, [])

  // Append an audit entry. Live sessions persist it server-side and mirror
  // the stored row locally (so its DB id is known for permanent deletes).
  const log = useCallback(
    (who, action, detail) => {
      if (isLive) {
        supabase
          .from('audit_log')
          .insert({ actor: who, action, detail })
          .select()
          .single()
          .then(({ data, error }) => {
            // Audit logging is best-effort: a failure here must never block the
            // user's action (their payment/etc. already saved) nor surface as a
            // scary sync banner — just record it to the console.
            if (error) console.error('[supabase] audit insert failed:', error.message)
            else setAuditLog((prev) => [mapAudit(data), ...prev])
          })
        return
      }
      setAuditLog((prev) => [
        { id: nextId('log'), at: nowStamp(), actor: who, action, detail },
        ...prev,
      ])
    },
    [isLive],
  )

  const resetToMocks = () => {
    setUsers(mockUsers)
    setLoans(mockLoans)
    setPayments(mockPayments)
    setTransactions(buildTransactions(mockLoans))
    setArchivedTransactions([])
    setPaymentLogs([])
    setPaymentPostings([])
    setArbitrageLoans([])
    setInterestRates([])
    setTrackedLoans([])
    setAuditLog(mockAuditLog)
  }

  // Pull everything visible to the signed-in user. RLS does the scoping:
  // admins receive all rows, borrowers only their own (and never archived).
  // Each slice updates independently and ONLY on success, so one failing
  // query never wipes the other records; storage URL resolution is guarded
  // so a missing proof file can't break the whole refresh.
  const loadLiveData = useCallback(async ({ initialProfile = null } = {}) => {
    const generation = ++loadGeneration.current
    const failures = []
    const borrowerInitial = initialProfile?.role === 'user' && initialProfile.id === authenticatedOwner.current
    const empty = { data: [], error: null }
    try {
      const [
        profilesRes,
        loansRes,
        txnsRes,
        paymentsRes,
        paymentLogsRes,
        arbitrageRes,
        ratesRes,
        trackedRes,
        auditRes,
        overridesRes,
        postingsRes,
      ] = await Promise.all([
          // Secondary .order('id') makes paging deterministic (a non-unique
          // primary sort key could otherwise shift rows across page boundaries).
          borrowerInitial ? { data: [initialProfile], error: null } : fetchAllRows(() => supabase.from('profiles').select('*').order('created_at').order('id')),
          fetchAllRows(() => supabase.from('loans').select('*').order('created_at').order('id')),
          fetchAllRows(() => supabase.from('transactions').select('*').order('due_date').order('id')),
          fetchAllRows(() =>
            supabase
              .from('payments')
              .select('*')
              .order('submitted_at', { ascending: false })
              .order('id'),
          ),
          fetchAllRows(() =>
            supabase.from('payment_logs').select('*').order('created_at').order('id'),
          ),
          borrowerInitial ? empty : fetchAllRows(() =>
            supabase.from('arbitrage_loans').select('*').order('created_at').order('id'),
          ),
          borrowerInitial ? empty : fetchAllRows(() => supabase.from('interest_rates').select('*').order('kind').order('rate')),
          borrowerInitial ? empty : fetchAllRows(() =>
            supabase.from('tracked_loans').select('*').order('created_at').order('id'),
          ),
          borrowerInitial ? empty : supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(500),
        supabase.from('payment_due_overrides').select('*'),
        fetchAllRows(() => supabase.from('payment_postings').select('*, allocation_rows:payment_allocations(transaction_id,user_id,amount,before_balance)').order('created_at').order('id')),
        ])

      if (generation !== loadGeneration.current) return
      if (profilesRes.error) failures.push(`profiles (${profilesRes.error.message})`)
      else setUsers((profilesRes.data ?? []).map(mapProfile))

      if (loansRes.error) failures.push(`loans (${loansRes.error.message})`)
      else setLoans((loansRes.data ?? []).map(mapLoan))

      if (txnsRes.error) failures.push(`transactions (${txnsRes.error.message})`)
      else {
        const allTxns = (txnsRes.data ?? []).map(mapTransaction)
        setTransactions(allTxns.filter((t) => !t.archivedAt))
        setArchivedTransactions(allTxns.filter((t) => t.archivedAt))
      }

      if (paymentLogsRes.error) failures.push(`payment logs (${paymentLogsRes.error.message})`)
      else setPaymentLogs((paymentLogsRes.data ?? []).map(mapPaymentLog))
      if(postingsRes.error)failures.push(`payment postings (${postingsRes.error.message})`)
      else setPaymentPostings(postingsRes.data ?? [])

      // Arbitrage + interest rates are admin-only; RLS returns an empty set for
      // borrowers (not an error), so these stay empty for them.
      if (arbitrageRes.error) failures.push(`arbitrage (${arbitrageRes.error.message})`)
      else setArbitrageLoans((arbitrageRes.data ?? []).map(mapArbitrageLoan))

      if (ratesRes.error) failures.push(`interest rates (${ratesRes.error.message})`)
      else setInterestRates((ratesRes.data ?? []).map(mapInterestRate))

      if (trackedRes.error) failures.push(`loan tracker (${trackedRes.error.message})`)
      else setTrackedLoans((trackedRes.data ?? []).map(mapTrackedLoan))

      if (auditRes.error) failures.push(`audit log (${auditRes.error.message})`)
      else setAuditLog((auditRes.data ?? []).map(mapAudit))

      // Non-fatal: if the table is missing (migration not yet applied) tiles
      // simply fall back to the default calculation instead of breaking sync.
      if (overridesRes.error)
        failures.push(`payment due overrides (${overridesRes.error.message})`)
      else setPaymentDueOverrides((overridesRes.data ?? []).map(mapPaymentDueOverride))

      if (paymentsRes.error) {
        failures.push(`payments (${paymentsRes.error.message})`)
      } else {
        const paymentRows = paymentsRes.data ?? []
        // Resolve signed URLs for rows that have a stored path. Map results by
        // REQUEST ORDER (not the returned `path`, which Supabase may re-encode
        // for keys with special characters — that mismatch dropped thumbnails).
        // Mobile borrowers request an individual proof through getProofUrl.
        // Signing every old receipt must not hold up the first Dashboard.
        const paths = borrowerInitial ? [] : [...new Set(paymentRows.map((p) => p.file_path).filter(Boolean))]
        const urlByPath = {}
        if (paths.length > 0) {
          try {
            const { data: signed } = await supabase.storage
              .from('payment-proofs')
              .createSignedUrls(paths, 60 * 60)
            ;(signed ?? []).forEach((s, i) => {
              if (s?.signedUrl) urlByPath[paths[i]] = s.signedUrl
            })
          } catch (e) {
            console.error('[supabase] signed URLs failed:', e?.message ?? e)
          }
        }
        if (generation !== loadGeneration.current) return
        setPayments(paymentRows.map((p) => mapPayment(p, urlByPath[p.file_path] ?? null)))
      }

      if (failures.length > 0) {
        const msg = `Some records could not be refreshed: ${failures.join(', ')}.`
        console.error('[supabase]', msg)
        setSyncError(msg)
      } else {
        setSyncError(null)
        setDataReady(true)
      }
    } catch (e) {
      const msg = e?.message ?? 'Unexpected error while syncing with the database.'
      console.error('[supabase] loadLiveData crashed:', msg)
      setSyncError(msg)
    }
  }, [])

  // Manual re-sync from Supabase (Refresh button). Also resets retained
  // page state (filters, sorts, calculator inputs) back to defaults.
  const refreshData = useCallback(async ({preservePageState=false}={}) => {
    if (!isLive) return
    if (refreshFlight.current) return refreshFlight.current
    if(!preservePageState)clearPageStore()
    setRefreshing(true)
    const flight = refreshRecords(loadLiveData).finally(() => {
      if (refreshFlight.current === flight) {
        refreshFlight.current = null
        setRefreshing(false)
      }
    })
    refreshFlight.current = flight
    return flight
  }, [isLive, loadLiveData])

  // A real preference/profile change needs only the signed-in profile row.
  // Preserve the current screen, drafts and loaded financial records.
  const refreshOwnProfile = useCallback(async () => {
    const owner = authenticatedOwner.current
    if (!owner) return
    const { data, error } = await supabase.from('profiles').select('*').eq('id', owner).single()
    if (error) throw Error('Your latest profile details could not be loaded.')
    if (authenticatedOwner.current !== owner) return
    const user = mapProfile(data)
    setUsers(previous => previous.map(item => item.id === owner ? user : item))
    setSession(previous => previous?.source === 'supabase' && previous.user.id === owner ? { ...previous, user } : previous)
  }, [])

  // --- Supabase auth: restore the session on load, react to changes, resolve
  // the signed-in profile (role drives routing), then load the live data.
  useEffect(() => {
    let mounted = true
    let profileGeneration = 0
    let resolvedOwner
    let pendingOwner

    const loadProfile = async (sbSession, profileRequest) => {
      if (!mounted || profileRequest !== profileGeneration) return
      if (!sbSession) {
        freshSignIn.current = false
        resolvedOwner = null
        pendingOwner = undefined
        if (mounted) {
          ++loadGeneration.current
          authenticatedOwner.current = null
          setDataReady(false)
          setSyncError(null)
          setUsers([]); setLoans([]); setPayments([]); setTransactions([])
          setArchivedTransactions([]); setPaymentLogs([]); setPaymentDueOverrides([])
          setSession((prev) => (prev?.source === 'demo' ? prev : null))
          setAuthLoading(false)
        }
        return
      }
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sbSession.user.id)
          .single()
        if (!mounted || profileRequest !== profileGeneration) return
        pendingOwner = undefined
        if (profile && !error && ['admin', 'user'].includes(profile.role)) {
          resolvedOwner = profile.id
          if (authenticatedOwner.current !== profile.id) {
            ++loadGeneration.current
            authenticatedOwner.current = profile.id
            setDataReady(false)
            setUsers([]); setLoans([]); setPayments([]); setTransactions([])
            setArchivedTransactions([]); setPaymentLogs([]); setPaymentDueOverrides([])
          }
          setSession({
            source: 'supabase',
            user: mapProfile(profile),
            needsPasswordSetup: profile.status === 'invited',
          })
          if (freshSignIn.current && profile.status !== 'disabled') {
            freshSignIn.current = false
            window.dispatchEvent(new CustomEvent('loanledger-authenticated'))
          }
          loadLiveData({ initialProfile: profile })
        } else {
          freshSignIn.current = false
          setSyncError('Unable to load your account profile. Please try signing in again.')
        }
      } catch {
        if (mounted && profileRequest === profileGeneration) {
          pendingOwner = undefined
          freshSignIn.current = false
          setSyncError('Unable to open your account. Please try signing in again.')
        }
      } finally {
        if (mounted && profileRequest === profileGeneration) setAuthLoading(false)
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, sbSession) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
        const owner = sbSession?.user.id ?? null
        // Reconfirmation of the same session is not a fresh login. The SDK
        // supplies INITIAL_SESSION, so a second getSession restore can race it.
        if (event !== 'USER_UPDATED' && (owner === pendingOwner || (pendingOwner === undefined && owner === resolvedOwner))) return
        pendingOwner = owner
        const profileRequest = ++profileGeneration
        // defer: awaiting supabase calls directly inside this callback can deadlock
        setTimeout(() => loadProfile(sbSession, profileRequest), 0)
      }
    })
    return () => {
      mounted = false
      ++profileGeneration
      sub.subscription.unsubscribe()
    }
  }, [loadLiveData])

  const signInWithPassword = useCallback(async (email, password) => {
    freshSignIn.current = true
    setSyncError(null)
    setAuthLoading(true)
    try {
      const { data, error, login } = companionEnabled
        ? await authenticatePassword(String(email).trim().toLowerCase(), password)
        : await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password })
      if (error) {
        freshSignIn.current = false
        setAuthLoading(false)
      } else if (freshSignIn.current) {
        // Credential validation has succeeded. Start the presentation hold
        // while the profile and Dashboard data prepare in parallel.
        freshSignIn.current = false
        window.dispatchEvent(new CustomEvent('loanledger-authenticated'))
        if(authenticatedOwner.current&&authenticatedOwner.current===data?.user?.id){
          // A retry for an already resolved owner may be deduplicated by the
          // auth listener. Resume data loading without waiting for a new event.
          setAuthLoading(false)
          loadLiveData()
        }
      }
      return { error: error?.message ?? null, login } // session arrives via onAuthStateChange
    } catch (error) {
      freshSignIn.current = false
      setAuthLoading(false)
      return { error: error?.message || 'Unable to sign in. Please try again.' }
    }
  }, [loadLiveData])

  const signInWithLoginCode = useCallback(async (tokenHash) => {
    // The companion has already accepted the credential for an active borrower.
    // Show the four-second presentation while Auth establishes the session.
    freshSignIn.current = false
    setSyncError(null)
    setAuthLoading(true)
    window.dispatchEvent(new CustomEvent('loanledger-authenticated'))
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      if (error) { freshSignIn.current = false; setAuthLoading(false) }
      return { error: error?.message ?? null }
    } catch (error) {
      freshSignIn.current = false
      setAuthLoading(false)
      return { error: error.message || 'Unable to sign in. Please retry.' }
    }
  }, [])

  // Prototype-only: enter as one of the mock users without real credentials.
  const signInDemo = useCallback((user) => {
    resetToMocks()
    setViewAs(null)
    clearPageStore()
    setSession({
      source: 'demo',
      user,
      needsPasswordSetup: user.role === 'user' && user.status === 'invited',
    })
  }, [])

  // Admin-only "remote screen share": see exactly what a borrower sees while
  // staying signed in as admin (same shared store, borrower-scoped pages).
  const startViewAs = useCallback((user) => setViewAs(user), [])
  const stopViewAs = useCallback(() => setViewAs(null), [])

  const isViewingAs = !!viewAs && session?.user?.role === 'admin'
  const effectiveSession = useMemo(
    () =>
      isViewingAs
        ? { ...session, user: { ...viewAs, role: 'user' }, needsPasswordSetup: false }
        : session,
    [isViewingAs, session, viewAs],
  )

  // AUTH-3: sets the permanent password (real accounts) and activates the profile.
  const completePasswordSetup = useCallback(
    async (password) => {
      if (isLive) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return { error: error.message }
        await supabase.rpc('activate_my_account')
        setSession((prev) =>
          prev
            ? { ...prev, user: { ...prev.user, status: 'active' }, needsPasswordSetup: false }
            : prev,
        )
        return { error: null }
      }
      // demo path: flip the mock user to active
      setSession((prev) => {
        if (!prev) return prev
        setUsers((us) => us.map((u) => (u.id === prev.user.id ? { ...u, status: 'active' } : u)))
        return { ...prev, user: { ...prev.user, status: 'active' }, needsPasswordSetup: false }
      })
      return { error: null }
    },
    [isLive],
  )

  const signOut = useCallback(async () => {
    // End this browser session without invalidating the borrower's other devices.
    if (isLive) await supabase.auth.signOut({ scope: 'local' })
    resetToMocks()
    setViewAs(null)
    clearPageStore()
    setSession(null)
  }, [isLive])

  // Self-service profile update (both roles). Email changes are admin-only:
  // the profile email updates via the admin RLS policy and the login email
  // via supabase.auth (which sends confirmation links).
  const updateMyProfile = useCallback(
    async ({ firstName, lastName, nickname, phone, email }) => {
      const me = session?.user
      if (!me) return { error: 'Not signed in' }
      const displayName = nickname.trim() || `${firstName} ${lastName}`.trim() || me.name
      const emailChanged = email && email !== me.email && me.role === 'admin'

      if (isLive) {
        const { error } = await supabase.rpc('update_my_profile', {
          p_first: firstName,
          p_last: lastName,
          p_nickname: nickname,
          p_phone: phone,
        })
        if (error) return { error: error.message }
        if (emailChanged) {
          const { error: profileErr } = await supabase
            .from('profiles')
            .update({ email })
            .eq('id', me.id)
          if (profileErr) return { error: profileErr.message }
          const { error: authErr } = await supabase.auth.updateUser({ email })
          if (authErr) console.error('[supabase] auth email update failed:', authErr.message)
        }
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
    [isLive, log, session],
  )

  // Change (file) or delete (null) the signed-in user's profile photo.
  const setMyAvatar = useCallback(
    async (file) => {
      const me = session?.user
      if (!me) return { error: 'Not signed in' }
      let patch
      if (isLive) {
        if (file) {
          const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
          const path = `${me.id}/avatar-${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from('avatars').upload(path, file)
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
      } else {
        patch = file
          ? { avatarPath: 'demo', avatarUrl: URL.createObjectURL(file) }
          : { avatarPath: null, avatarUrl: null }
      }
      setUsers((prev) => prev.map((u) => (u.id === me.id ? { ...u, ...patch } : u)))
      setSession((prev) => (prev ? { ...prev, user: { ...prev.user, ...patch } } : prev))
      log(me.name, 'USER_UPDATED', file ? 'Profile photo updated' : 'Profile photo removed')
      return { error: null }
    },
    [isLive, log, session],
  )

  // Fresh signed URL for a payment proof (stored URLs expire after an hour).
  const getProofUrl = useCallback(
    async (payment) => {
      if (isLive && payment.filePath) {
        const { data, error } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(payment.filePath, 60 * 60)
        if (!error && data?.signedUrl) return data.signedUrl
      }
      return payment.fileUrl ?? null
    },
    [isLive],
  )

  // Live invites create the profile record; the actual sign-in invitation
  // (email with secure link) is sent from the Supabase Dashboard or a Phase 2
  // Edge Function, since it requires the service-role key.
  const inviteUser = useCallback(
    (data) => {
      if (isLive) {
        const user = {
          id: crypto.randomUUID(),
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
          .then(({ error }) => {
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
      }
      const user = {
        ...data,
        id: nextId('u'),
        role: 'user',
        status: 'invited',
        invitedAt: new Date().toISOString().slice(0, 10),
        lastLogin: null,
      }
      setUsers((prev) => [...prev, user])
      log(actor, 'INVITE_SENT', `Invitation emailed to ${user.email}`)
      return user
    },
    [isLive, log, actor],
  )

  const updateUser = useCallback(
    async (id, patch) => {
      const saved = isLive ? await saveBorrowerDetails(id, patch) : patch
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...saved } : u)))
      log(actor, 'USER_UPDATED', `Profile ${id} updated`)
      return saved
    },
    [isLive, log, actor],
  )

  const deleteUser = useCallback(
    (id) => {
      const user = users.find((u) => u.id === id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
      if (isLive) {
        // Cascades to loans/transactions/payments. The auth account (if any)
        // must still be removed from the Supabase Dashboard.
        supabase.from('profiles').delete().eq('id', id).then(logDbError('profile delete'))
        setLoans((prev) => prev.filter((l) => l.userId !== id))
        setTransactions((prev) => prev.filter((t) => t.userId !== id))
        setPayments((prev) => prev.filter((p) => p.userId !== id))
      }
      log(actor, 'USER_DELETED', `Account removed: ${user?.email ?? id}`)
    },
    [isLive, log, actor, users],
  )

  const resendInvite = useCallback(
    (user) => log(actor, 'INVITE_SENT', `Invitation re-sent to ${user.email}`),
    [log, actor],
  )

  // Borrower proof submission. Live: upload to the private bucket, then
  // insert the payment row (RLS allows own+pending only).
  const submitPayment = useCallback(
    async (who, data) => {
      if (isLive) {
        // Attribute to the borrower the page is acting for (data.userId) — NOT
        // the raw session. When an admin submits while "viewing as" a borrower,
        // the proof must belong to that borrower, not the admin.
        const ownerId = data.userId
        // Sanitize the storage KEY (Supabase rejects spaces / parentheses /
        // unicode in object keys, which silently failed uploads before). The
        // original file name is kept in the DB for display.
        const ext = data.fileName.includes('.') ? `.${data.fileName.split('.').pop()}` : ''
        const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || `proof${ext}`
        const path = `${ownerId}/${Date.now()}-${safeName}`
        const { error: upErr } = await supabase.storage
          .from('payment-proofs')
          .upload(path, data.file, { contentType: data.file?.type || undefined })
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
          // Roll back the orphaned upload so storage doesn't accumulate junk.
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
      }
      const payment = {
        ...data,
        id: nextId('pay'),
        submittedAt: new Date().toISOString().slice(0, 10),
        status: 'pending',
        reviewedAt: null,
        note: '',
      }
      setPayments((prev) => [payment, ...prev])
      log(who, 'PAYMENT_SUBMITTED', `Proof ${data.fileName} uploaded for ${data.loanId}`)
      return payment
    },
    [isLive, log],
  )

  const reviewPayment = useCallback(
    async (id, status, note = '', allocation = {}) => {
      if (isLive) {
        try { const row=await mobileAction('payment-review',{...allocation,key:allocation.key||crypto.randomUUID(),id,status,note});setPayments(prev=>prev.map(p=>p.id===id?mapPayment(row):p));if(status==='approved')await loadLiveData();return {error:null}; }
        catch(e) {return {error:e.message};}
      }
      const today = toISODate(new Date())
      setPayments((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status, note, reviewedAt: today } : p)),
      )
      if (isLive) {
        supabase
          .from('payments')
          .update({ status, note, reviewed_at: today })
          .eq('id', id)
          .then(logDbError('payment review'))
      }
      const payment = payments.find((p) => p.id === id)
      log(
        actor,
        status === 'approved' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
        `${payment?.reference ?? id} ${status}${note ? ` — ${note}` : ''}`,
      )
    },
    [isLive, log, actor, payments,loadLiveData],
  )

  const postCredit = useCallback(async payload => {
    if(!isLive)return {error:'Reviewed credit posting requires a connected lender account.'}
    try{await mobileAction('credit-apply',payload);await loadLiveData();return {error:null}}catch(e){return {error:e.message}}
  },[isLive,loadLiveData])
  const reversePayment = useCallback(async payload => {
    if(!isLive)return {error:'Reviewed reversals require a connected lender account.'}
    try{await mobileAction('payment-reverse',payload);await loadLiveData();return {error:null}}catch(e){return {error:e.message}}
  },[isLive,loadLiveData])

  // Permanently delete a proof of payment: removes the storage object and the
  // payment row. RLS lets borrowers delete their own and admins delete any.
  const deletePayment = useCallback(
    async (payment) => {
      if(payment.postedAt)return {error:'Posted proofs are retained for audit. Use a reviewed reversal.'}
      if (isLive) {
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
      }
      setPayments((prev) => prev.filter((p) => p.id !== payment.id))
      log(actor, 'PAYMENT_DELETED', `Proof ${payment.fileName} (${payment.reference}) deleted`)
      return { error: null }
    },
    [isLive, log, actor],
  )

  // "Assign & push live": creates the loan and one ledger record per
  // schedule row. Live mode persists both (loan id comes from the DB).
  const assignLoan = useCallback(
    async (loan) => {
      const borrower = users.find((u) => u.id === loan.userId)
      if (isLive) {
        const { data: loanRow, error } = await supabase
          .from('loans')
          .insert({
            user_id: loan.userId,
            label: loan.label,
            txn_type: loan.txnType ?? 'installment',
            loan_category: loan.txnType === 'straight' ? null : loan.loanCategory,
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
        // Persist the EXACT schedule the calculator displayed — never
        // recalculate on assignment. (A recompute from the stored row could
        // drift if inputs exceeded column precision.)
        const newLoan = { ...mapLoan(loanRow), disclosure: loan.disclosure }
        const txns = buildTransactions([{ ...newLoan, paidMonths: 0 }])
        const { data: txnRows, error: txnErr } = await supabase
          .from('transactions')
          .insert(txns.map(toDbTransaction))
          .select()
        if (txnErr) {
          console.error('[supabase] ledger insert failed:', txnErr.message)
          await supabase.from('loans').delete().eq('id', newLoan.id) // roll back
          return null
        }
        setLoans((prev) => [...prev, newLoan])
        setTransactions((prev) => [...prev, ...txnRows.map(mapTransaction)])
        log(actor, 'LOAN_ASSIGNED', `${newLoan.id} assigned to ${borrower?.name ?? loan.userId}`)
        return newLoan
      }
      const withId = { ...loan, id: nextId('ln'), status: 'active', paidMonths: 0 }
      setLoans((prev) => [...prev, withId])
      setTransactions((prev) => [...prev, ...buildTransactions([withId])])
      log(actor, 'LOAN_ASSIGNED', `${withId.id} assigned to ${borrower?.name ?? loan.userId}`)
      return withId
    },
    [isLive, log, actor, users],
  )

  // Undo for "Assign & push live": removes the loan and every ledger record
  // that was generated for it (DB cascade handles the live side).
  const unassignLoan = useCallback(
    async (loanId) => {
      if (isLive) {
        const { error } = await supabase.from('loans').delete().eq('id', loanId)
        if (error) {
          console.error('[supabase] unassign failed:', error.message)
          return false
        }
      }
      setLoans((prev) => prev.filter((l) => l.id !== loanId))
      setTransactions((prev) => prev.filter((t) => t.loanId !== loanId))
      log(actor, 'LOAN_UNASSIGNED', `${loanId} assignment undone — schedule and ledger records removed`)
      return true
    },
    [isLive, log, actor],
  )

  // Single or bulk status update from the Overall Transactions ledger.
  // Date Paid rules: paid stamps today (unless a date is already set);
  // refunded keeps the original payment date; everything else clears it.
  const setTransactionStatus = useCallback(
    (ids, status) => {
      const idSet = new Set(ids)
      if(transactions.some(t=>idSet.has(t.id)&&t.feeAssessmentId)){reportDbError?.('Use payment review to settle assessed fees, or Loan fees & billing to void them.');return false}
      if(transactions.some(t=>idSet.has(t.id)&&t.paidAmount>0)){reportDbError?.('Use a reviewed reversal to change the status of an allocated due.');return false}
      const today = toISODate(new Date())
      const resultingDatePaid = (t) =>
        status === 'paid' ? (t.datePaid ?? today) : status === 'refunded' ? t.datePaid : null

      if (isLive) {
        // The DB constraint pairs date_paid with status, and "paid" must keep
        // an existing date — group ids by their resulting date_paid value.
        const groups = new Map()
        transactions
          .filter((t) => idSet.has(t.id))
          .forEach((t) => {
            const key = resultingDatePaid(t) ?? ''
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(t.id)
          })
        groups.forEach((groupIds, key) => {
          supabase
            .from('transactions')
            .update({ status, date_paid: key || null })
            .in('id', groupIds)
            .then(logDbError('status update'))
        })
      }

      setTransactions((prev) =>
        prev.map((t) =>
          idSet.has(t.id) ? { ...t, status, datePaid: resultingDatePaid(t) } : t,
        ),
      )
      log(
        actor,
        'PAYMENT_STATUS_UPDATED',
        `${idSet.size} installment${idSet.size === 1 ? '' : 's'} marked ${status.replace('_', ' ')}`,
      )
    },
    [isLive, log, actor, transactions],
  )

  // Soft delete: selected ledger rows move to the Archives (Reports & Logs).
  const archiveTransactions = useCallback(
    (ids) => {
      const idSet = new Set(ids)
      if(transactions.some(t=>idSet.has(t.id)&&t.feeAssessmentId)){reportDbError?.('Assessed fees remain in the ledger. Void an unpaid assessment in Loan fees & billing.');return false}
      if(transactions.some(t=>idSet.has(t.id)&&t.paidAmount>0&&['unpaid','past_due'].includes(t.status))){reportDbError?.('An allocated due with an unpaid remainder cannot be archived.');return false}
      const archivedAt = toISODate(new Date())
      if (isLive) {
        supabase
          .from('transactions')
          .update({ archived_at: archivedAt })
          .in('id', [...idSet])
          .then(logDbError('archive'))
      }
      const moving = transactions.filter((t) => idSet.has(t.id)).map((t) => ({ ...t, archivedAt }))
      setArchivedTransactions((prev) => [...moving, ...prev])
      setTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
      log(
        actor,
        'TXN_ARCHIVED',
        `${idSet.size} installment${idSet.size === 1 ? '' : 's'} deleted and moved to Archives`,
      )
    },
    [isLive, log, actor, transactions],
  )

  const restoreTransactions = useCallback(
    (ids) => {
      const idSet = new Set(ids)
      if (isLive) {
        supabase
          .from('transactions')
          .update({ archived_at: null })
          .in('id', [...idSet])
          .then(logDbError('restore'))
      }
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
    [isLive, log, actor, archivedTransactions],
  )

  // Permanent delete of archived ledger records (Reports & Logs → Archives).
  const purgeArchivedTransactions = useCallback(
    async (ids) => {
      const idSet = new Set(ids)
      if (isLive) {
        const { error } = await supabase.from('transactions').delete().in('id', [...idSet])
        if (error) {
          console.error('[supabase] purge archived failed:', error.message)
          return false
        }
      }
      setArchivedTransactions((prev) => prev.filter((t) => !idSet.has(t.id)))
      log(
        actor,
        'TXN_PURGED',
        `${idSet.size} archived installment${idSet.size === 1 ? '' : 's'} permanently deleted`,
      )
      return true
    },
    [isLive, log, actor],
  )

  // Permanent delete of audit entries (admin housekeeping).
  const purgeAuditEntries = useCallback(
    async (ids) => {
      const idSet = new Set(ids)
      if (isLive) {
        // Only DB-backed entries (numeric ids) exist server-side.
        const dbIds = [...idSet].filter((id) => /^\d+$/.test(id))
        if (dbIds.length > 0) {
          const { error } = await supabase.from('audit_log').delete().in('id', dbIds)
          if (error) {
            console.error('[supabase] purge audit failed:', error.message)
            return false
          }
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
    [isLive, log, actor],
  )

  // CSV import into the ledger (Overall Transactions). Imported records are
  // standalone — they carry no parent loan.
  const importTransactions = useCallback(
    async (rows) => {
      if (isLive) {
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
      } else {
        setTransactions((prev) => [...prev, ...rows])
      }
      log(actor, 'TXN_IMPORTED', `${rows.length} ledger record${rows.length === 1 ? '' : 's'} imported from CSV`)
      return { error: null }
    },
    [isLive, log, actor],
  )

  // CSV import with loan-level columns: creates a real loan per group plus
  // its installment records, so imported loans appear in My Loan Schedules
  // with a full disclosure statement. Installment amounts come from the CSV
  // verbatim — never recalculated.
  const importLoans = useCallback(
    async (groups) => {
      let loanCount = 0
      let txnCount = 0
      if (isLive) {
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
          const dbRows = g.rows.map((r) => ({
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
          const { data: txnRows, error: txnErr } = await supabase
            .from('transactions')
            .insert(dbRows)
            .select()
          if (txnErr) {
            await supabase.from('loans').delete().eq('id', newLoan.id) // roll back
            return { error: `${g.loan.label}: ${txnErr.message}` }
          }
          setLoans((prev) => [...prev, newLoan])
          setTransactions((prev) => [...prev, ...txnRows.map(mapTransaction)])
          loanCount += 1
          txnCount += txnRows.length
        }
      } else {
        for (const g of groups) {
          const id = nextId('ln')
          const loan = { ...g.loan, id, status: 'active', paidMonths: 0 }
          loan.disclosure = buildDisclosure(loan)
          setLoans((prev) => [...prev, loan])
          setTransactions((prev) => [
            ...prev,
            ...g.rows.map((r) => ({
              ...r,
              id: `${id}-${r.n}`,
              loanId: id,
              userId: g.loan.userId,
              archivedAt: null,
            })),
          ])
          loanCount += 1
          txnCount += g.rows.length
        }
      }
      log(
        actor,
        'TXN_IMPORTED',
        `${loanCount} loan${loanCount === 1 ? '' : 's'} with ${txnCount} installment${txnCount === 1 ? '' : 's'} imported from CSV`,
      )
      return { error: null, loanCount, txnCount }
    },
    [isLive, log, actor],
  )

  // Manual ledger entries may stand alone or append to an existing loan.
  const createTransaction = useCallback(async (input) => {
    try {
      if(session?.user?.role!=='admin')throw Error('Only the lender can add ledger entries.')
      const row=prepareManualTransaction(input,users,toISODate(new Date()),loans,[...transactions,...archivedTransactions])
      let saved=row
      if(isLive){
        const dbRow={...toDbTransaction(row),id:row.id}
        let {data,error}=await supabase.from('transactions').insert(dbRow).select().single()
        if(error?.code==='23505'){
          const existing=await supabase.from('transactions').select('*').eq('id',row.id).single()
          if(!existing.error&&Object.entries(dbRow).every(([key,value])=>key==='n'||(key==='amount'?Number(existing.data[key])===value:existing.data[key]===value))){data=existing.data;error=null}
        }
        if(error)throw Error(error.message)
        if(!data?.id)throw Error('The saved entry could not be confirmed. Keep this form open and retry.')
        saved=mapTransaction(data)
      }
      setTransactions(previous=>[...previous.filter(t=>t.id!==saved.id),saved])
      log(actor,'TXN_IMPORTED','Manual entry '+saved.id+': '+saved.description+', PHP '+(saved.originalAmount??saved.amount))
      return {error:null,transaction:saved}
    }catch(error){return {error:error.message||'Unable to add this transaction.'}}
  },[isLive,session,users,loans,transactions,archivedTransactions,log,actor])

  // Commit only the changed columns, and publish state only after confirmation.
  const updateTransaction = useCallback(async (id,patch) => {
    try {
      if(session?.user?.role!=='admin')throw Error('Only the lender can edit ledger entries.')
      const current=transactions.find(transaction=>transaction.id===id),today=toISODate(new Date())
      const prepared=prepareTransactionEdit(current,patch,today)
      const saved=isLive?mapTransaction(await persistTransactionEdit(supabase,current,patch,today)):prepared.next
      setTransactions(previous=>previous.map(transaction=>transaction.id===id?saved:transaction))
      log(actor,'TXN_UPDATED','Transaction '+id+' updated ('+Object.keys(patch).join(', ')+')')
      return {error:null,transaction:saved}
    }catch(error){reportDbError?.(error.message);return {error:error.message||'Unable to update this transaction.'}}
  },[isLive,session,transactions,log,actor])

  // Bulk find-and-replace of Item Descriptions from the Overall Transactions
  // ledger. `edits` is an array of { id, description } with the already-computed
  // new text. Only the description changes — borrower, amount, dates, and status
  // are untouched. One state update and one audit entry; live mode pushes each
  // row's new description to Supabase in parallel. Returns the number applied.
  const replaceTransactionDescriptions = useCallback(
    (edits) => {
      const feeIds=new Set(transactions.filter(t=>t.feeAssessmentId).map(t=>t.id))
      const map = new Map(
        (edits ?? [])
          .filter((e) => e && e.id && !feeIds.has(e.id) && typeof e.description === 'string' && e.description.trim())
          .map((e) => [e.id, e.description.trim()]),
      )
      if (map.size === 0) return 0
      if (isLive) {
        map.forEach((description, id) => {
          supabase
            .from('transactions')
            .update({ description })
            .eq('id', id)
            .then(logDbError('description replace'))
        })
      }
      setTransactions((prev) =>
        prev.map((t) => (map.has(t.id) ? { ...t, description: map.get(t.id) } : t)),
      )
      log(
        actor,
        'TXN_UPDATED',
        `Find & Replace updated ${map.size} item description${map.size === 1 ? '' : 's'}`,
      )
      return map.size
    },
    [isLive, log, actor, transactions],
  )

  // Edit a loan's disclosure-statement fields (admin only, via view-as). The
  // disclosure aggregates (totalDeductions, netProceeds) are recomputed from
  // the edited inputs; the amortization schedule rows are NOT regenerated —
  // those are edited independently as ledger transactions.
  const updateLoan = useCallback(
    (id, patch) => {
      const current = loans.find((l) => l.id === id)
      if (!current) return
      const merged = { ...current, ...patch }
      merged.disclosure = buildDisclosure(merged)
      if (isLive) {
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
      }
      setLoans((prev) => prev.map((l) => (l.id === id ? merged : l)))
      log(actor, 'LOAN_UPDATED', `Loan ${id} disclosure updated (${Object.keys(patch).join(', ')})`)
    },
    [isLive, log, actor, loans],
  )

  // Record a payment received (admin only). Writes ONLY payment_logs — never
  // the transactions ledger. Each recording is a single acknowledgement row;
  // there is no automatic "carried forward" entry.
  const createPaymentLog = useCallback(
    async (input) => {
      const borrower = users.find((u) => u.id === input.userId)
      const { remaining, status: computedStatus } = allocate(input.amountOwed, input.fundsApplied)
      // The admin may override the computed status (e.g. to "Credited") and the
      // computed Remaining Balance; fall back to the derived values otherwise.
      const status = input.status ?? computedStatus
      const remainingBalance = input.remainingBalance ?? remaining

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
        remainingBalance,
        allocStatus: status,
        carryApplied: 0,
        parentId: null,
        consumed: false,
        consumedBy: null,
        note: input.note ?? '',
      }

      if (isLive) {
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
      }

      // demo path: in-memory only
      const payment = { ...paymentDraft, id: nextId('plog'), createdAt: nowStamp() }
      setPaymentLogs((prev) => [...prev, payment])
      log(actor, 'PAYMENT_LOG_CREATED', `Payment logged for ${borrower?.name ?? input.userId} (${status})`)
      return payment
    },
    [isLive, log, actor, users],
  )

  // Permanently delete a payment log (admin). Also detaches any child carry it
  // produced and any "consumed_by" pointer that referenced it.
  const deletePaymentLog = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('payment_logs').delete().eq('id', id)
        if (error) {
          console.error('[supabase] payment log delete failed:', error.message)
          reportDbError?.(`delete payment log (${error.message})`)
          return false
        }
      }
      // Mirror the DB's ON DELETE SET NULL: child carry keeps its row with a
      // nulled parent_id, and any consumed_by pointer to this row is nulled.
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
    [isLive, log, actor],
  )

  // Edit an existing payment log (admin). Updates the editable detail fields and
  // the (now admin-settable) allocation status. Carry entries are not
  // regenerated — editing is a correction, not a re-recording.
  const updatePaymentLog = useCallback(
    async (id, patch) => {
      if (isLive) {
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
      }
      setPaymentLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
      log(actor, 'PAYMENT_LOG_UPDATED', `Payment log ${id} updated`)
      return true
    },
    [isLive, log, actor],
  )

  // Log an arbitrage record (admin only). Standalone — never touches the loan
  // ledger. Stores only the inputs; the spread/fee figures are derived.
  const createArbitrageLoan = useCallback(
    async (input) => {
      const borrower = users.find((u) => u.id === input.userId)
      if (isLive) {
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
      }
      const record = { ...input, id: nextId('arb'), createdAt: nowStamp() }
      setArbitrageLoans((prev) => [...prev, record])
      log(actor, 'ARBITRAGE_CREATED', `Arbitrage logged for ${borrower?.name ?? input.userId}`)
      return record
    },
    [isLive, log, actor, users],
  )

  const deleteArbitrageLoan = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('arbitrage_loans').delete().eq('id', id)
        if (error) {
          console.error('[supabase] arbitrage delete failed:', error.message)
          reportDbError?.(`delete arbitrage (${error.message})`)
          return false
        }
      }
      setArbitrageLoans((prev) => prev.filter((r) => r.id !== id))
      log(actor, 'ARBITRAGE_DELETED', `Arbitrage record ${id} deleted`)
      return true
    },
    [isLive, log, actor],
  )

  // Manage the stored rate lists (admin only) that populate the rate dropdowns
  // here and on the Loan Calculator. `kind` is 'borrower' or 'cost'.
  const addInterestRate = useCallback(
    async (kind, rate) => {
      const value = Math.round((Number(rate) + Number.EPSILON) * 10000) / 10000
      if (!Number.isFinite(value) || value < 0) return null
      if (interestRates.some((r) => r.kind === kind && r.rate === value)) return null // dedupe
      if (isLive) {
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
      }
      const mapped = { id: nextId('rate'), kind, rate: value }
      setInterestRates((prev) => [...prev, mapped])
      return mapped
    },
    [isLive, interestRates],
  )

  const deleteInterestRate = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('interest_rates').delete().eq('id', id)
        if (error) {
          console.error('[supabase] rate delete failed:', error.message)
          reportDbError?.(`delete rate (${error.message})`)
          return false
        }
      }
      setInterestRates((prev) => prev.filter((r) => r.id !== id))
      return true
    },
    [isLive],
  )

  // Loan Tracker (admin only): the admin's personal record of loans availed
  // from banks. Standalone — never touches any other table.
  const createTrackedLoan = useCallback(
    async (input) => {
      if (isLive) {
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
      }
      const record = { ...input, id: nextId('trk'), createdAt: nowStamp() }
      setTrackedLoans((prev) => [...prev, record])
      log(actor, 'TRACKED_LOAN_CREATED', `Tracked loan added (${input.bankName})`)
      return record
    },
    [isLive, log, actor],
  )

  const deleteTrackedLoan = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('tracked_loans').delete().eq('id', id)
        if (error) {
          console.error('[supabase] tracked loan delete failed:', error.message)
          reportDbError?.(`delete tracked loan (${error.message})`)
          return false
        }
      }
      setTrackedLoans((prev) => prev.filter((r) => r.id !== id))
      log(actor, 'TRACKED_LOAN_DELETED', `Tracked loan ${id} deleted`)
      return true
    },
    [isLive, log, actor],
  )

  // Re-read every override row (used by the writers and the realtime sub).
  const refreshPaymentDueOverrides = useCallback(async () => {
    const owner=authenticatedOwner.current,generation=++overrideGeneration.current
    const { data, error } = await supabase.from('payment_due_overrides').select('*')
    if(owner!==authenticatedOwner.current||generation!==overrideGeneration.current)return
    if (error) {
      console.warn('[supabase] payment_due_overrides refresh failed:', error.message)
      return
    }
    setPaymentDueOverrides((data ?? []).map(mapPaymentDueOverride))
  }, [])

  // Apply per-borrower overrides. `rows` is [{ borrowerId, dueDates,
  // nextDueDates }]: rows with dates in EITHER set are upserted, rows empty in
  // BOTH are removed. `dueDates` drives the Current card, `nextDueDates` the
  // Next card. Other borrowers' overrides are left untouched. Persisted to
  // Supabase in live mode so it reaches every borrower's device; localStorage
  // backs the demo/dev flow.
  const savePaymentDueOverrides = useCallback(
    async (rows) => {
      const appliedAt = new Date().toISOString()
      const hasDates = (r) =>
        (r.dueDates && r.dueDates.length > 0) || (r.nextDueDates && r.nextDueDates.length > 0)
      const toUpsert = (rows ?? []).filter(hasDates)
      const toDelete = (rows ?? []).filter((r) => !hasDates(r)).map((r) => r.borrowerId)
      if (isLive) {
        if (toUpsert.length) {
          const { error } = await supabase.from('payment_due_overrides').upsert(
            toUpsert.map((r) => ({
              borrower_id: r.borrowerId,
              due_dates: r.dueDates ?? [],
              next_due_dates: r.nextDueDates ?? [],
              applied_at: appliedAt,
              updated_by: session?.user?.id ?? null,
            })),
            { onConflict: 'borrower_id' },
          )
          if (error) {
            console.error('[supabase] payment due overrides save failed:', error.message)
            reportDbError?.(`payment due overrides save failed (${error.message}) — a migration may be missing`)
            return false
          }
        }
        if (toDelete.length) {
          const { error } = await supabase
            .from('payment_due_overrides')
            .delete()
            .in('borrower_id', toDelete)
          if (error) {
            console.error('[supabase] payment due overrides delete failed:', error.message)
            reportDbError?.(`payment due overrides delete failed (${error.message})`)
            return false
          }
        }
        await refreshPaymentDueOverrides()
        return true
      }
      // demo path
      setPaymentDueOverrides((prev) => {
        const map = new Map(prev.map((o) => [o.borrowerId, o]))
        for (const r of toUpsert)
          map.set(r.borrowerId, {
            borrowerId: r.borrowerId,
            dueDates: r.dueDates ?? [],
            nextDueDates: r.nextDueDates ?? [],
            appliedAt,
          })
        for (const id of toDelete) map.delete(id)
        const next = [...map.values()]
        writeStoredOverrides(next)
        return next
      })
      return true
    },
    [isLive, session, refreshPaymentDueOverrides],
  )

  // Clear one borrower's override entirely — both Current and Next sets —
  // reverting them to the default calculation.
  const clearPaymentDueOverride = useCallback(
    (borrowerId) => savePaymentDueOverrides([{ borrowerId, dueDates: [], nextDueDates: [] }]),
    [savePaymentDueOverrides],
  )

  // Clear every override.
  const clearAllPaymentDueOverrides = useCallback(async () => {
    if (isLive) {
      const { error } = await supabase.from('payment_due_overrides').delete().neq('borrower_id', '00000000-0000-0000-0000-000000000000')
      if (error) {
        console.error('[supabase] payment due overrides clear-all failed:', error.message)
        reportDbError?.(`clear all payment due overrides (${error.message})`)
        return false
      }
      await refreshPaymentDueOverrides()
      return true
    }
    setPaymentDueOverrides([])
    writeStoredOverrides([])
    return true
  }, [isLive, refreshPaymentDueOverrides])

  // Realtime: when the admin applies or clears an override, every connected
  // client (each borrower's device included) re-reads them, so the Next
  // Payment Due tile updates without a manual refresh.
  const pdoListenerId = session?.user?.id ?? 'anon'
  const pdoIsAdmin=session?.user?.role==='admin'
  useEffect(() => {
    if (!isLive) return undefined
    const generationRef=overrideGeneration
    const stop=subscribeToInvalidations({client:supabase,name:`payment-due-overrides-rt-${pdoListenerId}`,table:'payment_due_change_signals',ownerId:pdoListenerId,isAdmin:pdoIsAdmin,onChange:refreshPaymentDueOverrides,onError:error=>console.warn('[payment due]',error.message)})
    return ()=>{++generationRef.current;stop()}
  }, [isLive, pdoListenerId,pdoIsAdmin, refreshPaymentDueOverrides])

  const value = useMemo(
    () => ({
      session: effectiveSession,
      realSession: session,
      isViewingAs,
      startViewAs,
      stopViewAs,
      authLoading,
      dataReady,
      refreshing,
      refreshData,
      refreshOwnProfile,
      syncError,
      getProofUrl,
      importLoans,
      updateMyProfile,
      setMyAvatar,
      users,
      loans,
      payments,
      paymentLogs,
      paymentPostings,
      postCredit,
      reversePayment,
      createPaymentLog,
      updatePaymentLog,
      deletePaymentLog,
      arbitrageLoans,
      interestRates,
      createArbitrageLoan,
      deleteArbitrageLoan,
      addInterestRate,
      deleteInterestRate,
      trackedLoans,
      createTrackedLoan,
      deleteTrackedLoan,
      paymentDueOverrides,
      savePaymentDueOverrides,
      clearPaymentDueOverride,
      clearAllPaymentDueOverrides,
      transactions,
      auditLog,
      signInWithPassword,
      signInWithLoginCode,
      signInDemo,
      signOut,
      completePasswordSetup,
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
      updateTransaction,
      createTransaction,
      replaceTransactionDescriptions,
      updateLoan,
      archivedTransactions,
      archiveTransactions,
      restoreTransactions,
      purgeArchivedTransactions,
      purgeAuditEntries,
      importTransactions,
    }),
    [
      session, effectiveSession, isViewingAs, startViewAs, stopViewAs, authLoading,
      dataReady, refreshing, refreshData, refreshOwnProfile, syncError, getProofUrl, importLoans, updateMyProfile, setMyAvatar,
      users, loans, payments, paymentLogs,paymentPostings,postCredit,reversePayment, createPaymentLog, updatePaymentLog, deletePaymentLog,
      arbitrageLoans, interestRates, createArbitrageLoan, deleteArbitrageLoan,
      addInterestRate, deleteInterestRate,
      trackedLoans, createTrackedLoan, deleteTrackedLoan,
      paymentDueOverrides, savePaymentDueOverrides, clearPaymentDueOverride,
      clearAllPaymentDueOverrides,
      transactions, archivedTransactions, auditLog,
      signInWithPassword, signInWithLoginCode, signInDemo, signOut, completePasswordSetup, inviteUser, updateUser,
      deleteUser, resendInvite, submitPayment, reviewPayment, deletePayment, assignLoan, unassignLoan,
      setTransactionStatus, updateTransaction, createTransaction, replaceTransactionDescriptions, updateLoan,
      archiveTransactions, restoreTransactions,
      purgeArchivedTransactions, purgeAuditEntries, importTransactions,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- standard context hook co-located with its provider
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
