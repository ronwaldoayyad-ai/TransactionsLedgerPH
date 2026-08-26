// Admin-controlled per-borrower overrides for the "Next Payment Due" tile.
//
// Each override pins a set of due dates for ONE borrower: their tile then sums
// only their receivable installments falling on those dates, instead of the
// default "all past due + the next upcoming date" calculation. Overrides are
// independent per borrower — pinning one never affects another.
//
// Source of truth: the `payment_due_overrides` Supabase table (one row per
// borrower), loaded and written through AppContext so it reaches borrowers on
// their own devices. The localStorage helpers below back demo/dev mode only.

const KEY = 'll.paymentDueOverrides.v1'
const isBrowser = typeof window !== 'undefined'

// An override is { borrowerId, dueDates: string[], appliedAt }. The store holds
// an array of them.
export function normalizeOverride(o) {
  return {
    borrowerId: o.borrowerId,
    dueDates: [...(o.dueDates ?? [])],
    appliedAt: o.appliedAt ?? new Date().toISOString(),
  }
}

// --- Demo/dev backing (localStorage) ---------------------------------------
export function readStoredOverrides() {
  if (!isBrowser) return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((o) => o && o.borrowerId && Array.isArray(o.dueDates)).map(normalizeOverride)
  } catch {
    return []
  }
}

export function writeStoredOverrides(list) {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify((list ?? []).map(normalizeOverride)))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

// --- Pure helper (used live and in demo) -----------------------------------
// The active override for a borrower, or null. An override with no dates is
// treated as inactive so it never blanks a tile.
export function overrideForBorrower(overrides, userId) {
  const row = (overrides ?? []).find((o) => o.borrowerId === userId)
  return row && row.dueDates.length > 0 ? row : null
}
