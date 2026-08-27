// Per-borrower payment-due overrides (web paymentDueConfig port, live-only).
// `dueDates` drives the Current card, `nextDueDates` the Next card. The admin
// sets these on the web app; the mobile borrower reads them from Supabase.

// Card background colours that distinguish the two payment-due cards. Both are
// light, so dark text and the animated rainbow border read unchanged.
export const PAYMENT_DUE_COLORS = { current: '#E6D5C3', next: '#E0F7FA' }

// The active CURRENT override for a borrower, or null (inactive when no dates).
export function overrideForBorrower(overrides, userId) {
  const row = (overrides ?? []).find((o) => o.borrowerId === userId)
  return row && (row.dueDates ?? []).length > 0 ? row : null
}

// The borrower's raw override row (both sets), or null. Use this to read the
// NEXT set, which is independent of whether a Current override is active.
export function rowForBorrower(overrides, userId) {
  return (overrides ?? []).find((o) => o.borrowerId === userId) ?? null
}
