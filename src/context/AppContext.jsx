import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
import { supabase } from '../supabaseClient'

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
  // Admin "view as borrower": the real session stays admin; pages see the
  // borrower through the effective session below.
  const [viewAs, setViewAs] = useState(null)
  const [users, setUsers] = useState(mockUsers)
  const [loans, setLoans] = useState(mockLoans)
  const [payments, setPayments] = useState(mockPayments)
  const [transactions, setTransactions] = useState(() => buildTransactions(mockLoans))
  const [archivedTransactions, setArchivedTransactions] = useState([])
  const [paymentLogs, setPaymentLogs] = useState([])
  const [arbitrageLoans, setArbitrageLoans] = useState([])
  const [interestRates, setInterestRates] = useState([])
  const [trackedLoans, setTrackedLoans] = useState([])
  const [auditLog, setAuditLog] = useState(mockAuditLog)

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
            if (error) {
              console.error('[supabase] audit insert failed:', error.message)
              reportDbError?.(`audit log (${error.message}) — a database migration may be missing`)
            } else setAuditLog((prev) => [mapAudit(data), ...prev])
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
  const loadLiveData = useCallback(async () => {
    const failures = []
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
      ] = await Promise.all([
          // Secondary .order('id') makes paging deterministic (a non-unique
          // primary sort key could otherwise shift rows across page boundaries).
          fetchAllRows(() => supabase.from('profiles').select('*').order('created_at').order('id')),
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
          fetchAllRows(() =>
            supabase.from('arbitrage_loans').select('*').order('created_at').order('id'),
          ),
          fetchAllRows(() => supabase.from('interest_rates').select('*').order('kind').order('rate')),
          fetchAllRows(() =>
            supabase.from('tracked_loans').select('*').order('created_at').order('id'),
          ),
          supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(500),
        ])

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

      if (paymentsRes.error) {
        failures.push(`payments (${paymentsRes.error.message})`)
      } else {
        const paymentRows = paymentsRes.data ?? []
        // Resolve signed URLs for rows that have a stored path. Map results by
        // REQUEST ORDER (not the returned `path`, which Supabase may re-encode
        // for keys with special characters — that mismatch dropped thumbnails).
        const paths = [...new Set(paymentRows.map((p) => p.file_path).filter(Boolean))]
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
        setPayments(paymentRows.map((p) => mapPayment(p, urlByPath[p.file_path] ?? null)))
      }

      if (failures.length > 0) {
        const msg = `Some records could not be refreshed: ${failures.join(', ')}.`
        console.error('[supabase]', msg)
        setSyncError(msg)
      } else {
        setSyncError(null)
      }
    } catch (e) {
      const msg = e?.message ?? 'Unexpected error while syncing with the database.'
      console.error('[supabase] loadLiveData crashed:', msg)
      setSyncError(msg)
    }
  }, [])

  // Manual re-sync from Supabase (Refresh button). Also resets retained
  // page state (filters, sorts, calculator inputs) back to defaults.
  const refreshData = useCallback(async () => {
    clearPageStore()
    if (!isLive) return
    setRefreshing(true)
    await loadLiveData()
    setRefreshing(false)
  }, [isLive, loadLiveData])

  // --- Supabase auth: restore the session on load, react to changes, resolve
  // the signed-in profile (role drives routing), then load the live data.
  useEffect(() => {
    let mounted = true

    const loadProfile = async (sbSession) => {
      if (!sbSession) {
        if (mounted) {
          setSession((prev) => (prev?.source === 'demo' ? prev : null))
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
        // defer: awaiting supabase calls directly inside this callback can deadlock
        setTimeout(() => loadProfile(sbSession), 0)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadLiveData])

  const signInWithPassword = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null } // session arrives via onAuthStateChange
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
    if (isLive) await supabase.auth.signOut()
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
    (id, patch) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
      if (isLive) {
        supabase
          .from('profiles')
          .update({ name: patch.name, email: patch.email, phone: patch.phone })
          .eq('id', id)
          .then(logDbError('profile update'))
      }
      log(actor, 'USER_UPDATED', `Profile ${id} updated`)
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
    (id, status, note = '') => {
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
    [isLive, log, actor, payments],
  )

  // Permanently delete a proof of payment: removes the storage object and the
  // payment row. RLS lets borrowers delete their own and admins delete any.
  const deletePayment = useCallback(
    async (payment) => {
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

  // Inline edits to a transaction (dates, amount, description, status).
  // Setting a Date Paid on an unpaid/past-due row marks it paid; clearing the
  // Date Paid on a paid row reverts it to unpaid.
  const updateTransaction = useCallback(
    (id, patch) => {
      const current = transactions.find((t) => t.id === id)
      if (!current) return
      const next = { ...current, ...patch }
      if ('datePaid' in patch) {
        if (patch.datePaid && (next.status === 'unpaid' || next.status === 'past_due'))
          next.status = 'paid'
        if (!patch.datePaid && next.status === 'paid') next.status = 'unpaid'
      }
      // Keep date_paid consistent with the status (and the DB constraint):
      //  - setting status to "paid" stamps today if no date yet
      //  - unpaid / past due / cancelled NEVER carry a date (enforced always,
      //    so a stale date can't linger after any edit)
      if ('status' in patch && next.status === 'paid' && !next.datePaid)
        next.datePaid = toISODate(new Date())
      if (['unpaid', 'cancelled', 'past_due'].includes(next.status)) next.datePaid = null
      if (isLive) {
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
      }
      setTransactions((prev) => prev.map((t) => (t.id === id ? next : t)))
      log(actor, 'TXN_UPDATED', `Installment ${id} updated (${Object.keys(patch).join(', ')})`)
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
      // The admin may override the computed status (e.g. to "Credited").
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

  const value = useMemo(
    () => ({
      session: effectiveSession,
      realSession: session,
      isViewingAs,
      startViewAs,
      stopViewAs,
      authLoading,
      refreshing,
      refreshData,
      syncError,
      getProofUrl,
      importLoans,
      updateMyProfile,
      setMyAvatar,
      users,
      loans,
      payments,
      paymentLogs,
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
      transactions,
      auditLog,
      signInWithPassword,
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
      refreshing, refreshData, syncError, getProofUrl, importLoans, updateMyProfile, setMyAvatar,
      users, loans, payments, paymentLogs, createPaymentLog, updatePaymentLog, deletePaymentLog,
      arbitrageLoans, interestRates, createArbitrageLoan, deleteArbitrageLoan,
      addInterestRate, deleteInterestRate,
      trackedLoans, createTrackedLoan, deleteTrackedLoan,
      transactions, archivedTransactions, auditLog,
      signInWithPassword, signInDemo, signOut, completePasswordSetup, inviteUser, updateUser,
      deleteUser, resendInvite, submitPayment, reviewPayment, deletePayment, assignLoan, unassignLoan,
      setTransactionStatus, updateTransaction, updateLoan, archiveTransactions, restoreTransactions,
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
