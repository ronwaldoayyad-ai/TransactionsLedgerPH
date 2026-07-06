import { STATUS_LABEL } from '../../lib/loanRequest'

// Self-contained status pill for loan requests (its own palette so it doesn't
// depend on the transaction Badge's fixed status keys).
const tones = {
  submitted: 'bg-slate-100 text-slate-600 border-slate-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  coordinating: 'bg-blue-50 text-blue-700 border-blue-200',
  bank_approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  transfer: 'bg-violet-50 text-violet-700 border-violet-200',
  completed: 'bg-emerald-600 text-white border-emerald-600',
  declined: 'bg-red-50 text-red-700 border-red-200',
  canceled: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function StatusBadge({ status, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        tones[status] ?? tones.submitted
      } ${className}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}
