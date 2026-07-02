import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'

// Borrower-only port of the web AnnouncementsContext: admin-published toasts
// and banners delivered over Supabase Realtime. RLS already validity- and
// audience-filters live rows, so we trust them as-is (web comment: re-checking
// the window against a skewed client clock could wrongly hide a fresh one).

const AnnouncementsContext = createContext<any>(null)

const mapAnnouncement = (r: any) => ({
  id: r.id,
  type: r.type,
  title: r.title ?? '',
  body: r.body,
  audience: r.audience,
  targetUserIds: r.target_user_ids ?? [],
  startsAt: r.starts_at ?? null,
  expiresAt: r.expires_at ?? null,
  oneTime: !!r.one_time,
  createdAt: r.created_at ?? null,
})

export function AnnouncementsProvider({ children }: { children: ReactNode }) {
  const { session } = useApp()
  const meId = session?.user?.id ?? null

  const [liveAnnouncements, setLiveAnnouncements] = useState<any[]>([])
  // Session-scoped dismissals: regular announcements hide until the next
  // sign-in / app launch (web parity — the web resets this per login).
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())

  // Reset dismissals whenever the signed-in user changes. Deferred via
  // queueMicrotask to satisfy the react-compiler no-sync-setState rule
  // (same approach as the web context).
  useEffect(() => {
    queueMicrotask(() => {
      setDismissed(new Set())
      if (!meId) setLiveAnnouncements([])
    })
  }, [meId])

  const fetchAll = useCallback(async () => {
    if (!meId) return
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[announcements] load failed:', error.message)
      return
    }
    setLiveAnnouncements((data ?? []).map(mapAnnouncement))
  }, [meId])

  useEffect(() => {
    if (!meId) return
    ;(async () => {
      await fetchAll()
    })()
  }, [meId, fetchAll])

  // Realtime + foreground resubscribe (sockets die while backgrounded).
  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    if (!meId) return undefined
    const channel = supabase
      .channel(`announcements-rt-${meId}-${epoch}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        fetchAll()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [meId, epoch, fetchAll])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setEpoch((e) => e + 1)
        fetchAll()
      }
    })
    return () => sub.remove()
  }, [fetchAll])

  const announcements = useMemo(
    () => (meId ? [...liveAnnouncements] : []),
    [liveAnnouncements, meId],
  )

  // Delivery queues (exclude dismissed), split by render type.
  const { toasts, banners } = useMemo(() => {
    if (!meId) return { toasts: [], banners: [] }
    const visible = announcements.filter((a: any) => !dismissed.has(a.id))
    return {
      toasts: visible.filter((a: any) => a.type === 'toast'),
      banners: visible.filter((a: any) => a.type === 'banner'),
    }
  }, [announcements, dismissed, meId])

  // Dismiss takes the announcement object. One-time (auto) announcements are
  // CONSUMED — deleted so they never reappear on any device. Regular ones are
  // only hidden for this session (reappear on next login until they expire).
  const dismiss = useCallback(
    async (a: any) => {
      if (!a) return
      if (a.oneTime) {
        const { error } = await supabase.from('announcements').delete().eq('id', a.id)
        if (error) {
          console.error('[announcements] consume failed:', error.message)
          setDismissed((prev) => new Set(prev).add(a.id)) // at least hide it this session
          return
        }
        await fetchAll()
        return
      }
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(a.id)
        return next
      })
    },
    [fetchAll],
  )

  const getById = useCallback(
    (id: string) => announcements.find((a: any) => a.id === id) ?? null,
    [announcements],
  )

  const value = useMemo(
    () => ({ announcements, toasts, banners, dismiss, getById }),
    [announcements, toasts, banners, dismiss, getById],
  )

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>
}

export function useAnnouncements() {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncements must be used within AnnouncementsProvider')
  return ctx
}
