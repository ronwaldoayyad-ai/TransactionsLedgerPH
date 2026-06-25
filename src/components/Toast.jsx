import Icon from './Icon'

// Presentational toast card with an auto-dismiss countdown bar. The parent owns
// the dismiss timer (so it can match `duration`); the bar here is the visual
// countdown — it shrinks left-to-right over `duration` then the parent unmounts.
const VARIANTS = {
  success: {
    surface: 'bg-[linear-gradient(135deg,#166534_0%,#15803d_50%,#16a34a_100%)] shadow-[0_12px_35px_rgba(34,197,94,0.35)]',
    bar: 'bg-[#7ed49e]',
    icon: 'check',
  },
  error: {
    surface: 'bg-[linear-gradient(135deg,#991b1b_0%,#b91c1c_50%,#dc2626_100%)] shadow-[0_12px_35px_rgba(220,38,38,0.35)]',
    bar: 'bg-[#fca5a5]',
    icon: 'x',
  },
}

export default function Toast({ open, variant = 'success', title, message, onClose, duration = 4500 }) {
  if (!open) return null
  const v = VARIANTS[variant] ?? VARIANTS.success

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:justify-end">
      <div
        role="status"
        aria-live="polite"
        className={`toast-in pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl px-5 py-4 text-white ${v.surface}`}
      >
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
            <Icon name={v.icon} className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="mt-0.5 text-sm leading-snug text-white/85">{message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <span
          className={`toast-progress absolute inset-x-0 bottom-0 h-1 ${v.bar}`}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  )
}
