import { useCallback, useMemo, useState } from 'react'

// Per-user "seen watermark" for a borrower nav section. Stores an ISO
// timestamp in localStorage; anything newer than the watermark counts as
// unread. `markSeen()` bumps the watermark to now — call it when the borrower
// opens the section's page. Storing per userId keeps view-as switches (admin
// viewing borrower A vs. borrower B) from bleeding read state across users.
const storageKey = (userId, section) => `sectionSeen:${userId}:${section}`

export function useSectionUnread({ userId, section, items, getTimestamp }) {
  // Bumped by markSeen so the memo below re-reads localStorage after a write.
  // Also participates in the dep list so the watermark refreshes naturally
  // when userId or section changes.
  const [version, setVersion] = useState(0)

  const watermark = useMemo(() => {
    if (typeof window === 'undefined' || !userId) return null
    try {
      return window.localStorage.getItem(storageKey(userId, section)) || null
    } catch {
      return null
    }
    // version participates so markSeen's write is re-read on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, section, version])

  const unread = (items || []).reduce((count, item) => {
    const ts = getTimestamp(item)
    if (!ts) return count
    if (!watermark || ts > watermark) return count + 1
    return count
  }, 0)

  const markSeen = useCallback(() => {
    if (typeof window === 'undefined' || !userId) return
    const now = new Date().toISOString()
    try {
      window.localStorage.setItem(storageKey(userId, section), now)
      setVersion((v) => v + 1)
    } catch {
      // ignore quota/private-mode errors
    }
  }, [userId, section])

  return { unread, markSeen }
}
