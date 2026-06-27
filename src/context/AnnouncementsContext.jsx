import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApp } from './AppContext'
import { supabase } from '../supabaseClient'

// Admin-authored announcements delivered to borrowers (toast + push-down banner).
// Dual-mode like the rest of the app: live sessions use the `announcements` table
// + Realtime; demo sessions use a shared in-memory store. Dismissals are
// session-scoped (in memory, reset per login) so a valid announcement reliably
// reappears on each login until its expiry date — rather than being permanently
// hidden the first time a toast auto-dismisses.

const AnnouncementsContext = createContext(null)

const mapAnnouncement = (r) => ({
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

const mapTemplate = (r) => ({
  id: r.id,
  name: r.name ?? '',
  type: r.type ?? 'toast',
  title: r.title ?? '',
  body: r.body ?? '',
})

let demoAnnouncements = []
let demoSeq = 0
const demoId = () => `a-${Date.now()}-${++demoSeq}`

// A couple of seeded demo templates so the feature is usable without the DB.
let demoTemplates = [
  { id: 't-demo-1', name: 'Scheduled maintenance', type: 'banner', title: '🔧 Scheduled maintenance', body: 'The portal will be briefly unavailable tonight from 10:00 PM to 11:00 PM. Thank you for your patience.' },
  { id: 't-demo-2', name: 'Payment reminder', type: 'toast', title: '⏰ Payment reminder', body: 'Your next installment is due soon. Please settle on or before the due date to avoid penalties.' },
  // Used by the auto toast triggers on proof-of-payment approve / reject.
  { id: 't-demo-3', name: 'Payment posted', type: 'toast', title: '✅ Payment posted', body: 'Your proof of payment was verified and posted to your account. Thank you!' },
  { id: 't-demo-4', name: 'Payment unsuccessful', type: 'toast', title: '⚠️ Payment unsuccessful', body: 'Your proof of payment could not be verified. Please review the note on your submission and re-upload.' },
]
let demoTplSeq = 0
const demoTplId = () => `t-${Date.now()}-${++demoTplSeq}`

const isActive = (a, now) => {
  const start = a.startsAt ? new Date(a.startsAt).getTime() : 0
  const end = a.expiresAt ? new Date(a.expiresAt).getTime() : Infinity
  return start <= now && now < end
}
const targetsMe = (a, meId) => a.audience === 'all' || (a.targetUserIds || []).includes(meId)

export function AnnouncementsProvider({ children }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const me = session?.user ?? null
  const meId = me?.id ?? null
  const isAdmin = me?.role === 'admin'

  const [liveAnnouncements, setLiveAnnouncements] = useState([])
  const [demoVersion, setDemoVersion] = useState(0)
  // Session-scoped dismissals (cleared on each login below), so an announcement
  // reappears next time the borrower signs in until it actually expires.
  const [dismissed, setDismissed] = useState(() => new Set())
  // Ticking clock so the active-window filter re-evaluates as time passes
  // (and keeps render pure — no Date.now() during render).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // Reset dismissals whenever the signed-in identity changes (login / switch),
  // so a fresh session starts with every valid announcement visible again.
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setDismissed(new Set())
    })
    return () => {
      cancelled = true
    }
  }, [meId])

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

  // ---- Templates (admin-only reusable messages) ----
  const [liveTemplates, setLiveTemplates] = useState([])
  const [tplVersion, setTplVersion] = useState(0)

  const fetchTemplates = useCallback(async () => {
    if (!isLive || !isAdmin) return
    const { data, error } = await supabase
      .from('announcement_templates')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[announcements] templates load failed:', error.message)
      return
    }
    setLiveTemplates((data ?? []).map(mapTemplate))
  }, [isLive, isAdmin])

  useEffect(() => {
    if (!isLive || !isAdmin) return undefined
    let active = true
    ;(async () => {
      await fetchTemplates()
      if (!active) return
    })()
    return () => {
      active = false
    }
  }, [isLive, isAdmin, fetchTemplates])

  const templates = useMemo(() => {
    if (!isAdmin) return []
    return isLive ? liveTemplates : demoTemplates
    // tplVersion forces recompute after in-memory demo mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveTemplates, tplVersion, isAdmin])

  const createTemplate = useCallback(
    async ({ name = '', type = 'toast', title = '', body = '' }) => {
      if (isLive) {
        const { error } = await supabase.from('announcement_templates').insert({ name, type, title, body })
        if (error) return { error: error.message }
        await fetchTemplates()
      } else {
        demoTemplates = [{ id: demoTplId(), name, type, title, body }, ...demoTemplates]
        setTplVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchTemplates],
  )

  const updateTemplate = useCallback(
    async (id, { name, type, title, body }) => {
      if (isLive) {
        const { error } = await supabase
          .from('announcement_templates')
          .update({ name, type, title, body })
          .eq('id', id)
        if (error) return { error: error.message }
        await fetchTemplates()
      } else {
        demoTemplates = demoTemplates.map((t) => (t.id === id ? { ...t, name, type, title, body } : t))
        setTplVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchTemplates],
  )

  const deleteTemplate = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('announcement_templates').delete().eq('id', id)
        if (error) return
        await fetchTemplates()
      } else {
        demoTemplates = demoTemplates.filter((t) => t.id !== id)
        setTplVersion((v) => v + 1)
      }
    },
    [isLive, fetchTemplates],
  )

  // Admin sees everything (management); a borrower sees only valid ones for them.
  // Live rows are already validity- and audience-filtered by RLS, so we trust
  // them as-is (re-checking the window against a possibly-skewed client clock
  // could wrongly hide a just-published announcement). Demo has no RLS, so it
  // filters in memory.
  const announcements = useMemo(() => {
    if (!meId) return []
    if (isLive) return [...liveAnnouncements]
    if (isAdmin) return [...demoAnnouncements]
    return demoAnnouncements.filter((a) => isActive(a, now) && targetsMe(a, meId))
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

  // Dismiss takes the announcement object. One-time (auto) announcements are
  // CONSUMED — deleted so they never reappear on the next login, on any device.
  // Regular ones are only hidden for the session (reappear until they expire).
  const dismiss = useCallback(
    async (a) => {
      if (!a) return
      if (a.oneTime) {
        if (isLive) {
          const { error } = await supabase.from('announcements').delete().eq('id', a.id)
          if (error) {
            console.error('[announcements] consume failed:', error.message)
            setDismissed((prev) => new Set(prev).add(a.id)) // at least hide it this session
            return
          }
          await fetchAll()
        } else {
          demoAnnouncements = demoAnnouncements.filter((x) => x.id !== a.id)
          setDemoVersion((v) => v + 1)
        }
        return
      }
      setDismissed((prev) => {
        const next = new Set(prev)
        next.add(a.id)
        return next
      })
    },
    [isLive, fetchAll],
  )

  const createAnnouncement = useCallback(
    async ({ type, title = '', body, audience = 'all', targetUserIds = [], expiresAt = null, oneTime = false }) => {
      const ids = audience === 'targeted' ? targetUserIds : []
      if (isLive) {
        const { error } = await supabase.from('announcements').insert({
          type,
          title,
          body,
          audience,
          target_user_ids: ids,
          expires_at: expiresAt || null,
          one_time: oneTime,
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
            oneTime,
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

  // Fire a one-time toast to a specific borrower from a named template (used by
  // the proof-of-payment approve / reject flow). Falls back to a built-in
  // message if the admin hasn't created the named template yet.
  const triggerTemplateToast = useCallback(
    async ({ templateName, userId, fallback }) => {
      if (!userId) return
      const wanted = String(templateName ?? '').trim().toLowerCase()
      const tpl = templates.find((t) => t.type === 'toast' && t.name.trim().toLowerCase() === wanted)
      const title = tpl?.title ?? fallback?.title ?? ''
      const body = tpl?.body ?? fallback?.body ?? ''
      if (!body) return
      await createAnnouncement({
        type: 'toast',
        title,
        body,
        audience: 'targeted',
        targetUserIds: [userId],
        oneTime: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      })
    },
    [templates, createAnnouncement],
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

  const updateAnnouncement = useCallback(
    async (id, { title = '', body, audience = 'all', targetUserIds = [], expiresAt = null }) => {
      const ids = audience === 'targeted' ? targetUserIds : []
      if (isLive) {
        const { error } = await supabase
          .from('announcements')
          .update({ title, body, audience, target_user_ids: ids, expires_at: expiresAt || null })
          .eq('id', id)
        if (error) {
          console.error('[announcements] update failed:', error.message)
          return { error: error.message }
        }
        await fetchAll()
      } else {
        demoAnnouncements = demoAnnouncements.map((a) =>
          a.id === id ? { ...a, title, body, audience, targetUserIds: ids, expiresAt: expiresAt || null } : a,
        )
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchAll],
  )

  const getById = useCallback((id) => announcements.find((a) => a.id === id) ?? null, [announcements])

  const value = useMemo(
    () => ({
      announcements,
      toasts,
      banners,
      isAdmin,
      createAnnouncement,
      updateAnnouncement,
      deleteAnnouncement,
      dismiss,
      getById,
      templates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      triggerTemplateToast,
    }),
    [
      announcements, toasts, banners, isAdmin, createAnnouncement, updateAnnouncement, deleteAnnouncement, dismiss, getById,
      templates, createTemplate, updateTemplate, deleteTemplate, triggerTemplateToast,
    ],
  )

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider
export function useAnnouncements() {
  const ctx = useContext(AnnouncementsContext)
  if (!ctx) throw new Error('useAnnouncements must be used within AnnouncementsProvider')
  return ctx
}
