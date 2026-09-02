// Shared constants + helpers for the mobile Notification Center. Mirrors the web
// lib/notifications.js (categories, attachment helpers, reply quote), adapted to
// NativeWind class tokens instead of web ring/tone classes.

export type NotifCategory = {
  value: string
  label: string
  iconKey: 'wallet' | 'file' | 'users' | 'alert'
  bg: string // View classes (background + border)
  text: string // Text colour class
}

export const NOTIFICATION_CATEGORIES: NotifCategory[] = [
  { value: 'payment', label: 'Payment', iconKey: 'wallet', bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700' },
  { value: 'document', label: 'Document', iconKey: 'file', bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-700' },
  { value: 'account', label: 'Account', iconKey: 'users', bg: 'bg-violet-50 border border-violet-200', text: 'text-violet-700' },
  { value: 'general', label: 'General', iconKey: 'alert', bg: 'bg-slate-100 border border-slate-200', text: 'text-slate-700' },
]

export const categoryMeta = (value: string): NotifCategory =>
  NOTIFICATION_CATEGORIES.find((c) => c.value === value) ?? NOTIFICATION_CATEGORIES[3]

export const isImageAttachment = (a: any) => String(a?.type || '').startsWith('image/')

export function formatBytes(n: number) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// Relative time ("3d ago"), falling back to a date for older items.
export function relTime(iso?: string | null) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Plain-text quote of a notification, prepended to a borrower's reply so the
// admin sees exactly what is being replied to inside the Messages thread.
export function buildReplyQuote(n: any) {
  if (!n) return ''
  const cat = categoryMeta(n.category).label
  const header = `↳ Reply to notification [${cat}]${n.title ? ` · ${n.title}` : ''}`
  const lines = [header]
  String(n.body || '')
    .split('\n')
    .forEach((l) => lines.push(`> ${l}`))
  if (n.attachments?.length) {
    lines.push(`> (${n.attachments.length} attachment${n.attachments.length === 1 ? '' : 's'})`)
  }
  lines.push('')
  return lines.join('\n')
}
