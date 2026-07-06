import { STATUS_LABEL } from '../../lib/loanRequest'

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''

// Vertical status timeline shared by the borrower detail view and the admin
// "View History" panel. Newest event on top.
export default function HistoryTimeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-slate-500">No history yet.</p>
  }
  const ordered = [...events].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return (
    <ol className="relative space-y-5 pl-6">
      <span className="absolute left-[7px] top-1 bottom-1 w-px bg-slate-200" aria-hidden />
      {ordered.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-6 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
              i === 0 ? 'border-navy-600 bg-navy-600' : 'border-slate-300 bg-white'
            }`}
            aria-hidden
          >
            {i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <p className="text-sm font-semibold text-slate-900">{STATUS_LABEL[e.status] ?? e.status}</p>
          {e.note ? <p className="mt-0.5 text-sm text-slate-600">{e.note}</p> : null}
          <p className="mt-0.5 text-xs text-slate-400">
            {fmt(e.createdAt)}
            {e.actor ? ` · by ${e.actor}` : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}
