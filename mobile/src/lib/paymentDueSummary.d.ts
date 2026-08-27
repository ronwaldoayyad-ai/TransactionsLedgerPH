export function buildDueSummary(
  items: any[],
  today: string,
): {
  total: number
  pastDueTotal: number
  upcomingTotal: number
  count: number
  pastDueCount: number
  upcomingCount: number
  dates: { date: string; kind: 'past_due' | 'upcoming' }[]
  focusDate: string | null
  latestDate: string | null
}
