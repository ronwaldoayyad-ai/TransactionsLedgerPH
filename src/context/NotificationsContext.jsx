import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApp } from './AppContext'
import { supabase } from '../supabaseClient'
import { NOTIFICATION_TEMPLATES } from '../lib/notificationTemplates'

// Data layer for the Notification Center. Dual-mode like the rest of the app:
// live sessions read/write the `notifications` + `notification_reads` tables and
// subscribe to Realtime; demo sessions use a shared in-memory store.
//
// A notification is admin-authored, tagged with a category, may carry embedded
// attachments, and is delivered to all borrowers or a targeted set. Read state
// is per-borrower (notification_reads) so a borrower can mark items read/unread
// and the admin can see how many recipients have read each one.

const NotificationsContext = createContext(null)

const mapNotification = (r) => ({
  id: r.id,
  category: r.category,
  title: r.title ?? '',
  body: r.body ?? '',
  audience: r.audience,
  targetUserIds: r.target_user_ids ?? [],
  attachments: r.attachments ?? [],
  createdAt: r.created_at ?? null,
})

const mapRead = (r) => ({
  notificationId: r.notification_id,
  userId: r.user_id,
  readAt: r.read_at ?? null,
})

// Demo stores: module-scoped so they survive navigation within the tab.
let demoNotifications = []
let demoReads = [] // { notificationId, userId, readAt }
let demoSeq = 0
const demoId = () => `n-${Date.now()}-${++demoSeq}`

// A small seed so the feature is usable on localhost without the DB. Targets the
// mock borrowers (u-001 Maria, u-002 Jose). One carries an image attachment.
const SEED_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300"><rect width="480" height="300" fill="#eef2ff"/><text x="40" y="150" font-family="sans-serif" font-size="22" fill="#1e3a8a">Statement of Account — sample</text><text x="40" y="185" font-family="monospace" font-size="13" fill="#64748b">Prototype placeholder attachment</text></svg>`,
  )
const seedIso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString()
demoNotifications = [
  {
    id: 'n-seed-1',
    category: 'payment',
    title: 'Payment reminder',
    body: 'Your next installment is due soon. Please settle on or before the due date to avoid late penalties.',
    audience: 'all',
    targetUserIds: [],
    attachments: [],
    createdAt: seedIso(1),
  },
  {
    id: 'n-seed-2',
    category: 'document',
    title: 'Your statement of account is ready',
    body: 'We have attached your latest statement of account. Please review it and reply here if anything looks off.',
    audience: 'targeted',
    targetUserIds: ['u-001'],
    attachments: [{ name: 'statement-of-account.svg', type: 'image/svg+xml', size: SEED_IMAGE.length, dataUrl: SEED_IMAGE }],
    createdAt: seedIso(2),
  },
  {
    id: 'n-seed-3',
    category: 'account',
    title: 'Confirm your contact details',
    body: 'Please verify that your mobile number and email on file are current so you keep receiving important updates.',
    audience: 'all',
    targetUserIds: [],
    attachments: [],
    createdAt: seedIso(4),
  },
]

const targetsMe = (n, meId) => n.audience === 'all' || (n.targetUserIds || []).includes(meId)
const byRecent = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt))

// Admin-managed notification templates (mirror of announcement templates).
const mapTemplate = (r) => ({
  id: r.id,
  name: r.name ?? '',
  category: r.category,
  title: r.title ?? '',
  body: r.body ?? '',
})
// Demo store seeded from the former hardcoded presets so the composer's template
// picker works on localhost without the DB.
let demoTemplates = Object.entries(NOTIFICATION_TEMPLATES).flatMap(([category, list]) =>
  list.map((t, i) => ({
    id: `nt-demo-${category}-${i}`,
    name: t.title.replace(/^[^A-Za-z0-9]+/, '').trim(),
    category,
    title: t.title,
    body: t.message,
  })),
)
let demoTplSeq = 0
const demoTplId = () => `nt-${Date.now()}-${++demoTplSeq}`

export function NotificationsProvider({ children }) {
  const { realSession, session, users } = useApp()
  const isLive = realSession?.source === 'supabase'
  const me = session?.user ?? null
  const meId = me?.id ?? null
  const isAdmin = me?.role === 'admin'

  const [liveNotifications, setLiveNotifications] = useState([])
  const [liveReads, setLiveReads] = useState([])
  const [demoVersion, setDemoVersion] = useState(0)
  const [loading, setLoading] = useState(isLive)
  const [liveTemplates, setLiveTemplates] = useState([])
  const [tplVersion, setTplVersion] = useState(0)

  const borrowerCount = useMemo(() => users.filter((u) => u.role === 'user').length, [users])

  // ---- Fetching (live) ----
  const fetchAll = useCallback(async () => {
    if (!isLive || !meId) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[notifications] load failed (run the migration?):', error.message)
      return
    }
    setLiveNotifications((data ?? []).map(mapNotification))
  }, [isLive, meId])

  const fetchReads = useCallback(async () => {
    if (!isLive || !meId) return
    // RLS returns all reads to the admin and only the borrower's own rows to a
    // borrower, so a plain select is correctly scoped either way.
    const { data, error } = await supabase.from('notification_reads').select('*')
    if (error) {
      console.warn('[notifications] reads load failed:', error.message)
      return
    }
    setLiveReads((data ?? []).map(mapRead))
  }, [isLive, meId])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    let active = true
    ;(async () => {
      await Promise.all([fetchAll(), fetchReads()])
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isLive, meId, fetchAll, fetchReads])

  useEffect(() => {
    if (!isLive || !meId) return undefined
    const channel = supabase
      .channel(`notifications-rt-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, () => fetchReads())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchAll, fetchReads])

  // ---- Scoped notification list ----
  // Admin sees every notification; a borrower sees only those addressed to them.
  // Live rows are already audience-filtered by RLS.
  const notifications = useMemo(() => {
    if (!meId) return []
    const base = isLive ? liveNotifications : demoNotifications
    const scoped = isAdmin || isLive ? base : base.filter((n) => targetsMe(n, meId))
    return [...scoped].sort(byRecent)
    // demoVersion forces recompute after in-memory mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveNotifications, demoVersion, meId, isAdmin])

  const reads = isLive ? liveReads : demoReads

  // ---- Read state ----
  // Set of the current borrower's read notification ids.
  const myReadIds = useMemo(() => {
    const s = new Set()
    if (!meId) return s
    reads.forEach((r) => {
      if (r.userId === meId) s.add(r.notificationId)
    })
    return s
    // demoVersion covers in-memory read mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reads, meId, demoVersion])

  const isRead = useCallback((id) => myReadIds.has(id), [myReadIds])

  const unreadCount = useMemo(() => {
    if (isAdmin) return 0
    return notifications.reduce((s, n) => s + (myReadIds.has(n.id) ? 0 : 1), 0)
  }, [notifications, myReadIds, isAdmin])

  // Admin: how many distinct borrowers have read a given notification.
  const readCountFor = useCallback(
    (id) => {
      const set = new Set()
      reads.forEach((r) => {
        if (r.notificationId === id) set.add(r.userId)
      })
      return set.size
    },
    [reads],
  )

  // Admin: number of borrowers a notification was delivered to.
  const recipientCountFor = useCallback(
    (n) => (n.audience === 'all' ? borrowerCount : (n.targetUserIds || []).length),
    [borrowerCount],
  )

  const markRead = useCallback(
    async (id) => {
      if (!meId || isAdmin) return
      if (isLive) {
        const { error } = await supabase
          .from('notification_reads')
          .upsert({ notification_id: id, user_id: meId, read_at: new Date().toISOString() }, { onConflict: 'notification_id,user_id' })
        if (error) {
          console.error('[notifications] mark-read failed:', error.message)
          return
        }
        await fetchReads()
      } else {
        if (!demoReads.some((r) => r.notificationId === id && r.userId === meId)) {
          demoReads = [...demoReads, { notificationId: id, userId: meId, readAt: new Date().toISOString() }]
          setDemoVersion((v) => v + 1)
        }
      }
    },
    [isLive, meId, isAdmin, fetchReads],
  )

  const markUnread = useCallback(
    async (id) => {
      if (!meId || isAdmin) return
      if (isLive) {
        const { error } = await supabase
          .from('notification_reads')
          .delete()
          .eq('notification_id', id)
          .eq('user_id', meId)
        if (error) {
          console.error('[notifications] mark-unread failed:', error.message)
          return
        }
        await fetchReads()
      } else {
        demoReads = demoReads.filter((r) => !(r.notificationId === id && r.userId === meId))
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, meId, isAdmin, fetchReads],
  )

  // ---- Admin writes ----
  const createNotification = useCallback(
    async ({ category, title = '', body, audience = 'all', targetUserIds = [], attachments = [] }) => {
      const ids = audience === 'targeted' ? targetUserIds : []
      if (isLive) {
        const { error } = await supabase.from('notifications').insert({
          category,
          title,
          body,
          audience,
          target_user_ids: ids,
          attachments,
        })
        if (error) {
          console.error('[notifications] create failed:', error.message)
          return { error: error.message }
        }
        await fetchAll()
      } else {
        demoNotifications = [
          {
            id: demoId(),
            category,
            title,
            body,
            audience,
            targetUserIds: ids,
            attachments,
            createdAt: new Date().toISOString(),
          },
          ...demoNotifications,
        ]
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchAll],
  )

  const updateNotification = useCallback(
    async (id, { category, title = '', body, audience = 'all', targetUserIds = [], attachments = [] }) => {
      const ids = audience === 'targeted' ? targetUserIds : []
      if (isLive) {
        const { error } = await supabase
          .from('notifications')
          .update({ category, title, body, audience, target_user_ids: ids, attachments })
          .eq('id', id)
        if (error) {
          console.error('[notifications] update failed:', error.message)
          return { error: error.message }
        }
        await fetchAll()
      } else {
        demoNotifications = demoNotifications.map((n) =>
          n.id === id ? { ...n, category, title, body, audience, targetUserIds: ids, attachments } : n,
        )
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchAll],
  )

  const deleteNotification = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('notifications').delete().eq('id', id)
        if (error) {
          console.error('[notifications] delete failed:', error.message)
          return
        }
        await Promise.all([fetchAll(), fetchReads()])
      } else {
        demoNotifications = demoNotifications.filter((n) => n.id !== id)
        demoReads = demoReads.filter((r) => r.notificationId !== id)
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, fetchAll, fetchReads],
  )

  // ---- Templates (admin-managed presets for the composer) ----
  const fetchTemplates = useCallback(async () => {
    if (!isLive || !isAdmin) return
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .order('category')
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('[notifications] templates load failed (run the migration?):', error.message)
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
    async ({ name = '', category = 'general', title = '', body = '' }) => {
      if (isLive) {
        const { error } = await supabase
          .from('notification_templates')
          .insert({ name, category, title, body })
        if (error) return { error: error.message }
        await fetchTemplates()
      } else {
        demoTemplates = [{ id: demoTplId(), name, category, title, body }, ...demoTemplates]
        setTplVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchTemplates],
  )

  const updateTemplate = useCallback(
    async (id, { name, category, title, body }) => {
      if (isLive) {
        const { error } = await supabase
          .from('notification_templates')
          .update({ name, category, title, body })
          .eq('id', id)
        if (error) return { error: error.message }
        await fetchTemplates()
      } else {
        demoTemplates = demoTemplates.map((t) =>
          t.id === id ? { ...t, name, category, title, body } : t,
        )
        setTplVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchTemplates],
  )

  const deleteTemplate = useCallback(
    async (id) => {
      if (isLive) {
        const { error } = await supabase.from('notification_templates').delete().eq('id', id)
        if (error) return
        await fetchTemplates()
      } else {
        demoTemplates = demoTemplates.filter((t) => t.id !== id)
        setTplVersion((v) => v + 1)
      }
    },
    [isLive, fetchTemplates],
  )

  const value = useMemo(
    () => ({
      notifications,
      loading,
      isAdmin,
      isRead,
      unreadCount,
      markRead,
      markUnread,
      readCountFor,
      recipientCountFor,
      createNotification,
      updateNotification,
      deleteNotification,
      templates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
    }),
    [
      notifications, loading, isAdmin, isRead, unreadCount, markRead, markUnread, readCountFor,
      recipientCountFor, createNotification, updateNotification, deleteNotification,
      templates, createTemplate, updateTemplate, deleteTemplate,
    ],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider
export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
