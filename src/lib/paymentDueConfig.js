// Admin-controlled override for the borrower's "Next Payment Due" tile.
//
// The admin (Payment Due page) picks a set of borrowers and a set of due dates.
// Once applied, every targeted borrower's Next Payment Due tile sums only their
// own receivable installments that fall on those exact dates, instead of the
// default "all past due + the next upcoming date" calculation.
//
// Persistence: localStorage so the choice survives reloads and crosses tabs
// (admin tab -> borrower tab) and the in-app "View As" preview. Deliberately
// outside React; components subscribe via usePaymentDueConfig().
import { useSyncExternalStore } from 'react'

const KEY = 'll.paymentDueConfig.v1'
// Same-tab listeners: the native `storage` event only fires in OTHER tabs, so
// we dispatch our own event for the tab that made the change.
const EVENT = 'll:paymentDueConfig'

// null = no override in effect (borrowers see the default auto-calculation).
const EMPTY = null

const isBrowser = typeof window !== 'undefined'

function read() {
  if (!isBrowser) return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const cfg = JSON.parse(raw)
    if (!cfg || !Array.isArray(cfg.dueDates)) return EMPTY
    return cfg
  } catch {
    return EMPTY
  }
}

// Cache so useSyncExternalStore gets a stable reference between renders
// (returning a fresh object every getSnapshot call would loop).
let cache = read()

export function getPaymentDueConfig() {
  return cache
}

function commit(next) {
  cache = next
  if (!isBrowser) return
  try {
    if (next == null) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Ignore quota / private-mode failures; the in-memory cache still works
    // for this tab's session.
  }
  window.dispatchEvent(new Event(EVENT))
}

// cfg: { allBorrowers, borrowerIds: string[], dueDates: string[] }
export function setPaymentDueConfig(cfg) {
  commit({
    allBorrowers: !!cfg.allBorrowers,
    borrowerIds: cfg.allBorrowers ? [] : [...(cfg.borrowerIds ?? [])],
    dueDates: [...(cfg.dueDates ?? [])],
    appliedAt: new Date().toISOString(),
  })
}

export function clearPaymentDueConfig() {
  commit(EMPTY)
}

// Does an active override target this borrower? An override with no dates
// selected is treated as inactive so it never blanks a tile unintentionally.
export function configAppliesTo(cfg, userId) {
  if (!cfg || !Array.isArray(cfg.dueDates) || cfg.dueDates.length === 0) return false
  return cfg.allBorrowers || (cfg.borrowerIds ?? []).includes(userId)
}

function subscribe(callback) {
  if (!isBrowser) return () => {}
  const onStorage = (e) => {
    if (e.key === KEY) {
      cache = read()
      callback()
    }
  }
  const onLocal = () => {
    cache = read()
    callback()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(EVENT, onLocal)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(EVENT, onLocal)
  }
}

// React hook: re-renders the caller whenever the override changes, in this tab
// or another.
export function usePaymentDueConfig() {
  return useSyncExternalStore(subscribe, getPaymentDueConfig, getPaymentDueConfig)
}
