// Shared constants + helpers for the Notification Center (admin → borrower
// notifications with categories, attachments, per-borrower read state, and
// replies that flow into the existing Messages thread).

// The category set an admin assigns and a borrower filters by. `icon` is a name
// from components/Icon.jsx; `tone` styles the category chip.
export const NOTIFICATION_CATEGORIES = [
  { value: 'payment', label: 'Payment', icon: 'wallet', tone: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  { value: 'document', label: 'Document', icon: 'file', tone: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  { value: 'account', label: 'Account', icon: 'users', tone: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  { value: 'general', label: 'General', icon: 'alert', tone: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
]

export const categoryMeta = (value) =>
  NOTIFICATION_CATEGORIES.find((c) => c.value === value) ?? NOTIFICATION_CATEGORIES[3]

// Attachments are embedded as data URLs — the same approach the payment-proof
// and invoice features use, so no storage bucket is required. Capped so a demo
// row / notifications row stays a sane size.
export const ATTACHMENT_ACCEPT = 'image/*,application/pdf'
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024 // 5 MB each
export const MAX_ATTACHMENTS = 5

export const isImageAttachment = (a) => String(a?.type || '').startsWith('image/')

export function formatBytes(n) {
  const b = Number(n) || 0
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

// Read a picked File into the stored attachment shape. Rejects oversized files
// and unsupported types so the composer can surface a clear error.
export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    const type = file.type || ''
    if (!(type.startsWith('image/') || type === 'application/pdf')) {
      reject(new Error(`${file.name}: only images and PDFs are allowed`))
      return
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`${file.name}: exceeds ${formatBytes(MAX_ATTACHMENT_BYTES)}`))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`${file.name}: could not be read`))
    reader.onload = () =>
      resolve({ name: file.name, type, size: file.size, dataUrl: String(reader.result) })
    reader.readAsDataURL(file)
  })
}

// A plain-text quote of a notification, prepended to a borrower's reply so the
// admin sees exactly what is being replied to inside the Messages thread.
export function buildReplyQuote(n) {
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
  lines.push('') // blank line separating the quote from the borrower's own text
  return lines.join('\n')
}
