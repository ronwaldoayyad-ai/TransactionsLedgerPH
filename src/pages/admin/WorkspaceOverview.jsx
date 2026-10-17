import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../context/AppContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { useMessages } from '../../context/MessagesContext'
import Icon from '../../components/Icon'
import { MagneticDots } from '../../components/ProcessingFeedback'
import { borrowerReference } from '../../components/admin/workspaceNavigation'
import { formatDate, formatPeso } from '../../lib/amortization'
import { effectiveStatus, isReceivable } from '../../lib/transactions'

const amountOf = rows => rows.reduce((total, row) => total + Number(row.amount || 0), 0)
const dateAtManila = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const dateLabel = value => value ? formatDate(String(value).slice(0, 10)) : 'Date unavailable'

function Metric({ title, value, description, icon, tone, to }) {
  return <Link className={`aw-metric ${tone || ''}`} to={to}><div className="aw-metric-heading"><span>{title}</span><span className="aw-metric-icon"><Icon name={icon} /></span></div><strong>{value}</strong><p>{description}<Icon name="arrowRight" /></p></Link>
}

function PanelHeading({ title, subtitle, to, action = 'View all' }) {
  return <div className="aw-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{to && <Link className="aw-text-link" to={to}>{action}<Icon name="arrowRight" /></Link>}</div>
}

function Empty({ icon = 'check', title, text }) {
  return <div className="aw-empty"><span className="aw-empty-icon"><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p></div>
}

function CollectionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="aw-chart-tooltip"><strong>{label}</strong>{payload.map(item => <p key={item.dataKey}><span style={{ color: item.color }}>●</span> {item.name}<b>{formatPeso(item.value)}</b></p>)}</div>
}

function buildOverviewModel({ transactions, payments, requests, users, today, currentMonth, months }) {
    const open = transactions.filter(transaction => isReceivable(transaction, today))
    const overdue = open.filter(transaction => effectiveStatus(transaction, today) === 'past_due')
    const received = transactions.filter(transaction => transaction.status === 'paid' && transaction.datePaid?.startsWith(currentMonth))
    const pending = payments.filter(payment => payment.status === 'pending' && !payment.retractedAt).sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    const pendingRequests = requests.filter(request => request.status === 'pending')
    const borrowerMap = new Map(users.map(user => [user.id, user]))
    const dues = new Map()
    open.forEach(transaction => {
      if (!transaction.dueDate) return
      const key = `${transaction.userId}:${transaction.dueDate}`
      const row = dues.get(key) || { userId: transaction.userId, dueDate: transaction.dueDate, amount: 0, overdue: false }
      row.amount += Number(transaction.amount || 0)
      row.overdue ||= effectiveStatus(transaction, today) === 'past_due'
      dues.set(key, row)
    })
    const scheduled = [...dues.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount)
    const active = users.filter(user => user.role === 'user' && user.status === 'active').length
    const monthsData = Array.from({ length: months }, (_, index) => {
      const date = new Date(`${currentMonth}-01T12:00:00Z`)
      date.setUTCMonth(date.getUTCMonth() - (months - index - 1))
      const key = date.toISOString().slice(0, 7)
      return { key, month: date.toLocaleDateString('en-PH', { month: 'short', year: '2-digit', timeZone: 'Asia/Manila' }), scheduled: 0, collected: 0 }
    })
    const monthMap = new Map(monthsData.map(month => [month.key, month]))
    transactions.forEach(transaction => {
      if (!['cancelled', 'refunded'].includes(transaction.status)) {
        const due = monthMap.get(transaction.dueDate?.slice(0, 7))
        if (due) due.scheduled += Number(transaction.amount || 0)
      }
      if (transaction.status === 'paid') {
        const paid = monthMap.get(transaction.datePaid?.slice(0, 7))
        if (paid) paid.collected += Number(transaction.amount || 0)
      }
    })
    return { open, overdue, received, pending, pendingRequests, borrowerMap, scheduled, active, monthsData }
}

export default function WorkspaceOverview() {
  const { session, users, payments, transactions, auditLog, refreshing, refreshData, syncError } = useApp()
  const { requests = [] } = useLoanRequests()
  const { unreadTotal } = useMessages()
  const [months, setMonths] = useState(6)
  const now = new Date()
  const today = dateAtManila(now)
  const currentMonth = today.slice(0, 7)
  const model = buildOverviewModel({ transactions, payments, requests, users, today, currentMonth, months })

  const date = now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
  const firstName = session.user.nickname || session.user.name?.split(' ')[0] || 'there'
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Manila' }).format(now))
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const workCount = model.pending.length + model.pendingRequests.length + unreadTotal
  // AppContext delivers the audit log newest first.
  const recent = auditLog.slice(0, 5)

  return <div className="aw-overview">
    <section className="aw-overview-header"><div><p className="aw-eyebrow">{date}</p><h1>{greeting}, {firstName}<span className="aw-greeting-dot">.</span></h1><p>Here’s what’s happening across your borrower accounts.</p></div><div className="aw-header-buttons"><button className="aw-button aw-button-secondary" onClick={refreshData} disabled={refreshing}><Icon name="refresh" className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Refreshing…' : 'Refresh records'}</button><Link className="aw-button aw-button-primary" to="/admin/calculator"><Icon name="plus" />New loan disclosure</Link></div></section>
    {refreshing && <p className="aw-refresh-feedback" role="status"><MagneticDots />Refreshing account records…</p>}
    <section className="aw-metrics" aria-label="Portfolio summary">
      <Metric title="Outstanding balance" value={formatPeso(amountOf(model.open))} description={`${model.open.length} open ledger entries`} icon="wallet" to="/admin/transactions" tone="aw-metric-primary" />
      <Metric title="Collected this month" value={formatPeso(amountOf(model.received))} description="Confirmed paid ledger entries" icon="trendingUp" to="/admin/payment-logs" />
      <Metric title="Past due" value={formatPeso(amountOf(model.overdue))} description={`${new Set(model.overdue.map(row => row.userId)).size} borrower account${new Set(model.overdue.map(row => row.userId)).size === 1 ? '' : 's'}`} icon="clock" to="/admin/payment-due" tone="aw-metric-warning" />
      <Metric title="Active borrowers" value={model.active.toLocaleString('en-PH')} description={`${users.filter(user => user.role === 'user').length} total borrower accounts`} icon="users" to="/admin/users" />
    </section>
    <section className="aw-attention" aria-label="Items needing attention"><div className="aw-attention-label"><span className="aw-attention-icon"><Icon name="inbox" /></span><div><h2>Needs your attention</h2><p>{workCount ? `${workCount} pending or unread items` : 'You’re all caught up'}</p></div></div><div className="aw-attention-links"><Link to="/admin/queue"><strong>{model.pending.length}</strong><span>Payment proofs</span><Icon name="arrowRight" /></Link><Link to="/admin/loan-requests"><strong>{model.pendingRequests.length}</strong><span>Loan requests</span><Icon name="arrowRight" /></Link><Link to="/admin/messages"><strong>{unreadTotal}</strong><span>Unread messages</span><Icon name="arrowRight" /></Link></div></section>
    <div className="aw-overview-grid">
      <section className="aw-panel aw-chart-panel"><div className="aw-panel-heading"><div><h2>Collections overview</h2><p>Scheduled dues and confirmed collections</p></div><label className="aw-period"><span className="sr-only">Chart period</span><select value={months} onChange={event => setMonths(Number(event.target.value))}><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></label></div><div className="aw-chart-legend"><span><i className="aw-legend-scheduled" />Scheduled</span><span><i className="aw-legend-collected" />Collected</span></div>
        {model.monthsData.some(month => month.scheduled || month.collected) ? <div className="aw-collection-chart" role="img" aria-label={`Scheduled and collected amounts for the last ${months} months. Full amounts follow in the chart data table.`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={model.monthsData} margin={{ top: 18, right: 18, bottom: 0, left: 0 }}><defs><linearGradient id="aw-collected-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2463eb" stopOpacity={0.16} /><stop offset="100%" stopColor="#2463eb" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9edf4" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={25} tickMargin={12} /><YAxis axisLine={false} tickLine={false} width={65} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={value => `₱${new Intl.NumberFormat('en', { notation: 'compact' }).format(value)}`} /><Tooltip content={<CollectionTooltip />} /><Area type="monotone" dataKey="scheduled" name="Scheduled" stroke="#a0b2d2" strokeWidth={2} strokeDasharray="5 5" fill="transparent" isAnimationActive={false} /><Area type="monotone" dataKey="collected" name="Collected" stroke="#2463eb" strokeWidth={2.5} fill="url(#aw-collected-fill)" isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <Empty icon="chart" title="Your collections will appear here" text="Add a loan or transaction to start your portfolio history." />}
        <details className="aw-chart-data"><summary>View chart data</summary><div className="aw-table-scroll"><table><caption className="sr-only">Monthly collections in Philippine pesos</caption><thead><tr><th>Month</th><th>Scheduled</th><th>Collected</th></tr></thead><tbody>{model.monthsData.map(month => <tr key={month.key}><th scope="row">{month.month}</th><td>{formatPeso(month.scheduled)}</td><td>{formatPeso(month.collected)}</td></tr>)}</tbody></table></div></details>
        <div className="aw-panel-footer"><span>Figures follow the shared transaction ledger.</span><Link className="aw-text-link" to="/admin/logs">Open reports<Icon name="arrowRight" /></Link></div>
      </section>
      <section className="aw-panel"><PanelHeading title="Payment proofs" subtitle="Waiting for your review" to="/admin/queue" />{!model.pending.length ? <Empty title="No proofs waiting" text="New borrower submissions will appear here." /> : <div className="aw-proof-list">{model.pending.slice(0, 4).map(payment => {
        const borrower = model.borrowerMap.get(payment.userId)
        return <Link className="aw-proof-row" to={`/admin/queue?proof=${encodeURIComponent(payment.id)}`} key={payment.id}><span className="aw-avatar">{borrower?.name?.charAt(0) || '?'}</span><div className="aw-proof-content"><div><strong>{borrower?.name || 'Borrower account'}</strong><b>{formatPeso(payment.amount)}</b></div><p>{payment.method || 'Payment proof'} · {dateLabel(payment.submittedAt)}</p><span className="aw-status aw-status-pending">Pending review</span></div><Icon name="arrowRight" /></Link>
      })}</div>}<div className="aw-panel-footer"><span>Review the proof and allocation.</span><Link className="aw-text-link" to="/admin/queue">Open queue<Icon name="arrowRight" /></Link></div></section>
      <section className="aw-panel"><PanelHeading title="Collection schedule" subtitle="Oldest open dues first" to="/admin/payment-due" />{!model.scheduled.length ? <Empty icon="clock" title="No outstanding dues" text="Scheduled payments will appear as loans are assigned." /> : <div className="aw-table-scroll"><table className="aw-dues-table"><thead><tr><th scope="col">Borrower</th><th scope="col">Due date</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>{model.scheduled.slice(0, 5).map(row => {
        const borrower = model.borrowerMap.get(row.userId)
        return <tr key={`${row.userId}:${row.dueDate}`}><td><Link to={`/admin/users?q=${encodeURIComponent(borrower?.accountNumber || borrower?.email || borrower?.name || '')}`}><strong>{borrower?.name || 'Borrower account'}</strong><small>{borrowerReference(borrower)}</small></Link></td><td>{dateLabel(row.dueDate)}</td><td className="aw-numeric">{formatPeso(row.amount)}</td><td><span className={`aw-status ${row.overdue ? 'aw-status-overdue' : row.dueDate === today ? 'aw-status-pending' : 'aw-status-upcoming'}`}>{row.overdue ? 'Past due' : row.dueDate === today ? 'Due today' : 'Upcoming'}</span></td></tr>
      })}</tbody></table></div>}<div className="aw-panel-footer"><span>{model.scheduled.length} borrower / due-date groups</span><Link className="aw-text-link" to="/admin/portfolio">Portfolio detail<Icon name="arrowRight" /></Link></div></section>
      <section className="aw-panel"><PanelHeading title="Recent activity" subtitle="Latest recorded account actions" to="/admin/logs" />{!recent.length ? <Empty icon="scroll" title="No activity yet" text="Account and payment activity will appear as it is recorded." /> : <ol className="aw-activity">{recent.map((event, index) => <li key={event.id || index}><span className="aw-activity-dot" /><div><strong>{String(event.action || 'Account updated').toLowerCase().replaceAll('_', ' ')}</strong><p>{event.detail || event.details || event.subject || 'An account action was recorded.'}</p><small>{event.at || event.createdAt || event.timestamp || 'Recorded activity'}</small></div></li>)}</ol>}</section>
    </div>
    {!syncError && <p className="aw-overview-note"><Icon name="shield" />Borrower and lender views use the same saved account records.</p>}
  </div>
}
