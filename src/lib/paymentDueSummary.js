import { effectiveStatus } from './transactions'

// Build the "Next Payment Due" summary from the exact set of installments being
// summed. Shared by the admin Payment Due preview and the borrower dashboard.
//
// `focusDate` is the most recent due date "to date" (the latest one on or before
// today) — the payment the borrower should settle first; if every date is in the
// future, it's the earliest one.
export function buildDueSummary(items, today) {
  const pastDue = items.filter((t) => effectiveStatus(t, today) === 'past_due')
  const upcoming = items.filter((t) => effectiveStatus(t, today) !== 'past_due')
  const dateMap = new Map()
  for (const t of items) {
    dateMap.set(t.dueDate, effectiveStatus(t, today) === 'past_due' ? 'past_due' : 'upcoming')
  }
  const dates = [...dateMap.entries()]
    .map(([date, kind]) => ({ date, kind }))
    .sort((a, b) => a.date.localeCompare(b.date))
  const onOrBefore = dates.filter((d) => d.date <= today)
  const focusDate = onOrBefore.length
    ? onOrBefore[onOrBefore.length - 1].date
    : (dates[0]?.date ?? null)
  // The latest selected due date, regardless of status (dates is sorted ascending).
  const latestDate = dates.length ? dates[dates.length - 1].date : null
  return {
    total: items.reduce((s, t) => s + t.amount, 0),
    pastDueTotal: pastDue.reduce((s, t) => s + t.amount, 0),
    upcomingTotal: upcoming.reduce((s, t) => s + t.amount, 0),
    count: items.length,
    pastDueCount: pastDue.length,
    upcomingCount: upcoming.length,
    dates,
    focusDate,
    latestDate,
  }
}
