import { createContext, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from './AppContext'
import { releaseAccessEnabled, releaseAccessRequest } from '../lib/releaseAccess'
import { borrowerRelease } from '../lib/releasePolicy'

const ReleaseAccessContext = createContext(null)
const preferenceKey = id => 'loanledger-admin-interface:' + id
function savedClassic(id) { try { return !!id && sessionStorage.getItem(preferenceKey(id)) === 'classic' } catch { return false } }

export function ReleaseAccessProvider({ children }) {
  const { session, realSession } = useApp()
  const owner = realSession?.user || session?.user
  const location = useLocation()
  const navigate = useNavigate()
  const [preference, setPreference] = useState(null)
  const recovery = owner?.role === 'admin' && (location.pathname === '/admin/classic' || new URLSearchParams(location.search).get('interface') === 'classic')
  const classicAdmin = owner?.role === 'admin' && (recovery || (preference?.ownerId === owner.id ? preference.classic : savedClassic(owner.id)))
  const [assignment, setAssignment] = useState(null)
  const userId = session?.user.role === 'user' ? session.user.id : null
  const preview = owner?.role === 'admin' && !!userId
  useEffect(() => {
    const controller = new AbortController()
    if (!userId || !releaseAccessEnabled) {
      queueMicrotask(() => { if (!controller.signal.aborted) setAssignment(null) })
      return () => controller.abort()
    }
    // Pin the assignment for this mounted session. No polling or focus refresh.
    releaseAccessRequest('resolve', preview ? { userId } : {}, controller.signal).then(result => {
      if (!controller.signal.aborted) setAssignment({ ownerId: userId, interface: result.interface === 'new' ? 'new' : 'classic', ready: true })
    }).catch(() => {
      if (!controller.signal.aborted) setAssignment({ ownerId: userId, interface: 'classic', ready: true, error: 'The new interface could not be confirmed. Classic is available; reload to retry.' })
    })
    return () => controller.abort()
  }, [userId, preview])
  useEffect(() => {
    if (recovery && owner?.id) {
      try { sessionStorage.setItem(preferenceKey(owner.id), 'classic') } catch { /* Recovery also works without storage. */ }
      queueMicrotask(() => setPreference({ ownerId: owner.id, classic: true }))
    }
  }, [recovery, owner?.id])

  function chooseAdminInterface(mode) {
    if (owner?.role !== 'admin') return
    const classic = mode === 'classic'
    try { sessionStorage.setItem(preferenceKey(owner.id), classic ? 'classic' : 'new') } catch { /* Keep the in-tab preference. */ }
    setPreference({ ownerId: owner.id, classic })
    navigate(classic ? '/admin/classic' : '/admin', { replace: true })
  }
  const borrower = borrowerRelease(releaseAccessEnabled, userId, assignment)
  return <ReleaseAccessContext.Provider value={{ enabled: releaseAccessEnabled, borrower, classicAdmin, chooseAdminInterface }}>{children}</ReleaseAccessContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useReleaseAccess() { return useContext(ReleaseAccessContext) }
