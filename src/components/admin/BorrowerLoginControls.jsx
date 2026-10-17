import { useEffect, useRef, useState } from 'react'
import { changeBorrowerPassword } from '../../lib/borrowerAdministration'
import { Button, Field, inputClass } from '../ui'
import Icon from '../Icon'
import LocalLenderOperations from '../LocalLenderOperations'

export default function BorrowerLoginControls({ borrower, onBusyChange }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const root = useRef(null)
  useEffect(() => {
    const previous = document.activeElement, dialog = root.current?.closest('[role="dialog"]')
    root.current?.querySelector('input')?.focus({ preventScroll: true })
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); dialog?.querySelector('button[aria-label="Close"]')?.click(); return }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll('button,input,select,a[href]')].filter(item => !item.disabled && item.getClientRects().length)
      if (!items.length) return
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus() }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus() }
    }
    dialog?.addEventListener('keydown', keyboard)
    return () => { dialog?.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [])
  const valid = password.length >= 8 && new TextEncoder().encode(password).length <= 72
  async function save(event) {
    event.preventDefault()
    if (busy) return
    setError(''); setSaved(false)
    if (!valid || password !== confirmation) { setError('Enter matching passwords with at least 8 characters (maximum 72 UTF-8 bytes).'); return }
    setBusy(true); onBusyChange?.(true)
    try { await changeBorrowerPassword(borrower.id, password); setPassword(''); setConfirmation(''); setSaved(true) }
    catch (failure) { setError(failure.message || 'Unable to update the password. Please retry.') }
    finally { setBusy(false); onBusyChange?.(false) }
  }
  return <div ref={root} className="space-y-6">
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4"><strong className="block text-sm text-slate-900">{borrower.name}</strong><span className="mt-1 block break-all text-xs text-slate-500">{borrower.email}</span><span className="mt-1 block text-xs text-blue-700">Account {borrower.accountNumber || 'number pending'}</span></div>
    <form onSubmit={save} className="space-y-4">
      <div><h3 className="text-sm font-semibold text-slate-900">Change password</h3><p className="mt-1 text-xs text-slate-500">Set a new password for this borrower’s next sign-in.</p></div>
      <Field label="New password" htmlFor="borrower-new-password"><div className="relative"><input id="borrower-new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" className={inputClass + ' pr-12'} value={password} disabled={busy} onChange={event => { setPassword(event.target.value); setSaved(false) }} required minLength={8} aria-describedby="borrower-password-guidance" /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500" aria-label={visible ? 'Hide new password' : 'Show new password'} onClick={() => setVisible(current => !current)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button></div></Field>
      <Field label="Confirm new password" htmlFor="borrower-confirm-password"><input id="borrower-confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" className={inputClass} value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} required minLength={8} /></Field>
      <p id="borrower-password-guidance" className="text-xs text-slate-500">Use at least 8 characters. Passwords are saved securely and cannot be viewed later.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {saved && <p role="status" className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">Password updated. The borrower can use the new password to sign in.</p>}
      <Button type="submit" disabled={busy || !valid || password !== confirmation}>{busy ? 'Updating password…' : 'Update password'}</Button>
    </form>
    <LocalLenderOperations borrowers={[borrower]} initialBorrowerId={borrower.id} section="access" />
  </div>
}
