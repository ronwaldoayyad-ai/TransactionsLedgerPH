import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useApp } from './AppContext'
import { supabase } from '../lib/supabase'

// Notification Center data layer (mobile). Mirrors the web NotificationsContext.
// Live sessions read/write `notifications` + `notification_reads` and subscribe
// to Realtime; demo sessions use a shared in-memory store. Read state is
// per-borrower. Borrowers raise reactions/replies to admins via notify_admins
// (SECURITY DEFINER RPC in live mode).

const NotificationsContext = createContext<any>(null)

const mapNotification = (r: any) => ({
  id: r.id,
  category: r.category,
  title: r.title ?? '',
  body: r.body ?? '',
  audience: r.audience,
  targetUserIds: r.target_user_ids ?? [],
  attachments: r.attachments ?? [],
  createdBy: r.created_by ?? null,
  createdAt: r.created_at ?? null,
})
const mapRead = (r: any) => ({
  notificationId: r.notification_id,
  userId: r.user_id,
  readAt: r.read_at ?? null,
})

// Demo stores (module-scoped so they survive navigation).
const seedIso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toISOString()
let demoNotifications: any[] = [
  {
    id: 'n-seed-disb-1',
    category: 'general',
    title: '💸 Loan Disbursement Ready',
    body: 'Your loan disbursement DISB-2026-0001 (net PHP 608,333.33) is ready for your review and acceptance.',
    audience: 'targeted',
    targetUserIds: ['u-001'],
    attachments: [],
    createdBy: 'admin-1',
    createdAt: seedIso(0),
  },
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
let demoReads: any[] = []
let demoSeq = 0
const demoId = () => `n-${Date.now()}-${++demoSeq}`

const targetsMe = (n: any, meId: string) => n.audience === 'all' || (n.targetUserIds || []).includes(meId)
const byRecent = (a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { realSession, session, users } = useApp()
  const isLive = realSession?.source === 'supabase'
  const meId = session?.user?.id ?? null
  const isAdmin = session?.user?.role === 'admin'

  const [liveNotifications, setLiveNotifications] = useState<any[]>([])
  const [liveReads, setLiveReads] = useState<any[]>([])
  const [demoVersion, setDemoVersion] = useState(0)
  const [loading, setLoading] = useState(isLive)

  const borrowerCount = useMemo(() => users.filter((u: any) => u.role === 'user').length, [users])

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

  const notifications = useMemo(() => {
    if (!meId) return []
    const base = isLive ? liveNotifications : demoNotifications
    const scoped = isAdmin || isLive ? base : base.filter((n) => targetsMe(n, meId))
    return [...scoped].sort(byRecent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveNotifications, demoVersion, meId, isAdmin])

  const reads = isLive ? liveReads : demoReads

  const myReadIds = useMemo(() => {
    const s = new Set<string>()
    if (!meId) return s
    reads.forEach((r) => {
      if (r.userId === meId) s.add(r.notificationId)
    })
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reads, meId, demoVersion])

  const isRead = useCallback((id: string) => myReadIds.has(id), [myReadIds])

  const inboxNotifications = useMemo(() => {
    if (!meId) return []
    return notifications.filter((n) => (n.targetUserIds || []).includes(meId) && n.createdBy !== meId)
  }, [notifications, meId])

  const unreadCount = useMemo(() => {
    const list = isAdmin ? inboxNotifications : notifications
    return list.reduce((s: number, n: any) => s + (myReadIds.has(n.id) ? 0 : 1), 0)
  }, [isAdmin, inboxNotifications, notifications, myReadIds])

  const readCountFor = useCallback(
    (id: string) => {
      const set = new Set<string>()
      reads.forEach((r) => {
        if (r.notificationId === id) set.add(r.userId)
      })
      return set.size
    },
    [reads],
  )

  const recipientCountFor = useCallback(
    (n: any) => (n.audience === 'all' ? borrowerCount : (n.targetUserIds || []).length),
    [borrowerCount],
  )

  const markRead = useCallback(
    async (id: string) => {
      if (!meId) return
      if (isLive) {
        const { error } = await supabase
          .from('notification_reads')
          .upsert({ notification_id: id, user_id: meId, read_at: new Date().toISOString() }, { onConflict: 'notification_id,user_id' })
        if (error) {
          console.error('[notifications] mark-read failed:', error.message)
          return
        }
        await fetchReads()
      } else if (!demoReads.some((r) => r.notificationId === id && r.userId === meId)) {
        demoReads = [...demoReads, { notificationId: id, userId: meId, readAt: new Date().toISOString() }]
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, meId, fetchReads],
  )

  const markUnread = useCallback(
    async (id: string) => {
      if (!meId) return
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
    [isLive, meId, fetchReads],
  )

  const createNotification = useCallback(
    async ({ category, title = '', body, audience = 'all', targetUserIds = [], attachments = [] }: any) => {
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
          { id: demoId(), category, title, body, audience, targetUserIds: ids, attachments, createdBy: meId, createdAt: new Date().toISOString() },
          ...demoNotifications,
        ]
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, meId, fetchAll],
  )

  const notifyAdmins = useCallback(
    async ({ category = 'general', title = '', body }: any) => {
      if (!body || !body.trim()) return { error: 'Message is required.' }
      if (isLive) {
        const { error } = await supabase.rpc('notify_admins', { p_category: category, p_title: title, p_body: body })
        if (error) {
          console.error('[notifications] notify_admins failed:', error.message)
          return { error: error.message }
        }
        await fetchAll()
      } else {
        const adminIds = users.filter((u: any) => u.role === 'admin').map((u: any) => u.id)
        if (adminIds.length === 0) adminIds.push('admin-1')
        demoNotifications = [
          { id: demoId(), category, title, body, audience: 'targeted', targetUserIds: adminIds, attachments: [], createdBy: meId, createdAt: new Date().toISOString() },
          ...demoNotifications,
        ]
        setDemoVersion((v) => v + 1)
      }
      return {}
    },
    [isLive, fetchAll, users, meId],
  )

  const deleteNotification = useCallback(
    async (id: string) => {
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

  const value = useMemo(
    () => ({
      notifications,
      inboxNotifications,
      loading,
      isAdmin,
      isRead,
      unreadCount,
      markRead,
      markUnread,
      readCountFor,
      recipientCountFor,
      createNotification,
      notifyAdmins,
      deleteNotification,
      refreshNotifications: fetchAll,
    }),
    [
      notifications, inboxNotifications, loading, isAdmin, isRead, unreadCount, markRead, markUnread,
      readCountFor, recipientCountFor, createNotification, notifyAdmins, deleteNotification, fetchAll,
    ],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
