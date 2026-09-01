import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useNotifications } from '../../context/NotificationsContext'
import { useDisbursements } from '../../context/DisbursementsContext'
import { useAcceptDisbursement } from '../../hooks/useAcceptDisbursement'
import { useMessages } from '../../context/MessagesContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Button, Card, EmptyState } from '../../components/ui'
import { formatManilaDateTime } from '../../lib/amortization'
import {
  NOTIFICATION_CATEGORIES,
  categoryMeta,
  isImageAttachment,
  formatBytes,
  buildReplyQuote,
} from '../../lib/notifications'
import { QUICK_REACTIONS } from '../../components/messaging/emoji'

// Compact relative time ("3d ago"), falling back to a date for older items.
function relTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CategoryChip({ category }) {
  const m = categoryMeta(category)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.tone}`}>
      <Icon name={m.icon} className="h-3 w-3" />
      {m.label}
    </span>
  )
}

function AttachmentList({ attachments }) {
  if (!attachments?.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((a, i) =>
        isImageAttachment(a) ? (
          <a
            key={i}
            href={a.dataUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${a.name}`}
            className="block overflow-hidden rounded-lg border border-slate-200 transition-shadow hover:shadow-md"
          >
            <img src={a.dataUrl} alt={a.name} className="h-24 w-32 object-cover" />
          </a>
        ) : (
          <a
            key={i}
            href={a.dataUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={a.name}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-navy-700 transition-colors hover:bg-navy-50"
          >
            <Icon name="file" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 max-w-[12rem] truncate font-medium">{a.name}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatBytes(a.size)}</span>
          </a>
        ),
      )}
    </div>
  )
}

function FilterChip({ value, label, count, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'border-navy-300 bg-navy-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-xs font-semibold ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function NotificationRow({ n, read, onMarkRead, onMarkUnread, onReply, onReact, disbursement, onAccept }) {
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptErr, setAcceptErr] = useState('')
  const [reacted, setReacted] = useState(null) // emoji the borrower picked
  const [reacting, setReacting] = useState(false)
  const replyRef = useRef(null)
  const attachRef = useRef(null)
  const hasAttachments = (n.attachments?.length ?? 0) > 0

  // Accept the linked disbursement agreement inline. Two-step (confirm) because
  // acceptance is binding and notifies the admin; once accepted it locks.
  const accept = async () => {
    setAccepting(true)
    setAcceptErr('')
    const { error } = await onAccept(disbursement)
    setAccepting(false)
    if (error) setAcceptErr(error)
    else setConfirming(false)
  }

  const expand = () => {
    const next = !open
    setOpen(next)
    if (next && !read) onMarkRead(n.id) // opening a notification marks it read
  }

  // The visible Reply button opens the card (marking it read) and focuses the
  // reply box, resetting the "sent" state so the composer is ready again.
  const openReply = () => {
    setOpen(true)
    setSent(false)
    if (!read) onMarkRead(n.id)
    setTimeout(() => replyRef.current?.focus(), 0)
  }

  // The visible View-attachment button opens the card and scrolls to the files.
  const openAttachments = () => {
    setOpen(true)
    if (!read) onMarkRead(n.id)
    setTimeout(() => attachRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0)
  }

  const send = async () => {
    const text = reply.trim()
    if (!text) return
    setSending(true)
    await onReply(n, text)
    setSending(false)
    setReply('')
    setSent(true)
    if (!read) onMarkRead(n.id)
  }

  // React to the lender's notification — notifies the admin (raises their badge).
  const react = async (emoji) => {
    if (reacting) return
    setReacting(true)
    const res = await onReact(n, emoji)
    setReacting(false)
    if (!res?.error) {
      setReacted(emoji)
      if (!read) onMarkRead(n.id)
    }
  }

  return (
    <li
      className={`px-4 py-3.5 transition-colors sm:px-5 ${
        read ? '' : 'border-l-4 border-navy-500 bg-navy-50/40'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <span className="mt-1.5 flex h-2.5 w-2.5 shrink-0 items-center justify-center">
          {!read && <span className="h-2.5 w-2.5 rounded-full bg-navy-500" aria-label="Unread" />}
        </span>

        <button onClick={expand} className="min-w-0 flex-1 cursor-pointer text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={n.category} />
            {n.title && (
              <span className={`text-sm ${read ? 'font-medium text-slate-800' : 'font-bold text-slate-900'}`}>
                {n.title}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-slate-400">{relTime(n.createdAt)}</span>
          </div>
          <p className={`mt-1 whitespace-pre-wrap text-sm text-slate-600 ${open ? '' : 'line-clamp-2'}`}>
            {n.body}
          </p>
          {/* Complete date + time in Philippine time, on every notification. */}
          {n.createdAt && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
              <Icon name="clock" className="h-3 w-3 shrink-0" />
              {formatManilaDateTime(n.createdAt)}
            </p>
          )}
        </button>

        {/* Read/unread toggle */}
        <button
          onClick={() => (read ? onMarkUnread(n.id) : onMarkRead(n.id))}
          title={read ? 'Mark as unread' : 'Mark as read'}
          aria-label={read ? 'Mark as unread' : 'Mark as read'}
          className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-navy-50 hover:text-navy-800"
        >
          <Icon name={read ? 'eyeOff' : 'check'} className="h-4 w-4" />
        </button>
      </div>

      {/* Always-visible actions: Reply, and View attachment(s) when present. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
        <button
          onClick={openReply}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-navy-200 bg-navy-50 px-3 py-1.5 text-sm font-medium text-navy-800 transition-colors hover:bg-navy-100"
        >
          <Icon name="mail" className="h-4 w-4" />
          Reply
        </button>
        {hasAttachments && (
          <button
            onClick={openAttachments}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Icon name="file" className="h-4 w-4" />
            View attachment{n.attachments.length === 1 ? '' : `s (${n.attachments.length})`}
          </button>
        )}

        {/* Accept the loan-disbursement agreement, right from the notification. */}
        {disbursement &&
          (disbursement.acknowledgedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <Icon name="check" className="h-4 w-4" />
              Agreement accepted
            </span>
          ) : confirming ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Accept this disbursement agreement?</span>
              <button
                onClick={accept}
                disabled={accepting}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <Icon name="check" className="h-4 w-4" />
                {accepting ? 'Accepting…' : 'Yes, accept'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={accepting}
                className="cursor-pointer rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => {
                setConfirming(true)
                setAcceptErr('')
                if (!read) onMarkRead(n.id)
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Icon name="check" className="h-4 w-4" />
              Accept agreement
            </button>
          ))}
      </div>

      {/* Quick reactions — sending one notifies your lender (raises their badge). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            disabled={reacting}
            aria-label={`React ${emoji}`}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-base leading-none transition-colors disabled:opacity-60 ${
              reacted === emoji ? 'border-navy-300 bg-navy-50' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            {emoji}
          </button>
        ))}
        {reacted && (
          <span className="text-xs font-medium text-emerald-700">Sent {reacted} to your lender</span>
        )}
      </div>
      {acceptErr && <p className="mt-1.5 pl-6 text-xs font-medium text-red-600">{acceptErr}</p>}

      {open && (
        <div className="mt-3 pl-6">
          <div ref={attachRef}>
            <AttachmentList attachments={n.attachments} />
          </div>

          {/* Inline reply — posts a quoted copy into the Messages thread. */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Icon name="mail" className="h-3.5 w-3.5" />
              Reply to your lender
            </p>
            {sent ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-emerald-700">
                <Icon name="check" className="h-4 w-4" />
                Reply sent.
                <Link to="/portal/messages" className="font-medium text-navy-700 underline-offset-2 hover:underline">
                  View in Messages
                </Link>
                <button
                  onClick={() => setSent(false)}
                  className="cursor-pointer font-medium text-slate-500 hover:text-slate-700"
                >
                  Reply again
                </button>
              </p>
            ) : (
              <>
                <textarea
                  ref={replyRef}
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type your reply…"
                  className="block w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100"
                />
                <p className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">The original notification is quoted with your reply.</span>
                  <Button variant="primary" onClick={send} disabled={!reply.trim() || sending}>
                    <Icon name="send" className="h-4 w-4" />
                    {sending ? 'Sending…' : 'Send reply'}
                  </Button>
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function UserNotifications() {
  const { session } = useApp()
  const meId = session.user.id
  const { notifications, isRead, markRead, markUnread, unreadCount, notifyAdmins } = useNotifications()
  const { disbursements } = useDisbursements()
  const acceptDisbursement = useAcceptDisbursement()
  const { sendMessage } = useMessages()

  const [filter, setFilter] = useState('all') // 'all' | category value | 'unread'

  // A "Loan Disbursement Ready" notification references its disbursement by
  // number (in the title/body/attachment name). Match it against the borrower's
  // own disbursements so the row can offer an inline Accept action, and so the
  // button reflects the live acknowledged state.
  const linkedDisbursement = useMemo(() => {
    return (n) => {
      if (!disbursements.length) return null
      const hay = `${n.title} ${n.body} ${(n.attachments || []).map((a) => a.name).join(' ')}`
      return disbursements.find((d) => d.disbursementNumber && hay.includes(d.disbursementNumber)) || null
    }
  }, [disbursements])

  const onAccept = (d) => acceptDisbursement(d)

  // Categories that actually appear, so the filter bar only shows usable chips.
  const presentCategories = useMemo(() => {
    const set = new Set(notifications.map((n) => n.category))
    return NOTIFICATION_CATEGORIES.filter((c) => set.has(c.value))
  }, [notifications])

  const visible = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter((n) => !isRead(n.id))
    return notifications.filter((n) => n.category === filter)
  }, [notifications, filter, isRead])

  // Reply posts a quoted copy into the Messages thread AND raises a notification
  // to the admin so they see it in their Inbox (with a badge), not just Messages.
  const onReply = async (n, text) => {
    await sendMessage(meId, buildReplyQuote(n) + text)
    await notifyAdmins({
      category: n.category,
      title: n.title ? `Reply: ${n.title}` : 'Reply from borrower',
      body: `${buildReplyQuote(n)}${text}`,
    })
  }

  // React notifies the admin (raises their unread badge in the Inbox).
  const onReact = (n, emoji) =>
    notifyAdmins({
      category: n.category,
      title: `Reacted ${emoji}`,
      body: `${emoji} — reacted to your notification${n.title ? ` “${n.title}”` : ''}.`,
    })

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={
          unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}.`
            : 'You are all caught up.'
        }
        action={<RefreshButton />}
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip value="all" label="All" count={notifications.length} active={filter === 'all'} onSelect={setFilter} />
        <FilterChip value="unread" label="Unread" count={unreadCount} active={filter === 'unread'} onSelect={setFilter} />
        {presentCategories.map((c) => (
          <FilterChip
            key={c.value}
            value={c.value}
            label={c.label}
            count={notifications.filter((n) => n.category === c.value).length}
            active={filter === c.value}
            onSelect={setFilter}
          />
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        {visible.length === 0 ? (
          <EmptyState
            icon="bell"
            title={filter === 'all' ? 'No notifications yet' : 'Nothing here'}
            body={
              filter === 'all'
                ? 'Notifications from your lender will appear here.'
                : 'No notifications match this filter.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((n) => (
              <NotificationRow
                key={n.id}
                n={n}
                read={isRead(n.id)}
                onMarkRead={markRead}
                onMarkUnread={markUnread}
                onReply={onReply}
                onReact={onReact}
                disbursement={linkedDisbursement(n)}
                onAccept={onAccept}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
