import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { formatAmount, parseAmount } from '../lib/amortization'

const badgeStyles = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  invited: 'bg-sky-50 text-sky-700 border-sky-200',
  disabled: 'bg-slate-100 text-slate-500 border-slate-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  upcoming: 'bg-slate-50 text-slate-500 border-slate-200',
  due: 'bg-amber-50 text-amber-700 border-amber-200',
  unpaid: 'bg-amber-50 text-amber-700 border-amber-200',
  refunded: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-teal-50 text-teal-700 border-teal-200',
  past_due: 'bg-red-50 text-red-700 border-red-200',
}

const badgeDots = {
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-red-500',
  active: 'bg-emerald-500',
  invited: 'bg-sky-500',
  disabled: 'bg-slate-400',
  paid: 'bg-emerald-500',
  upcoming: 'bg-slate-300',
  due: 'bg-amber-500',
  unpaid: 'bg-amber-500',
  refunded: 'bg-blue-500',
  cancelled: 'bg-teal-500',
  past_due: 'bg-red-500',
}

export function Badge({ status, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${badgeStyles[status] ?? badgeStyles.upcoming}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${badgeDots[status] ?? badgeDots.upcoming}`} />
      {children ?? status}
    </span>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-xl border border-white/60 bg-white/80 shadow-sm backdrop-blur-xl ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function StatCard({ icon, label, value, hint, accent = 'text-navy-800 bg-navy-50' }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-1.5 truncate font-mono text-2xl font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        <span className={`shrink-0 rounded-lg p-2.5 ${accent}`}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
    </Card>
  )
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }) {
  const variants = {
    primary:
      'bg-navy-800 text-white hover:bg-navy-700 focus-visible:outline-navy-800 disabled:bg-slate-300',
    gold: 'bg-gold-500 text-white hover:bg-gold-600 focus-visible:outline-gold-600 disabled:bg-slate-300',
    secondary:
      'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-navy-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  }
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, htmlFor, children, hint }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export const inputClass =
  'w-full min-h-10 rounded-lg border border-slate-300/80 bg-white/70 px-3 py-2 text-sm text-slate-900 backdrop-blur-sm placeholder:text-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20 disabled:bg-slate-100/60 disabled:text-slate-500'

// Modern iOS-style toggle. Knob slides with a transform (GPU, 200ms ease-out).
export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800 ${
        checked ? 'bg-navy-800' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-out ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// Amount input: accepts free typing of digits/commas/decimal point, reports
// the numeric value via onValueChange (null when cleared), and re-formats to
// 2 decimals with comma separators on blur (e.g. 1,500.00).
export function CurrencyInput({ value, onValueChange, allowNegative = false, className = '', ...props }) {
  const [text, setText] = useState(formatAmount(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(formatAmount(value))
  }, [value])

  // Magnitude only — sign is handled separately so a "-" typed anywhere in the
  // field (not just position 0) is honored. allowNegative permits the sign at
  // all, e.g. straight-transaction overpayments that reduce the total due.
  const magnitude = /^[\d,]*\.?\d{0,2}$/

  return (
    <input
      type="text"
      inputMode={allowNegative ? 'text' : 'decimal'}
      value={text}
      onFocus={() => {
        focusedRef.current = true
      }}
      onChange={(e) => {
        let raw = e.target.value
        // Treat any "-" present as a negative sign regardless of caret position.
        const negative = allowNegative && raw.includes('-')
        if (negative) raw = raw.replaceAll('-', '')
        if (!magnitude.test(raw)) return
        const next = negative ? `-${raw}` : raw
        setText(next)
        onValueChange(parseAmount(next))
      }}
      onBlur={() => {
        focusedRef.current = false
        setText(formatAmount(value))
      }}
      className={`${inputClass} font-mono ${className}`}
      {...props}
    />
  )
}

// Multi-select filter dropdown: checkbox options, empty selection = "All".
export function MultiSelect({ label, options, selected, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = () => {
      setOpen(false)
      setSearch('')
    }
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleToggleOpen = () => {
    setOpen((v) => !v)
    if (open) setSearch('')
  }

  const toggle = (value) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  const summary = selected.size === 0 ? `All` : `${selected.size} selected`
  const q = search.trim().toLowerCase()
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleToggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        className={`${inputClass} flex cursor-pointer items-center justify-between gap-2 text-left ${
          selected.size > 0 ? '!border-navy-400 !bg-navy-50/50' : ''
        }`}
      >
        <span className={`truncate ${selected.size === 0 ? 'text-slate-500' : 'font-medium text-navy-900'}`}>
          {summary}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          className="modal-pop absolute z-30 mt-1 w-full min-w-[13rem] rounded-lg border border-white/60 bg-white/95 p-1 shadow-lg backdrop-blur-xl"
        >
          {/* Type to filter — the option list can be long (dates, statuses). */}
          <div className="p-1">
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
              className={`${inputClass} !min-h-8 !py-1 !text-xs`}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs font-medium text-navy-700 transition-colors duration-150 hover:bg-navy-50"
              >
                Clear selection ({selected.size})
              </button>
            )}
            {shown.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {options.length === 0 && <p className="px-2 py-1.5 text-xs text-slate-400">No options</p>}
            {options.length > 0 && shown.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-slate-400">No matches for “{search}”</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        className="backdrop-fade absolute inset-0 cursor-default bg-navy-950/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal-pop relative w-full max-w-lg rounded-xl border border-white/60 bg-white/85 shadow-xl backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, body }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="rounded-full bg-slate-100 p-3 text-slate-400">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
    </div>
  )
}
