import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useMessages } from '../context/MessagesContext'
import Icon from './Icon'
import ProfileModal from './ProfileModal'

// Nav is grouped into labelled sections for visual hierarchy. The first group
// is title-less (a standalone Overview entry); the rest render an uppercase
// caption above a subtly-contained set of links, separated by a faint divider.
const adminNav = [
  { items: [{ to: '/admin', label: 'Overview', icon: 'dashboard', end: true }] },
  {
    title: 'Operations',
    items: [
      { to: '/admin/transactions', label: 'Overall Transactions', icon: 'list' },
      { to: '/admin/payment-logs', label: 'Payment Logs', icon: 'wallet' },
      { to: '/admin/arbitrage', label: 'Interest / Arbitrage', icon: 'chart' },
      { to: '/admin/wallet', label: 'Cards & Bills Wallet', icon: 'wallet' },
    ],
  },
  {
    title: 'Messages',
    items: [{ to: '/admin/messages', label: 'Messages', icon: 'mail' }],
  },
  {
    title: 'Loans',
    items: [
      { to: '/admin/calculator', label: 'Loan Calculator', icon: 'calculator' },
      { to: '/admin/loan-tracker', label: 'Loan Tracker', icon: 'wallet' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/admin/queue', label: 'Verification Queue', icon: 'inbox' },
      { to: '/admin/users', label: 'User Management', icon: 'users' },
      { to: '/admin/logs', label: 'Reports & Logs', icon: 'scroll' },
    ],
  },
]

const userNav = [
  { items: [{ to: '/portal', label: 'My Dashboard', icon: 'dashboard', end: true }] },
  {
    title: 'Messages',
    items: [{ to: '/portal/messages', label: 'Messages', icon: 'mail' }],
  },
  {
    title: 'Transactions',
    items: [
      { to: '/portal/straight', label: 'Straight Transactions', icon: 'wallet' },
      { to: '/portal/consolidated', label: 'Consolidated Transactions', icon: 'list' },
    ],
  },
  {
    title: 'Payments',
    items: [
      { to: '/portal/payments', label: 'My Payments', icon: 'upload' },
      { to: '/portal/payment-logs', label: 'Payment Logs', icon: 'scroll' },
    ],
  },
]

// iOS-style unread count: a small red pill anchored to an icon's top-right, with
// a ring in the sidebar colour so it reads as "punched out" over the icon.
function UnreadBadge({ count, className = '' }) {
  return (
    <span
      aria-label={`${count} unread`}
      className={`pointer-events-none absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-navy-950 ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function AppShell({ children }) {
  const { session, realSession, isViewingAs, stopViewAs, signOut, payments } = useApp()
  const { unreadTotal } = useMessages()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const isAdmin = session.user.role === 'admin'
  // The footer mirrors the effective view, but profile editing always targets
  // the real signed-in account.
  const footerUser = realSession?.user ?? session.user

  const handleStopViewAs = () => {
    stopViewAs()
    navigate('/admin/users')
  }
  const nav = isAdmin ? adminNav : userNav
  const pendingCount = payments.filter((p) => p.status === 'pending').length

  const handleSignOut = () => {
    signOut()
    navigate('/login')
  }

  const renderLink = (item) => {
    const unread = item.to.endsWith('/messages') ? unreadTotal : 0
    const pending = item.icon === 'inbox' ? pendingCount : 0
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={() => setMenuOpen(false)}
        className={({ isActive }) =>
          `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
            isActive
              ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
              : 'text-navy-200 hover:bg-white/5 hover:text-white'
          }`
        }
      >
        {/* iOS-style unread badge: red pill on the icon's top-right corner. */}
        <span className="relative shrink-0">
          <Icon name={item.icon} className="h-5 w-5" />
          {unread > 0 && <UnreadBadge count={unread} />}
        </span>
        {item.label}
        {pending > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-xs font-semibold text-white">
            {pending}
          </span>
        )}
      </NavLink>
    )
  }

  const navItems = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3" aria-label="Main navigation">
      {nav.map((group, gi) => (
        <div
          key={group.title ?? 'overview'}
          className={gi > 0 ? 'mt-3 border-t border-white/[0.06] pt-3' : ''}
        >
          {group.title && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-navy-400">
              {group.title}
            </p>
          )}
          <div className={group.title ? 'flex flex-col gap-1 rounded-xl bg-white/[0.03] p-1' : 'flex flex-col gap-1'}>
            {group.items.map(renderLink)}
          </div>
        </div>
      ))}
    </nav>
  )

  const brand = (
    <div className="flex items-center gap-2.5 px-6 py-5">
      <span className="rounded-lg bg-gold-500 p-1.5 text-white">
        <Icon name="wallet" className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold tracking-wide text-white">LoanLedger PH</p>
        <p className="text-xs text-navy-300">{isAdmin ? 'Command Center' : 'Self-Service Portal'}</p>
      </div>
    </div>
  )

  const userFooter = (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setProfileOpen(true)}
          title="Edit your profile"
          aria-label={`Open profile settings for ${footerUser.name}`}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors duration-200 hover:bg-white/10"
        >
          {footerUser.avatarUrl ? (
            <img
              src={footerUser.avatarUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-white/30 object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-white">
              {footerUser.name.charAt(0)}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{footerUser.name}</span>
            <span className="block truncate text-xs text-navy-300">
              {footerUser.role === 'admin' ? 'Administrator' : 'Borrower'} · View profile
            </span>
          </span>
        </button>
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="cursor-pointer rounded-lg p-2 text-navy-300 transition-colors duration-200 hover:bg-white/10 hover:text-white"
        >
          <Icon name="logout" className="h-5 w-5" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/5 bg-navy-950/90 backdrop-blur-xl lg:flex">
        {brand}
        {navItems}
        {userFooter}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-gold-500 p-1 text-white">
            <Icon name="wallet" className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold text-white">LoanLedger PH</span>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={unreadTotal > 0 ? `Toggle navigation menu, ${unreadTotal} unread` : 'Toggle navigation menu'}
          aria-expanded={menuOpen}
          className="relative cursor-pointer rounded-lg p-2 text-white transition-colors duration-200 hover:bg-white/10"
        >
          <Icon name={menuOpen ? 'x' : 'menu'} className="h-6 w-6" />
          {!menuOpen && unreadTotal > 0 && <UnreadBadge count={unreadTotal} />}
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-x-0 top-12 z-20 flex flex-col gap-2 bg-navy-950 pb-4 pt-2 shadow-lg lg:hidden">
          {navItems}
          {userFooter}
        </div>
      )}

      <main className="flex-1 lg:ml-64">
        {isViewingAs && (
          <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/70 bg-amber-50/80 px-4 py-2.5 backdrop-blur-xl sm:px-6 lg:px-8">
            <p className="flex items-center gap-2 text-sm text-amber-900">
              <Icon name="eye" className="h-4 w-4 shrink-0" />
              <span>
                Viewing as <span className="font-semibold">{session.user.name}</span> — exactly what
                this borrower sees. You are still signed in as{' '}
                <span className="font-semibold">{realSession.user.name}</span>.
              </span>
            </p>
            <button
              onClick={handleStopViewAs}
              className="min-h-9 cursor-pointer rounded-lg bg-amber-900 px-3 py-1.5 text-sm font-medium text-white transition-[transform,background-color] duration-150 ease-out hover:bg-amber-800 active:scale-[0.97]"
            >
              Return to Admin view
            </button>
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
