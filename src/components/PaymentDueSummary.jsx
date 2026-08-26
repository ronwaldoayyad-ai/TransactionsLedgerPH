import Icon from './Icon'
import { Card, CardHeader } from './ui'
import { formatDate, formatPeso } from '../lib/amortization'

// Shared presentation for the "Next Payment Due" summary, used by both the
// admin Payment Due preview and the borrower dashboard so the two match
// exactly. `summary` is:
//   { total, pastDueTotal, upcomingTotal, count, pastDueCount, upcomingCount, nextDate }

// The big headline card: the exact tile a borrower sees.
export function NextPaymentDueCard({ summary, flash = false, onClick, emptyText = 'No upcoming payments' }) {
  const clickable = typeof onClick === 'function'
  const clickProps = clickable
    ? {
        onClick,
        role: 'button',
        tabIndex: 0,
        'aria-label': `Next Payment Due: ${summary.count ? formatPeso(summary.total) : emptyText}`,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick(e)
          }
        },
      }
    : {}
  return (
    <div
      className={`relative flex h-full flex-col justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-500 ${
        flash ? 'ring-2 ring-navy-400 ring-offset-2' : ''
      } ${
        clickable
          ? 'cursor-pointer hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600'
          : ''
      }`}
      {...clickProps}
    >
      <span className="absolute right-6 top-6 hidden rounded-xl bg-sky-50 p-2.5 text-sky-700 sm:block">
        <Icon name="clock" className="h-5 w-5" />
      </span>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        Next Payment Due
        {clickable && (
          <Icon name="chevron" className="ml-1 inline h-3 w-3 -rotate-90 align-middle text-slate-400" />
        )}
      </p>
      <p className="mt-3 font-mono text-4xl font-bold text-slate-900 sm:text-5xl">
        {summary.count ? formatPeso(summary.total) : '—'}
      </p>
      <p className="mt-3 text-sm text-slate-500">
        {summary.count ? (
          <>
            {summary.count} item{summary.count === 1 ? '' : 's'} due
            {summary.pastDueCount > 0 && (
              <>
                {' · incl. '}
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {summary.pastDueCount} past due
                </span>
              </>
            )}
            {summary.nextDate && (
              <>
                {' · next '}
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {formatDate(summary.nextDate)}
                </span>
              </>
            )}
          </>
        ) : (
          emptyText
        )}
      </p>
    </div>
  )
}

function BreakdownRow({ label, value, tone = 'slate' }) {
  const tones = { slate: 'text-slate-900', red: 'text-red-600', emerald: 'text-emerald-700' }
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`font-mono text-sm font-semibold ${tones[tone]}`}>{value}</span>
    </div>
  )
}

// The two-column detail card. `borrowersTargeted` and `footer` are admin-only.
export function PaymentDueBreakdown({ summary, borrowersTargeted = null, footer = null, flash = false }) {
  const col2 = [
    <BreakdownRow key="pd" label="Past Due" value={formatPeso(summary.pastDueTotal)} tone="red" />,
    <BreakdownRow key="ti" label="Total Items" value={summary.count} />,
    <BreakdownRow key="ui" label="Upcoming Items" value={summary.upcomingCount} tone="emerald" />,
  ]
  if (borrowersTargeted != null) {
    col2.push(<BreakdownRow key="bt" label="Borrowers Targeted" value={borrowersTargeted} />)
  }
  return (
    <Card className={`transition-all duration-500 ${flash ? 'ring-2 ring-navy-200' : ''}`}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Icon name="chart" className="h-4 w-4 text-navy-700" />
            Detailed Breakdown
          </span>
        }
      />
      <div className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
        <div className="divide-y divide-slate-100">
          <BreakdownRow label="Total Due" value={formatPeso(summary.total)} />
          <BreakdownRow label="Upcoming" value={formatPeso(summary.upcomingTotal)} tone="emerald" />
          <BreakdownRow label="Past Due Items" value={summary.pastDueCount} tone="red" />
          <BreakdownRow
            label="Next Due Date"
            value={summary.nextDate ? formatDate(summary.nextDate) : '—'}
            tone="emerald"
          />
        </div>
        <div className="divide-y divide-slate-100">{col2}</div>
      </div>
      {footer && <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{footer}</div>}
    </Card>
  )
}
