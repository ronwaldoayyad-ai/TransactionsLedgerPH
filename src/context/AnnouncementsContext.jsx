import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApp } from './AppContext'
import { supabase } from '../supabaseClient'

// Admin-authored announcements delivered to borrowers (toast + push-down banner).
// Dual-mode like the rest of the app: live sessions use the `announcements` table
// + Realtime; demo sessions use a shared in-memory store. Per-recipient dismissals
// live in localStorage so a closed announcement stays closed on that device.

const AnnouncementsContext = createContext(null)
const DISMISS_KEY = 'announce-dismissed'

const mapAnnouncement = (r) => ({
  id: r.id,
  type: r.type,
  title: r.title ?? '',
  body: r.body,
  audience: r.audience,
  targetUserIds: r.target_user_ids ?? [],
  startsAt: r.starts_at ?? null,
  expiresAt: r.expires_at ?? null,
  createdAt: r.created_at ?? null,
})

let demoAnnouncements = []
let demoSeq = 0
const demoId = () => `a-${Date.now()}-${++demoSeq}`

const isActive = (a, now) => {
  const start = a.startsAt ? new Date(a.startsAt).getTime() : 0
  const end = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
  return start <= now && now < end
}
const targetsMe = (a, meId) => a.audience === 'all' || (a.targetUserIds || []).includes(meId)

function readDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function AnnouncementsProvider({ children }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const me = session?.user ?? null
  const meId = me?.id ?? null
  const isAdmin = me?.role === 'admin'

  const [liveAnnouncements, setLiveAnnouncements] = useState([])
  const [demoVersion, setDemoVersion] = useState(0)
  const [dismissed, setDismissed] = useState(() => readDismissed())
  // Ticking clock so the active-window filter re-evaluates as time passes
  // (and keeps render pure — no Date.now() during render).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const fetchAll = useCallback(async () => {
    if (!isLive || !meId) return
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[announcements] load failed:', error.message)
      return
    }
    setLiveAnnouncements((data ?? []).map(mapAnnouncement))
  }, [isLive, meId])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    let active = true
    ;(async () => {
      await fetchAll()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [isLive, meId, fetchAll])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    const channel = supabase
      .channel(`announcements-rt-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAll()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchAll])

  // Admin sees everything (management); a borrower sees only valid ones for them.
  const announcements = useMemo(() => {
    const base = isLive ? liveAnnouncements : demoAnnouncements
    if (!meId) return []
    if (isAdmin) return [...base]
    return base.filter((a) => isActive(a, now) && targetsMe(a, meId))
    // demoVersion forces recompute after in-memory mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveAnnouncements, demoVersion, meId, isAdmin, now])

  // Borrower delivery queues (exclude dismissed), split by render type.
  const { toasts, banners } = useMemo(() => {
    if (isAdmin || !meId) return { toasts: [], banners: [] }
    const visible = announcements.filter((a) => !dismissed.has(a.id))
    return {
      toasts: visible.filter((a) => a.type === 'toast'),
      banners: visible.filter((a) => a.type === 'banner'),
    }
  }, [announcements, dismissed, isAdmin, meId])

  const dismiss = useCallback((id) => {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(id)
      try {
        localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const createAnnouncement = useCallback(
    async ({ type, title = '', body, audience = 'all', targetUserIds = [], expiresAt = null }) => {
      const ids = audience === 'targeted' ? targetUserIds : []
      if (isLive) {
        const { error } = await supabase.from('announcements').insert({
          type,
          title,
          body,
          audience,
          target_user_ids: ids,
          expires_at: expiresAt || null,
        })
        if (error) {
          console.error('[announcements] create failed:', error.message)
          return { error: error.message }
        }
        await fetchAll()
      } else {
        demoAnnouncements = [
          {
            id: demoId(),
            type,
            title,
            body,
            audience,
            targetUserIds: ids,
            startsAt: new Date().toISOString(),
            expiresAt: expiresAt || null,
            createdAt: new Date().toISOString(),
          },
          ...demoAnnouncements,
        ]
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchAll],
  )

  const deleteAnnouncement = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('announcements').delete().eq('id', id)
        if (error) {
          console.error('[announcements] delete failed:', error.message)
          return
        }
        await fetchAll()
      } else {
        demoAnnouncements = demoAnnouncements.filter((a) => a.id !== id)
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, fetchAll],
  )

  const getById = useCallback((id) => announcements.find((a) => a.id === id) ?? null, [announcements])

  const value = useMemo(
    () => ({ announcements, toasts, banners, isAdmin, createAnnouncement, deleteAnnouncement, dismiss, getById }),
    [announcements, toasts, banners, isAdmin, createAnnouncement, deleteAnnouncement, dismiss, getById],
  )

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider
export function useAnnouncements() {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncements must be used within AnnouncementsProvider')
  return ctx
}
