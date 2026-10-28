import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useMessages } from '../context/MessagesContext'
import { useNotifications } from '../context/NotificationsContext'
import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { effectiveStatus, borrowerStatus, BORROWER_STATUS_LABELS } from '../lib/transactions'
import { overrideForBorrower, rowForBorrower } from '../lib/paymentDueConfig'
import { greetingFor } from '../lib/mobileGreetings'
import { stagingReadOnly } from '../supabaseClient'
import ProfileModal from './ProfileModal'
import './mobile-borrower.css'

const settled = t => ['paid', 'refunded', 'cancelled'].includes(t.status)
const tabs = [['/portal','Home','⌂'],['/portal/consolidated','Transactions','▤'],['/portal/loan-request','Loan request','＋'],['/portal/payments','History','◷'],['/portal/more','More','•••']]

function useBorrowerLedger() {
  const app = useApp()
  return useMemo(() => {
    const id = app.session.user.id
    const rows = app.transactions.filter(t => t.userId === id)
    const owed = rows.filter(t => !settled(t))
    const today = toISODate(new Date())
    const override = overrideForBorrower(app.paymentDueOverrides, id)
    const past = owed.filter(t => effectiveStatus(t, today) === 'past_due')
    const future = owed.filter(t => effectiveStatus(t, today) === 'unpaid')
    const earliest = future.map(t => t.dueDate).sort()[0]
    const current = override ? owed.filter(t => override.dueDates.includes(t.dueDate)) : [...past,...future.filter(t => t.dueDate === earliest)]
    const nextDates = rowForBorrower(app.paymentDueOverrides, id)?.nextDueDates || []
    const next = owed.filter(t => nextDates.includes(t.dueDate))
    const loans = app.loans.filter(l => l.userId === id && l.txnType !== 'straight' && rows.some(t => t.loanId === l.id)).sort((a,b) => (b.txnDate || '').localeCompare(a.txnDate || ''))
    return { rows, owed, today, current, next, nextDates, loans, outstanding: owed.reduce((sum,t) => sum+t.amount,0) }
  }, [app.session.user.id, app.transactions, app.loans, app.paymentDueOverrides])
}

function LedgerRows({ rows, limit = 8 }) {
  const [shown,setShown] = useState(limit)
  const today = toISODate(new Date())
  if (!rows.length) return <p className="mb-empty">No records to show.</p>
  return <><div className="mb-records">{rows.slice(0,shown).map(t => <Link key={t.id} data-fee-kind={t.feeKind||undefined} className="mb-record" to={t.loanId ? `/portal/loans/${encodeURIComponent(t.loanId)}` : '/portal/straight'}>
    <span className="mb-record-icon">{t.type === 'Straight' ? '↔' : '▤'}</span><span><b>{t.description}</b><small>{formatDate(t.dueDate)} · {BORROWER_STATUS_LABELS[borrowerStatus(t,today)] || t.status}</small></span><strong>{formatPeso(t.amount)}</strong>
  </Link>)}</div>{shown < rows.length && <button className="mb-link" onClick={() => setShown(n => n+20)}>Show more ({rows.length-shown})</button>}</>
}

function LoanCards({ loans, rows, hideSettled = false }) {
  const visible = loans.filter(l => !hideSettled || !rows.filter(t => t.loanId === l.id).every(settled))
  const [shown,setShown] = useState(10)
  return <>{!visible.length && <p className="mb-empty">No loans in this view.</p>}{visible.slice(0,shown).map(l => {
    const schedule = rows.filter(t => t.loanId === l.id)
    const paid = schedule.filter(t => t.status === 'paid').length
    const total = schedule.length
    return <Link className="mb-loan" key={l.id} to={`/portal/loans/${encodeURIComponent(l.id)}`}><span><b>{l.label}</b><small>{l.id} · {formatDate(l.txnDate)}</small></span><strong>{formatPeso(l.principal)}</strong><div className="mb-progress"><i style={{width:`${total ? paid/total*100 : 0}%`}} /></div><small>{paid} of {total} installments paid · View schedule →</small></Link>
  })}{shown<visible.length && <button className="mb-link" onClick={() => setShown(n => n+20)}>Show more loans</button>}</>
}

export function MobileDashboard() {
  const ledger = useBorrowerLedger()
  const [mode,setMode] = useState(0)
  const [hidePaid,setHidePaid] = useState(true)
  const selected = mode === 1 ? ledger.next : ledger.current
  const amount = selected.reduce((sum,t) => sum+t.amount,0)
  const dates = [...new Set(selected.map(t => t.dueDate))].sort()
  const past = selected.filter(t => effectiveStatus(t,ledger.today)==='past_due')
  return <>
    <section className={`mb-balance ${mode ? 'mb-next' : ''}`}>
      <div className="mb-switch"><button className={!mode?'selected':''} onClick={() => setMode(0)}>Current Balance Due</button><button className={mode?'selected':''} onClick={() => setMode(1)}>Next Balance Due</button></div>
      <small>{mode ? 'NEXT PAYMENT DUE' : 'CURRENT PAYMENT DUE'}</small><div className="mb-big">{formatPeso(amount)}</div>
      <p>{dates.length ? dates.map(formatDate).join(' · ') : mode ? 'No next due dates set by your lender.' : 'No current payment due.'}</p>
      <div className="mb-balance-bottom"><span>Outstanding balance</span><b>{formatPeso(ledger.outstanding)}</b></div>
    </section>
    {!!past.length && <aside className="mb-advisory"><b>Payment reminder</b><p>{past.length} past-due {past.length===1?'installment':'installments'} in this due group. Contact your lender if you need help.</p></aside>}
    <section className="mb-section"><div className="mb-section-title"><h2>Transactions breakdown</h2><Link to="/portal/consolidated">View all →</Link></div><div className="mb-card"><LedgerRows key={mode} rows={selected.sort((a,b) => a.dueDate.localeCompare(b.dueDate))} limit={5}/></div></section>
    <div className="mb-quick"><Link to="/portal/payments">◷<span>Payment history</span></Link><Link to="/portal/invoices">▧<span>Invoices</span></Link><Link to="/portal/disbursements">⇩<span>Disbursements</span></Link><Link to="/portal/messages">✉<span>Messages</span></Link></div>
    <section className="mb-section"><div className="mb-section-title"><h2>My loans</h2><label><input type="checkbox" checked={hidePaid} onChange={e => setHidePaid(e.target.checked)}/> Hide settled</label></div><LoanCards loans={ledger.loans} rows={ledger.rows} hideSettled={hidePaid}/></section>
  </>
}

function MobileTransactions() {
  const ledger = useBorrowerLedger()
  const [filter,setFilter] = useState('all')
  const rows = ledger.rows.filter(t => filter==='all' || (filter==='owed' ? !settled(t) : t.status===filter)).sort((a,b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
  return <><h2>My transactions</h2><div className="mb-filters">{[['all','All'],['owed','Outstanding'],['paid','Paid'],['refunded','Refunded'],['cancelled','Cancelled']].map(([id,label]) => <button key={id} className={filter===id?'selected':''} onClick={() => setFilter(id)}>{label}</button>)}</div><div className="mb-card"><LedgerRows key={filter} rows={rows} limit={20}/></div><section className="mb-section"><h2>Installment schedules</h2><LoanCards loans={ledger.loans} rows={ledger.rows}/></section></>
}

function MobileHistory() {
  const {session,payments,getProofUrl} = useApp()
  const [opening,setOpening] = useState(null)
  const [error,setError] = useState('')
  const [proof,setProof] = useState(null)
  const rows = payments.filter(p => p.userId===session.user.id).sort((a,b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))
  const openProof = async p => {
    setOpening(p.id);setError('')
    try { const url = await getProofUrl(p); if (!url || new URL(url).origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) throw new Error('This proof is not available in this environment.'); setProof({...p,url}) }
    catch(e) { setError(e.message) } finally { setOpening(null) }
  }
  return <><h2>Payment history</h2><p className="mb-muted">Proof review and ledger posting are shown separately. A proof approval does not mark an installment paid.</p>{error && <p role="alert" className="mb-advisory">{error}</p>}<div className="mb-card">{!rows.length && <p className="mb-empty">No payment proofs submitted.</p>}{rows.map(p => <article className="mb-payment" key={p.id}><div className="mb-section-title"><b>{formatPeso(p.amount)}</b><span className="mb-status">{p.status}</span></div><p>{p.reference || 'No reference'} · {p.method} · {formatDate(p.submittedAt)}</p>{p.note && <p>{p.note}</p>}<button className="mb-link" disabled={!p.filePath || opening===p.id} onClick={() => openProof(p)}>{opening===p.id?'Opening…':'View proof →'}</button></article>)}</div>{proof && <div className="mb-proof-backdrop"><section className="mb-proof" role="dialog" aria-modal="true" aria-label="Payment proof"><button className="mb-link" onClick={() => setProof(null)}>Close ×</button>{proof.fileType==='application/pdf'?<iframe title="Payment proof PDF" src={proof.url}/>:<img alt="Submitted payment proof" src={proof.url}/>}<a href={proof.url} target="_blank" rel="noreferrer">Open original file</a></section></div>}</>
}

function MobileMore({openProfile,onClassic}) {
  const {signOut} = useApp()
  const items = [['Invoices','/portal/invoices'],['Disbursements','/portal/disbursements'],['Loan requests','/portal/loan-request'],['Straight transactions','/portal/straight'],['Payment logs','/portal/payment-logs'],['Notifications','/portal/notifications'],['Messages','/portal/messages']]
  return <><h2>My account</h2><div className="mb-card"><button className="mb-menu-row" onClick={openProfile}>Profile and personal details →</button>{items.map(([label,to]) => <Link className="mb-menu-row" key={to} to={to}>{label} →</Link>)}<button className="mb-menu-row" onClick={onClassic}>Use existing interface →</button><button className="mb-menu-row" onClick={signOut}>Sign out</button></div></>
}

function ChatPanel({close}) {
  const {session} = useApp()
  const {messagesFor,loading} = useMessages()
  const thread = messagesFor(session.user.id)
  return <aside className="mb-chat" aria-label="Lender messages"><header><b>LoanLedger Messages</b><button onClick={close} aria-label="Close messages">×</button></header><div className="mb-chat-scroll">{loading?<p>Loading messages…</p>:!thread.length?<p className="mb-muted">No messages yet.</p>:thread.map(m => <article key={m.id} className={m.fromAdmin?'':'outgoing'}><p>{m.body}</p><small>{new Date(m.createdAt).toLocaleString('en-PH')}</small></article>)}</div><div className="mb-composer"><span>＋</span><span>☺</span><input disabled placeholder="Message your lender…" aria-label="Message your lender"/><button disabled aria-label="Send message">➤</button></div><small className="mb-muted">Viewing messages in staging</small></aside>
}

export default function MobileBorrower({children,onClassic}) {
  const {session,refreshData,refreshing,syncError,signOut} = useApp()
  const {unreadCount} = useNotifications()
  const location = useLocation()
  const navigate = useNavigate()
  const [profile,setProfile] = useState(false)
  const [chat,setChat] = useState(false)
  const [finder,setFinder] = useState(false)
  const [search,setSearch] = useState('')
  const [translated,setTranslated] = useState(false)
  const timer = useRef(null)
  const [greeting,setGreeting] = useState(() => greetingFor(session.user))
  useEffect(() => { const clock = setInterval(() => setGreeting(greetingFor(session.user)),60000); return () => {clearInterval(clock);clearTimeout(timer.current)} },[session.user])
  useEffect(() => { const refresh = () => {if (!document.hidden) refreshData()}; window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return () => {window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh)} },[refreshData])
  const me = session.user
  const name = me.nickname || me.firstName || me.name.split(' ')[0]
  const path = location.pathname
  let content = children
  if(path==='/portal') content=<MobileDashboard/>
  if(path==='/portal/consolidated') content=<MobileTransactions/>
  if(path==='/portal/payments') content=<MobileHistory/>
  if(path==='/portal/more') content=<MobileMore openProfile={() => setProfile(true)} onClassic={onClassic}/>
  const translate = () => {setTranslated(true);clearTimeout(timer.current);timer.current=setTimeout(() => setTranslated(false),3000)}
  const searchLinks = tabs.concat([['/portal/invoices','Invoices','▧'],['/portal/disbursements','Disbursements','⇩'],['/portal/messages','Messages','✉']]).filter(([,label]) => label.toLowerCase().includes(search.toLowerCase()))
  return <div className="mb-shell"><main className="mb-main"><header className="mb-header"><div><h1 dir="auto" aria-live="polite"><bdi>{translated?greeting.english:greeting.text}</bdi>, <bdi>{name}</bdi></h1>{greeting.language!=='English' && <button className="mb-translate" onClick={translate} disabled={translated}>{translated?'English · Returning shortly':`${greeting.language} · Translate ↗`}</button>}</div><Link className="mb-notify" to="/portal/notifications" aria-label={`${unreadCount} unread notifications`}>♧{!!unreadCount && <sup>{unreadCount}</sup>}</Link><button className="mb-avatar" onClick={() => setProfile(true)} aria-label="My profile">{me.avatarUrl?<img src={me.avatarUrl} alt=""/>:name.slice(0,2).toUpperCase()}</button></header>
    {stagingReadOnly && <div className="mb-review">Local staging · Viewing only <button onClick={refreshData} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button></div>}
    {syncError?<div className="mb-card mb-empty" role="alert"><h2>Records could not be refreshed</h2><p>Please retry before reviewing your balances.</p><button onClick={refreshData}>Retry</button><button onClick={signOut}>Sign out</button></div>:content}
    <footer className="mb-footer">LoanLedger PH · Local staging</footer>
    {profile && <ProfileModal onClose={() => setProfile(false)}/>}
    {chat && <ChatPanel close={() => setChat(false)}/>}
    <button className="mb-chat-launch" onClick={() => setChat(v => !v)} aria-label="Open lender messages">✉</button>
    {finder?<div className="mb-finder"><div>{searchLinks.map(([to,label]) => <button key={to} onClick={() => {navigate(to);setFinder(false);setSearch('')}}>{label} →</button>)}</div><input autoFocus value={search} placeholder="Find a screen…" onChange={e => setSearch(e.target.value)} aria-label="Find a screen"/><button onClick={() => setFinder(false)} aria-label="Close Finder">×</button></div>:<button className="mb-orb" onClick={() => setFinder(true)} aria-label="Open Finder">⌕</button>}
  </main><nav className="mb-nav" aria-label="Borrower navigation">{tabs.map(([to,label,icon]) => <NavLink key={to} to={to} end={to==='/portal'}><span>{icon}</span>{label}</NavLink>)}</nav></div>
}
