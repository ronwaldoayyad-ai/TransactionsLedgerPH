import { useState } from 'react'
import Icon from './Icon'
import { Card, CardHeader, Modal } from './ui'
import { formatDate, formatPeso } from '../lib/amortization'

// Shared presentation for the "Next Payment Due" summary, used by both the
// admin Payment Due preview and the borrower dashboard so the two match.
// The summary object comes from buildDueSummary (../lib/paymentDueSummary).

const MAX_VISIBLE_CHIPS = 6

function DateChip({ date, kind, focus }) {
  const base =
    kind === 'past_due' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${base} ${
        focus ? 'font-bold ring-2 ring-navy-600 ring-offset-1' : ''
      }`}
    >
      {focus && <Icon name="clock" className="h-3 w-3" />}
      {formatDate(date)}
    </span>
  )
}

// The big headline card: the exact tile a borrower sees.
export function NextPaymentDueCard({ summary, flash = false, onClick, emptyText = 'No upcoming payments' }) {
  const [showAll, setShowAll] = useState(false)
  const dates = summary.dates ?? []
  const overflow = dates.length > MAX_VISIBLE_CHIPS
  const visible = overflow ? dates.slice(0, MAX_VISIBLE_CHIPS - 1) : dates
  const hiddenCount = dates.length - visible.length

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
    <>
      <div
        className={`relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm transition-all duration-500 ${
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

        {summary.count ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              {summary.count} item{summary.count === 1 ? '' : 's'} due
              {summary.pastDueCount > 0 && (
                <>
                  {' · incl. '}
                  <span className="font-semibold text-red-600">{summary.pastDueCount} past due</span>
                </>
              )}
            </p>
            {/* Selected due dates. The most recent one (to date) is highlighted —
                that's the payment the borrower should settle first. */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              {visible.map((d) => (
                <DateChip key={d.date} date={d.date} kind={d.kind} focus={d.date === summary.focusDate} />
              ))}
              {overflow && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAll(true)
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 transition-colors duration-150 hover:bg-navy-50"
                >
                  +{hiddenCount} more
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
        )}
      </div>

      <Modal
        open={showAll}
        title={`Due dates (${dates.length})`}
        onClose={() => setShowAll(false)}
      >
        <ul className="space-y-2">
          {dates.map((d) => {
            const focus = d.date === summary.focusDate
            return (
              <li
                key={d.date}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                  focus ? 'border-navy-300 bg-navy-50' : 'border-slate-100'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  {focus && <Icon name="clock" className="h-4 w-4 text-navy-700" />}
                  {formatDate(d.date)}
                  {focus && <span className="text-xs font-semibold text-navy-700">· pay first</span>}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.kind === 'past_due' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {d.kind === 'past_due' ? 'past due' : 'upcoming'}
                </span>
              </li>
            )
          })}
        </ul>
      </Modal>
    </>
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
          {/* Latest selected due date, regardless of status. */}
          <BreakdownRow
            label="Due Date"
            value={summary.latestDate ? formatDate(summary.latestDate) : '—'}
          />
        </div>
        <div className="divide-y divide-slate-100">{col2}</div>
      </div>
      {footer && <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{footer}</div>}
    </Card>
  )
}
