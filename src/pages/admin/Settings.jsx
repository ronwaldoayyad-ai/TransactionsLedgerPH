import { useCallback, useEffect, useRef, useState } from 'react'
import { useReleaseAccess } from '../../context/ReleaseAccessContext'
import { releaseAccessEnabled, releaseAccessRequest } from '../../lib/releaseAccess'
import Icon from '../../components/Icon'
import TelegramSettings from '../../components/TelegramSettings'
import { MagneticDots } from '../../components/ProcessingFeedback'
import './release-access.css'

const label = value => value === 'new' ? 'New interface' : value === 'classic' ? 'Classic' : 'Use default'
const dateLabel = value => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value))

function ReviewChange({ change, saving, onCancel, onConfirm }) {
  const dialog = useRef(null)
  const confirm = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const opener = document.activeElement
    element.showModal()
    confirm.current?.focus()
    return () => { element.close(); opener?.isConnected && opener.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="release-dialog" aria-labelledby="release-review-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel() }}>
    <h2 id="release-review-title">Review release change</h2>
    <p>{change.summary}</p>
    <p className="release-muted">Applies at the next sign-in or reload. Active borrower screens will stay open.</p>
    <div className="release-actions"><button type="button" disabled={saving} onClick={onCancel}>Cancel</button><button ref={confirm} type="button" className="release-primary" disabled={saving} onClick={onConfirm}>{saving ? 'Saving…' : 'Confirm change'}</button></div>
  </dialog>
}

export default function Settings() {
  const { classicAdmin, chooseAdminInterface } = useReleaseAccess()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState([])
  const [bulk, setBulk] = useState('new')
  const [enabled, setEnabled] = useState(false)
  const [defaultInterface, setDefaultInterface] = useState('classic')
  const [change, setChange] = useState(null)
  const [saving, setSaving] = useState(false)
  const mounted = useRef(false)
  const requestNumber = useRef(0)

  const load = useCallback(async () => {
    const request = ++requestNumber.current
    setLoading(true); setError('')
    try {
      const result = await releaseAccessRequest('list')
      if (!mounted.current || request !== requestNumber.current) return
      setData(result); setEnabled(result.settings.rollout_enabled); setDefaultInterface(result.settings.default_interface); setSelected([])
    } catch (failure) {
      if (mounted.current && request === requestNumber.current) setError(failure.message)
    } finally { if (mounted.current && request === requestNumber.current) setLoading(false) }
  }, [])
  useEffect(() => {
    mounted.current = true
    let active = true
    queueMicrotask(() => { if (active) load() })
    return () => { active = false; mounted.current = false }
  }, [load])

  const borrowers = data?.borrowers || []
  const q = query.trim().toLocaleLowerCase()
  const filtered = borrowers.filter(row => (!q || [row.name, row.email, row.account_number].some(value => String(value || '').toLocaleLowerCase().includes(q))) && (filter === 'all' || row.effective_interface === filter))
  const allSelected = filtered.length > 0 && filtered.every(row => selected.includes(row.id))
  const changedSettings = !!data && (enabled !== data.settings.rollout_enabled || defaultInterface !== data.settings.default_interface)
  const disabled = saving || loading || !!error || !data

  function reviewAssignment(userIds, value) {
    const rows = borrowers.filter(row => userIds.includes(row.id))
    setChange({ action: 'assign', payload: { userIds, interface: value }, summary: `${rows.length === 1 ? rows[0].name : rows.length + ' borrowers'}: ${label(value)}.${!data.settings.rollout_enabled ? ' The rollout is paused, so Classic remains in effect until you resume it.' : ''}` })
  }
  async function save() {
    if (saving || !change || !data) return
    setSaving(true); setError(''); setNotice('')
    try {
      await releaseAccessRequest(change.action, { ...change.payload, expectedVersion: data.settings.version })
      if (!mounted.current) return
      setChange(null); setNotice('Release access saved. Borrowers will use the updated assignment at their next sign-in or reload.')
      await load()
    } catch (failure) { if (mounted.current) { setChange(null); setError(failure.message) } }
    finally { if (mounted.current) setSaving(false) }
  }

  return <div className="release-access">
    <header className="release-heading"><div><h1>Settings</h1><p>Manage release access and admin notification preferences.</p></div><button type="button" disabled={loading || saving} onClick={() => { setNotice(''); load() }}><Icon name="refresh" />Refresh</button></header>
    <nav className="release-tabs" aria-label="Settings sections"><a href="#release-access-panel">Release access</a><a href="#telegram-alerts">Telegram alerts</a></nav>
    <div id="release-access-panel">
      <section className="release-card release-admin-card"><div><h2>Your admin workspace</h2><p>You are using {classicAdmin ? 'classic admin' : 'the new admin workspace'}. Switching keeps your sign-in and records.</p></div><button type="button" onClick={() => chooseAdminInterface(classicAdmin ? 'new' : 'classic')}><Icon name="dashboard" />{classicAdmin ? 'Use new admin workspace' : 'Return to classic admin'}</button></section>
      {!releaseAccessEnabled && <p className="release-error" role="alert">Release access is not connected in this environment yet.</p>}
      {notice && <p className="release-notice" role="status">{notice}</p>}
      {error && <div className="release-error" role="alert"><p>{error}</p><button type="button" disabled={loading || saving} onClick={load}>Reload release access</button></div>}
      {loading && !data && <div className="release-loading" role="status"><MagneticDots /><span>Loading release access…</span></div>}
      {data && <>
        <section className="release-metrics" aria-label="Borrower interface assignments"><div><strong>{borrowers.length}</strong><span>Borrower accounts</span></div><div><strong>{borrowers.filter(row => row.effective_interface === 'new').length}</strong><span>Assigned new interface</span></div><div><strong>{borrowers.filter(row => row.effective_interface === 'classic').length}</strong><span>Assigned classic</span></div></section>
        <section className="release-card"><div className="release-section-heading"><div><h2>Rollout controls</h2><p>Borrower access is separate from your admin workspace.</p></div><span className={`release-badge ${data.settings.rollout_enabled ? 'is-new' : ''}`}>{data.settings.rollout_enabled ? 'Rollout enabled' : 'Rollout paused'}</span></div>
          <fieldset disabled={disabled} className="release-controls"><label className="release-switch"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span><strong>Enable borrower rollout</strong><small>When paused, all borrowers open Classic. Saved assignments are retained.</small></span></label><label className="release-default">Default interface<select value={defaultInterface} onChange={event => setDefaultInterface(event.target.value)}><option value="classic">Classic</option><option value="new">New interface</option></select><small>Applies to new accounts and existing accounts set to “Use default”. Explicit assignments stay in place.</small></label></fieldset>
          <div className="release-actions"><button type="button" className="release-primary" disabled={disabled || !changedSettings} onClick={() => setChange({ action: 'settings', payload: { enabled, defaultInterface }, summary: `${enabled ? 'Enable' : 'Pause'} the borrower rollout. Default interface: ${label(defaultInterface)}.${!enabled ? ' All borrowers will open Classic at their next sign-in or reload.' : ''}` })}>Review settings change</button></div>
        </section>
        <section className="release-card"><div className="release-section-heading"><div><h2>Borrower access</h2><p>Assignments apply across devices. They do not change account status or permissions.</p></div></div>
          <div className="release-toolbar"><label className="release-search"><Icon name="search" /><input aria-label="Find borrower" placeholder="Name, email or account number" type="search" maxLength={200} value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Filter assigned interface" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All interfaces</option><option value="new">New interface</option><option value="classic">Classic</option></select></div>
          <div className="release-bulk"><span>{selected.length} selected</span><select aria-label="Interface for selected borrowers" value={bulk} disabled={disabled} onChange={event => setBulk(event.target.value)}><option value="new">New interface</option><option value="classic">Classic</option><option value="default">Use default</option></select><button type="button" disabled={disabled || !selected.length || selected.length > 500} onClick={() => reviewAssignment(selected, bulk)}>Apply to selected</button>{selected.length > 0 && <button type="button" disabled={saving} onClick={() => setSelected([])}>Clear selection</button>}</div>
          <p className="release-muted">Showing {filtered.length} of {borrowers.length}. Bulk changes include selected accounts hidden by filters; maximum 500 per save.</p>
          <div className="release-table-wrap"><table><caption className="sr-only">Borrower interface access</caption><thead><tr><th><input type="checkbox" aria-label="Select all filtered borrowers" disabled={disabled || !filtered.length} checked={allSelected} onChange={() => setSelected(previous => allSelected ? previous.filter(id => !filtered.some(row => row.id === id)) : [...new Set([...previous, ...filtered.map(row => row.id)])])} /></th><th>Borrower</th><th>Assignment</th><th>Next sign-in / reload</th><th>Change access</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.name}`} disabled={disabled} checked={selected.includes(row.id)} onChange={() => setSelected(previous => previous.includes(row.id) ? previous.filter(id => id !== row.id) : [...previous, row.id])} /></td><td><strong>{row.name}</strong><small>{row.account_number || 'Account number pending'}</small><small>{row.email}</small>{row.status !== 'active' && <small>Account: {row.status}</small>}</td><td>{row.assignment ? label(row.assignment) : `Default (${label(data.settings.default_interface)})`}</td><td><span className={`release-badge ${row.effective_interface === 'new' ? 'is-new' : ''}`}>{label(row.effective_interface)}</span></td><td><select aria-label={`Change interface for ${row.name}`} value={row.assignment || 'default'} disabled={disabled} onChange={event => reviewAssignment([row.id], event.target.value)}><option value="default">Use default</option><option value="classic">Classic</option><option value="new">New interface</option></select></td></tr>)}</tbody></table>{!filtered.length && <p className="release-empty">{borrowers.length ? 'No borrowers match your search.' : 'No borrower accounts yet.'}</p>}</div>
        </section>
        <section className="release-card"><h2>Change history</h2><p className="release-muted">Latest 50 saved changes · Philippine time</p>{!data.history.length ? <p className="release-empty">No release changes yet.</p> : <ol className="release-history">{data.history.map(item => <li key={item.id}><div><strong>{item.actor_name}</strong><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div>{item.action === 'settings' ? <p>Rollout {item.details.after.enabled ? 'enabled' : 'paused'}; default: {label(item.details.after.defaultInterface)}.</p> : <ul>{item.details.changes.map(row => <li key={row.id}>{row.name}: {label(row.before)} → {label(row.after)}</li>)}</ul>}</li>)}</ol>}</section>
      </>}
    </div>
    <TelegramSettings />
    {change && <ReviewChange change={change} saving={saving} onCancel={() => setChange(null)} onConfirm={save} />}
  </div>
}
