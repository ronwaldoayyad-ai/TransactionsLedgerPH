import { useEffect, useState } from 'react'
import { getPageEntry, hasPageEntry, setPageEntry } from '../lib/pageStateStore'

// Drop-in useState replacement whose value survives navigating away from the
// page. Keys are namespaced per page, e.g. 'txn.query'. Cleared by Refresh
// and on sign-out (see pageStateStore).
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() =>
    hasPageEntry(key) ? getPageEntry(key) : typeof initial === 'function' ? initial() : initial,
  )
  useEffect(() => {
    setPageEntry(key, value)
  }, [key, value])
  return [value, setValue]
}
