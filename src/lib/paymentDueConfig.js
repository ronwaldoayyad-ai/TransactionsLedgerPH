// Admin-controlled override for the borrower's "Next Payment Due" tile.
//
// The admin (Payment Due page) picks a set of borrowers and a set of due dates.
// Once applied, every targeted borrower's Next Payment Due tile sums only their
// own receivable installments that fall on those exact dates, instead of the
// default "all past due + the next upcoming date" calculation.
//
// Source of truth: the `payment_due_config` Supabase table (see the matching
// migration), loaded and written through AppContext so it reaches borrowers on
// their own devices. The localStorage helpers below back the demo/dev mode
// only, where there is no live database; production always uses the table.

const KEY = 'll.paymentDueConfig.v1'
const isBrowser = typeof window !== 'undefined'

// Shape: { allBorrowers, borrowerIds: string[], dueDates: string[], appliedAt }
export function normalizeConfig(cfg) {
  if (!cfg) return null
  return {
    allBorrowers: !!cfg.allBorrowers,
    borrowerIds: cfg.allBorrowers ? [] : [...(cfg.borrowerIds ?? [])],
    dueDates: [...(cfg.dueDates ?? [])],
    appliedAt: cfg.appliedAt ?? new Date().toISOString(),
  }
}

// --- Demo/dev backing (localStorage) ---------------------------------------
export function readStoredConfig() {
  if (!isBrowser) return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw)
    if (!cfg || !Array.isArray(cfg.dueDates)) return null
    return normalizeConfig(cfg)
  } catch {
    return null
  }
}

export function writeStoredConfig(cfg) {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(normalizeConfig(cfg)))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearStoredConfig() {
  if (!isBrowser) return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Ignore.
  }
}

// --- Pure helper (used live and in demo) -----------------------------------
// Does an active override target this borrower? An override with no dates
// selected is treated as inactive so it never blanks a tile unintentionally.
export function configAppliesTo(cfg, userId) {
  if (!cfg || !Array.isArray(cfg.dueDates) || cfg.dueDates.length === 0) return false
  return cfg.allBorrowers || (cfg.borrowerIds ?? []).includes(userId)
}
