import { useCallback, useEffect, useState } from 'react'
import { getLoginLocks, unlockLoginAccess } from '../../lib/borrowerAdministration'
import { Button, Card, CardHeader } from '../ui'

export default function LoginAccessLocks() {
  const [locks, setLocks] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setBusy(true); setError('')
    try { setLocks((await getLoginLocks()).locks) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }, [])
  useEffect(() => {
    // One initial request. Further refreshes are explicitly requested by the lender.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])
  async function unlock(lock) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await unlockLoginAccess(lock.reference)
      setLocks(current => current.filter(item => item.reference !== lock.reference))
      setNotice('Access unlocked. The user can select Check access or reload the login page to try again.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <Card><CardHeader title="Sign-in locks" subtitle="Five failed attempts require a lender to unlock access" />
    <div className="space-y-4 p-5">
      <p className="text-xs leading-5 text-slate-500">Account locks block both sign-in methods. Invalid Login Codes lock the device instead. Match the unlock reference provided by the user; device locks are not linked to a borrower.</p>
      <Button variant="secondary" disabled={busy} onClick={load}>{busy ? 'Please wait…' : 'Refresh locks'}</Button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="text-xs text-blue-700">{notice}</p>}
      {!busy && !locks.length && !error && <p className="text-sm text-slate-500">No sign-in locks.</p>}
      <ul className="space-y-3">{locks.map(lock => <li key={lock.reference} className="rounded-xl border border-red-100 bg-red-50/40 p-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block text-sm text-slate-900">{lock.kind === 'device' ? 'Device Login Code lock' : lock.name || 'Email sign-in lock'}</strong>{lock.email && <span className="block break-all text-xs text-slate-600">{lock.email}</span>}<span className="mt-1 block text-xs text-red-700">5 of 5 attempts used</span></div><Button disabled={busy} onClick={() => unlock(lock)}>Unlock</Button></div>
        <p className="mt-2 break-all text-xs text-slate-500">Unlock reference: <span className="select-all font-mono">{lock.reference}</span></p>
      </li>)}</ul>
    </div>
  </Card>
}
