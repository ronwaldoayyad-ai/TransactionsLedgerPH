import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import Icon from '../Icon'

const LONG = 140 // chars beyond which we truncate and show "Read more"

function ToastCard({ a, dismiss }) {
  // Auto-dismiss: one-time (auto) toasts after 20s, regular ones after 30s.
  // Manual close is always available.
  useEffect(() => {
    const t = setTimeout(() => dismiss(a), a.oneTime ? 20000 : 30000)
    return () => clearTimeout(t)
  }, [a, dismiss])

  const long = a.body.length > LONG
  const preview = long ? `${a.body.slice(0, LONG).trimEnd()}…` : a.body

  return (
    <div
      role="status"
      aria-live="polite"
      className="announce-in pointer-events-auto w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          {a.title && <p className="text-sm font-bold text-slate-900">{a.title}</p>}
          <p className="mt-0.5 text-sm leading-snug text-slate-600">{preview}</p>
          {long && (
            <Link
              to={`/portal/announcement/${a.id}`}
              className="mt-1.5 inline-block text-sm font-medium text-navy-700 transition-colors hover:text-navy-900 hover:underline"
            >
              Read more
            </Link>
          )}
        </div>
        <button
          onClick={() => dismiss(a)}
          aria-label="Close announcement"
          className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// Fixed stack of toast announcements in the top-right corner.
export default function AnnouncementToasts() {
  const { toasts, dismiss } = useAnnouncements()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex flex-col gap-3">
      {toasts.map((a) => (
        <ToastCard key={a.id} a={a} dismiss={dismiss} />
      ))}
    </div>
  )
}
