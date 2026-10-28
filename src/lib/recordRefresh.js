import { useEffect } from 'react'

const eventName = 'loanledger-refresh-records'

// Providers join a user-requested refresh without scheduling background reads.
export function useRecordRefresh(loader, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined
    const refresh = event => event.detail.waitUntil(Promise.resolve().then(loader))
    window.addEventListener(eventName, refresh)
    return () => window.removeEventListener(eventName, refresh)
  }, [loader, enabled])
}

export async function refreshRecords(loadPrimary) {
  const pending = [Promise.resolve().then(loadPrimary)]
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: { waitUntil: promise => pending.push(promise) },
  }))
  return Promise.allSettled(pending)
}
