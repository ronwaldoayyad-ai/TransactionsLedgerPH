import { serviceEndpoint, companionEnabled } from '../lib/serviceEndpoint'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { mobileAction } from '../lib/mobileLocalFlow'
import { Button, Card, CardHeader, inputClass } from './ui'
import { MagneticDots } from './ProcessingFeedback'
import Icon from './Icon'
import { useRecordRefresh } from '../lib/recordRefresh'
import LoginAccessLocks from './admin/LoginAccessLocks'

const statuses = ['Submitted', 'Seen by lender', 'In progress', 'Resolved']

// Both workspace destinations reuse the existing authenticated local service.
export default function LocalLenderOperations({ borrowers, section = 'all', initialBorrowerId = '' }) {
  const [selected, setSelected] = useState(initialBorrowerId)
  const [code, setCode] = useState(null)
  const [accessNotice, setAccessNotice] = useState('')
  const [tickets, setTickets] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const requestId = useRef(0)
  const local = companionEnabled
  const supportEnabled = local && section !== 'access'

  const reload = useCallback(async () => {
    if (!supportEnabled) return
    const current = ++requestId.current
    try {
      const [result, history] = await Promise.all([
        supabase.from('support_tickets').select('*').order('created_at', { ascending: false }),
        supabase.from('support_ticket_events').select('*').order('created_at'),
      ])
      if (result.error || history.error) throw Error('Support history could not be loaded. Please retry.')
      if (current === requestId.current) { setTickets(result.data || []); setEvents(history.data || []); setError('') }
    } catch (failure) {
      if (current === requestId.current) setError(failure.message || 'Support history could not be loaded.')
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [supportEnabled])

  useRecordRefresh(reload, supportEnabled)

  useEffect(() => {
    if (!supportEnabled) return undefined
    const requests = requestId
    // Initial external-data fetch; loading already starts true and state is
    // updated when the request settles, not to derive render-time values.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
    const channel = supabase.channel('lender-local-support').on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, reload).subscribe()
    return () => { requests.current++; supabase.removeChannel(channel) }
  }, [reload, supportEnabled])

  if (!local) return section === 'support' ? <Card><div className="aw-empty"><Icon name="help" /><h3>Support tickets aren’t available here yet</h3><p>The support service must be connected before tickets can be viewed in this environment.</p></div></Card> : null

  function refresh() { setLoading(true); setError(''); reload() }

  async function tokenAction(action, payload) {
    if (busy) return
    setBusy(true); setError(''); setAccessNotice('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw Error('Your session could not be confirmed. Please retry.')
      const response = await fetch(serviceEndpoint('' + action), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) })
      const result = await response.json()
      if (!response.ok) throw Error(result.error)
      setCode(action === 'issue' ? result : null)
      if (action === 'revoke') setAccessNotice(result.revoked ? 'Login Code revoked. It can no longer be used.' : 'No active Login Code remains for this borrower.')
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  async function updateStatus(ticket, next) {
    if (busy) return
    setBusy(true); setError('')
    try {
      await mobileAction('support-status', { key: crypto.randomUUID(), id: ticket.id, status: next, note: 'Status updated by lender.' })
      await reload()
    } catch (failure) { setError(failure.message) } finally { setBusy(false) }
  }

  async function attachment(ticket) {
    const preview = window.open('about:blank', '_blank')
    if (preview) preview.opener = null
    try {
      const result = await supabase.storage.from('mobile-attachments').createSignedUrl(ticket.attachment_path, 300)
      if (result.error) throw result.error
      if (!preview) throw Error('Allow pop-ups to open this attachment, then retry.')
      preview.location.href = result.data.signedUrl
    } catch (failure) { preview?.close(); setError(failure.message) }
  }

  const q = query.trim().toLowerCase()
  const shown = tickets.filter(ticket => (statusFilter === 'all' || ticket.status === statusFilter) && [ticket.ticket_number, ticket.topic, ticket.email, borrowers.find(borrower => borrower.id === ticket.user_id)?.name].some(value => String(value || '').toLowerCase().includes(q)))

  return <div className="space-y-5">
    {section !== 'support' && <LoginAccessLocks />}
    {error && <div className="aw-sync-error" role="alert"><Icon name="alert" /><span>{error}</span>{supportEnabled && <button onClick={refresh} disabled={loading}>Retry</button>}</div>}
    {section !== 'support' && <Card><CardHeader title="Borrower Login Code" subtitle="Stays valid until replaced or revoked" /><div className="space-y-3 p-5">
      <label className="block text-sm">Borrower<select disabled={busy} aria-label="Borrower for login code" className={inputClass} value={selected} onChange={event => { setSelected(event.target.value); setCode(null); setAccessNotice('') }}><option value="">Choose a borrower</option>{borrowers.filter(borrower => borrower.status === 'active').map(borrower => <option key={borrower.id} value={borrower.id}>{borrower.name}</option>)}</select></label>
      <p className="text-xs leading-5 text-slate-500">Issuing a new Login Code replaces this borrower’s previous code. Share it privately with the borrower.</p>
      <Button disabled={busy || !selected} onClick={() => tokenAction('issue', { userId: selected })}>{busy ? 'Please wait…' : code ? 'Replace Login Code' : 'Issue Login Code'}</Button>
      {!code && <Button variant="secondary" disabled={busy || !selected} onClick={() => tokenAction('revoke', { userId: selected })}>Revoke existing Login Code</Button>}
      {accessNotice && <p role="status" className="text-xs text-blue-700">{accessNotice}</p>}
      {code && <div role="status" className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-2xl font-bold tracking-widest" data-testid="local-login-code">{code.code}</p><p className="text-xs leading-5 text-slate-600">{code.permanent ? 'No expiry. Valid until you replace or revoke it.' : 'This older code follows its original expiry rule.'} Keep a private copy; it cannot be viewed again after closing.</p><Button disabled={busy} onClick={() => tokenAction('revoke', { id: code.id })}>Revoke Login Code</Button></div>}
    </div></Card>}
    {section !== 'access' && <Card><CardHeader title="Support inbox" subtitle={`${tickets.length} tickets · borrower and guest requests`} action={<Button variant="secondary" disabled={loading} onClick={refresh}>Refresh</Button>} />
      <div className="aw-directory-tools"><label className="aw-directory-search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search reference, borrower or email" aria-label="Search support tickets" /></label><select aria-label="Filter ticket status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></div>
      {loading && <div className="flex items-center justify-center gap-6 p-5" role="status"><MagneticDots /><span className="text-xs text-slate-500">Loading support history…</span></div>}
      {!loading && !shown.length && !error && <div className="aw-empty"><Icon name="inbox" /><h3>{tickets.length ? 'No matching tickets' : 'No support tickets yet'}</h3><p>{tickets.length ? 'Try another search or status.' : 'Borrower and guest requests will appear here.'}</p></div>}
      <div className="divide-y divide-slate-100">{shown.map(ticket => <article key={ticket.id} className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-700">{ticket.ticket_number}</p><h2 className="mt-1 text-sm font-semibold">{ticket.topic}</h2><p className="mt-1 text-xs text-slate-500">{borrowers.find(borrower => borrower.id === ticket.user_id)?.name || ticket.email}</p></div><label className="text-xs text-slate-500">Status<select aria-label={'Status ' + ticket.ticket_number} className={inputClass} disabled={busy || loading} value={ticket.status} onChange={event => updateStatus(ticket, event.target.value)}>{statuses.map(status => <option key={status} disabled={status === 'Submitted' && ticket.status !== 'Submitted'}>{status}</option>)}</select></label></div><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{ticket.description}</p>{ticket.attachment_path && <Button variant="secondary" onClick={() => attachment(ticket)}>View attachment</Button>}<details className="text-xs text-slate-500"><summary className="cursor-pointer">Status history</summary><ol className="mt-3 space-y-2">{events.filter(event => event.ticket_id === ticket.id).map(event => <li key={event.id}>{event.status} · {new Date(event.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} {event.note}</li>)}</ol></details></article>)}</div>
    </Card>}
  </div>
}
