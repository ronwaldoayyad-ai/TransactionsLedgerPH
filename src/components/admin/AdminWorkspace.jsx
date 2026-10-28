import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useReleaseAccess } from '../../context/ReleaseAccessContext'
import { useMessages } from '../../context/MessagesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import Icon from '../Icon'
import ProfileModal from '../ProfileModal'
import { MagneticDots } from '../ProcessingFeedback'
import { borrowerReference, matchesBorrower, workspaceNavigation, workspacePages } from './workspaceNavigation'
import './admin-workspace.css'

const mobileNavigation = [
  { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/admin/users', label: 'Borrowers', icon: 'users' },
  { to: '/admin/queue', label: 'Review', icon: 'inbox' },
  { to: '/admin/messages', label: 'Messages', icon: 'mail' },
]

function WorkspaceSearch({ open, onOpen, onClose }) {
  const { users } = useApp()
  const [query, setQuery] = useState('')
  const root = useRef(null)
  const input = useRef(null)
  const restoringFocus = useRef(false)
  const navigate = useNavigate()
  const q = query.trim().toLocaleLowerCase()
  const pages = workspacePages.filter(page => `${page.label} ${page.group}`.toLowerCase().includes(q))
  const borrowers = q ? users.filter(user => user.role === 'user' && matchesBorrower(user, q)).slice(0, 8) : []

  const dismiss = useCallback((restore = true) => {
    restoringFocus.current = true
    onClose()
    if (restore) input.current?.focus({ preventScroll: true })
    queueMicrotask(() => { restoringFocus.current = false })
  }, [onClose])

  useEffect(() => {
    if (!open) return undefined
    input.current?.focus({ preventScroll: true })
    const viewport = window.visualViewport
    let frame
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const bottom = input.current?.closest('.aw-search-control').getBoundingClientRect().bottom || 0
        const visibleBottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight
        root.current?.style.setProperty('--aw-search-space', `${Math.max(100, visibleBottom - bottom - 104)}px`)
      })
    }
    const outside = event => { if (!root.current?.contains(event.target)) dismiss(false) }
    place()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
    }
  }, [open, dismiss])

  function go(to) { dismiss(false); setQuery(''); navigate(to) }
  function keyboard(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismiss(); return }
    const results = [...(root.current?.querySelectorAll('.aw-search-result') || [])]
    if (event.key === 'Enter' && event.target === input.current && open && results.length) { event.preventDefault(); results[0].click(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (event.target === input.current && !['ArrowDown', 'ArrowUp'].includes(event.key)) return
    if (!open) { onOpen(); return }
    if (!results.length) return
    event.preventDefault()
    const index = results.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? results.length - 1 : event.key === 'ArrowDown' ? (index + 1) % results.length : (index < 0 ? results.length - 1 : (index - 1 + results.length) % results.length)
    results[next].focus({ preventScroll: true })
    results[next].scrollIntoView({ block: 'nearest' })
  }

  return <div className="aw-workspace-search" ref={root} onKeyDown={keyboard} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) dismiss(false) }}>
    <div className={`aw-search-control animated-access-ring${open ? ' is-open' : ''}`}>
      <Icon name="search" />
      <input ref={input} type="search" value={query} maxLength={200} autoComplete="off" placeholder="Search workspace…" aria-label="Search pages and borrowers" aria-expanded={open} aria-controls={open ? 'aw-search-panel' : undefined} aria-haspopup="dialog" onFocus={() => { if (!restoringFocus.current) onOpen() }} onChange={event => { setQuery(event.target.value); onOpen() }} />
      {query ? <button type="button" className="aw-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); input.current?.focus() }}><Icon name="x" /></button> : <kbd>Ctrl K</kbd>}
    </div>
    {open && <section id="aw-search-panel" className="aw-search-panel" role="dialog" aria-labelledby="aw-search-title">
    <div className="aw-search-heading"><div><h2 id="aw-search-title">Workspace results</h2><p>{q ? `${pages.length + borrowers.length} matches` : 'Jump to a page or find a borrower'}</p></div><button type="button" className="aw-icon-button" onClick={() => dismiss()} aria-label="Close search"><Icon name="x" /></button></div>
    <div className="aw-search-results">
      {borrowers.length > 0 && <><p className="aw-eyebrow">Borrowers</p>{borrowers.map(borrower => <button key={borrower.id} className="aw-search-result" onClick={() => go(`/admin/users?q=${encodeURIComponent(borrower.accountNumber || borrower.email || borrower.name)}`)}><span className="aw-avatar">{borrower.name?.charAt(0) || '?'}</span><span><strong>{borrower.name}</strong><small>{borrowerReference(borrower)}</small></span><Icon name="arrowRight" /></button>)}</>}
      {pages.length > 0 && <><p className="aw-eyebrow">Pages</p>{pages.map(page => <button key={page.to} className="aw-search-result" onClick={() => go(page.to)}><Icon name={page.icon} /><span><strong>{page.label}</strong><small>{page.group}</small></span><Icon name="arrowRight" /></button>)}</>}
      {!pages.length && !borrowers.length && <div className="aw-empty"><Icon name="search" /><h3>No matches found</h3><p>Try a borrower name, account number or page name.</p></div>}
    </div>
    <p className="aw-search-hint">↑ ↓ to browse · Enter to open · Esc to close</p>
    </section>}
  </div>
}

export default function AdminWorkspace({ children }) {
  const { chooseAdminInterface } = useReleaseAccess()
  const { session, realSession, users, payments, refreshing, syncError, refreshData, signOut } = useApp()
  const { unreadTotal } = useMessages()
  const { unreadCount } = useNotifications()
  const { requests = [] } = useLoanRequests()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState(false)
  const [profile, setProfile] = useState(false)
  const drawerRef = useRef(null)
  const drawerOpener = useRef(null)
  const closeSearch = useCallback(() => setSearch(false), [])
  const openSearch = useCallback(() => setSearch(true), [])
  const me = realSession?.user || session.user
  const page = workspacePages.find(item => item.to === location.pathname) || workspacePages[0]
  const counts = {
    '/admin/queue': payments.filter(payment => payment.status === 'pending' && !payment.retractedAt).length,
    '/admin/loan-requests': requests.filter(request => request.status === 'pending').length,
    '/admin/messages': unreadTotal,
    '/admin/notifications': unreadCount,
  }
  const moreActive = !mobileNavigation.some(item => location.pathname === item.to || (!item.end && location.pathname.startsWith(item.to + '/')))

  function openNavigation(event) { setSearch(false); drawerOpener.current = event.currentTarget; setDrawer(true) }

  useEffect(() => { queueMicrotask(() => setSearch(false)) }, [location.pathname])

  useEffect(() => {
    function shortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setSearch(current => !current)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    if (!drawer) return undefined
    const modal = drawerRef.current
    modal.showModal()
    const wide = matchMedia('(min-width: 1100px)')
    const closeWide = () => { if (wide.matches) setDrawer(false) }
    wide.addEventListener('change', closeWide)
    const previousOverflow = document.body.style.overflow
    const menuButton = drawerOpener.current
    document.body.style.overflow = 'hidden'
    return () => { modal.close(); document.body.style.overflow = previousOverflow; wide.removeEventListener('change', closeWide); menuButton?.focus({ preventScroll: true }) }
  }, [drawer])

  function nav(moreOnly = false) {
    const groups = workspaceNavigation.map(group => ({ ...group, items: group.items.filter(item => !moreOnly || !mobileNavigation.some(primary => primary.to === item.to)) })).filter(group => group.items.length)
    return <nav className="aw-navigation" aria-label={moreOnly ? 'More workspace pages' : 'Admin workspace'}>{groups.map(group => <div className="aw-nav-group" key={group.title}><p className="aw-eyebrow">{group.title}</p>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setDrawer(false)} className={({ isActive }) => `aw-nav-link${isActive ? ' is-active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{counts[item.to] > 0 && <span className="aw-nav-count" aria-label={`${counts[item.to]} ${item.to === '/admin/queue' || item.to === '/admin/loan-requests' ? 'pending' : 'unread'}`}>{counts[item.to] > 99 ? '99+' : counts[item.to]}</span>}</NavLink>)}</div>)}</nav>
  }

  const brand = <Link className="aw-brand" to="/admin" onClick={() => setDrawer(false)}><span className="aw-brand-mark"><Icon name="wallet" /></span><span><strong>LoanLedger <span>PH</span></strong><small>Lender workspace</small></span></Link>
  const footer = <div className="aw-sidebar-footer"><button className="aw-profile" onClick={() => { setDrawer(false); setProfile(true) }} aria-label={`Open profile for ${me.name}`}>
    {me.avatarUrl ? <img src={me.avatarUrl} alt="" className="aw-avatar" /> : <span className="aw-avatar">{me.name?.charAt(0) || 'L'}</span>}<span><strong>{me.name}</strong><small>Administrator</small></span><Icon name="chevron" /></button>
    <button className="aw-return-classic" onClick={() => chooseAdminInterface('classic')}><Icon name="dashboard" />Return to classic admin</button>
    <button className="aw-signout" onClick={async () => { await signOut(); navigate('/login', { replace: true }) }}><Icon name="logout" />Sign out</button></div>

  return <div className="admin-workspace">
    <a href="#admin-content" className="aw-skip">Skip to content</a>
    <aside className="aw-sidebar" aria-label="Desktop navigation">{brand}{nav()}{footer}</aside>
    {drawer && <dialog id="aw-navigation-drawer" ref={drawerRef} className="aw-drawer" onCancel={() => setDrawer(false)} onClick={event => { if (event.target === drawerRef.current) { const rect = drawerRef.current.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setDrawer(false) } }} aria-label="More workspace pages"><div className="aw-drawer-top"><div><h2>More</h2><p>Your lending tools and workspace</p></div><button className="aw-icon-button" aria-label="Close More" onClick={() => setDrawer(false)}><Icon name="x" /></button></div>{nav(true)}{footer}</dialog>}
    <div className="aw-main">
      <header className="aw-topbar"><div className="aw-breadcrumb"><span className="aw-breadcrumb-root">Workspace</span><span className="aw-breadcrumb-divider">/</span><strong>{page.label}</strong></div>
        <div className="aw-topbar-actions"><WorkspaceSearch open={search} onOpen={openSearch} onClose={closeSearch} /><Link to="/admin/notifications" className="aw-icon-button aw-notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}><Icon name="bell" />{unreadCount > 0 && <i />}</Link><button className="aw-avatar aw-top-avatar" onClick={() => { setSearch(false); setProfile(true) }} aria-label="Open your profile">{me.name?.charAt(0) || 'L'}</button></div>
      </header>
      <main id="admin-content" className="aw-content" tabIndex={-1}>
        {syncError && <div className="aw-sync-error" role="alert"><Icon name="alert" /><span>Some records could not be refreshed. Your current screen is still available.</span><button onClick={refreshData} disabled={refreshing}>{refreshing ? 'Retrying…' : 'Retry'}</button></div>}
        <Suspense fallback={<div className="aw-loading" role="status"><MagneticDots /><span>Loading {page.label.toLowerCase()}…</span></div>}>{children}</Suspense>
      </main>
      <footer className="aw-page-footer"><span>LoanLedger PH · Lender workspace</span><span>{users.filter(user => user.role === 'user').length} borrower accounts</span></footer>
    </div>
    <nav className="aw-bottom-navigation" aria-label="Lender navigation">{mobileNavigation.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => { setSearch(false); setDrawer(false) }} className={({ isActive }) => `aw-bottom-link${isActive ? ' is-active' : ''}`}><span className="aw-bottom-icon"><Icon name={item.icon} />{counts[item.to] > 0 && <span className="aw-bottom-count" aria-label={`${counts[item.to]} ${item.to === '/admin/queue' ? 'pending' : 'unread'}`}>{counts[item.to] > 99 ? '99+' : counts[item.to]}</span>}</span><span>{item.label}</span></NavLink>)}<button type="button" className={`aw-bottom-link${moreActive || drawer ? ' is-active' : ''}`} aria-label="More workspace pages" aria-expanded={drawer} aria-controls={drawer ? 'aw-navigation-drawer' : undefined} onClick={openNavigation}><span className="aw-bottom-icon"><Icon name="menu" />{counts['/admin/loan-requests'] + counts['/admin/notifications'] > 0 && <i className="aw-bottom-dot" />}</span><span>More</span></button></nav>
    <ProfileModal open={profile} onClose={() => setProfile(false)} />
  </div>
}
