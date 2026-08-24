import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'
import { playReaction, playReceive } from '../lib/sounds'
import { lightHaptic } from '../lib/haptics'

// Role-aware port of the web MessagesContext. A conversation is keyed by
// borrower_id; from_admin marks direction; read_at null = unread. Borrowers see
// only their own thread (RLS-scoped); admins see every borrower's thread and
// address each one. The borrower-facing API (messages, sendMessage(text),
// markRead(), unreadTotal) is preserved; admin variants take a borrowerId.

const MessagesContext = createContext<any>(null)

const mapMessage = (r: any) => ({
  id: r.id,
  borrowerId: r.borrower_id,
  senderId: r.sender_id,
  fromAdmin: !!r.from_admin,
  body: r.body,
  createdAt: r.created_at,
  readAt: r.read_at ?? null,
  reactions: r.reactions ?? {},
  pinned: !!r.pinned,
})

const byTime = (a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt))

export function MessagesProvider({ children }: { children: ReactNode }) {
  const { session } = useApp()
  const meId = session?.user?.id ?? null
  const isAdmin = session?.user?.role === 'admin'

  const [allMessages, setAllMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Own thread (borrower screens read this). For an admin this is empty — they
  // use messagesFor(borrowerId) instead.
  const messages = useMemo(() => {
    if (!meId) return []
    return allMessages.filter((m) => m.borrowerId === meId).sort(byTime)
  }, [allMessages, meId])

  const messagesFor = useCallback(
    (borrowerId: string) => allMessages.filter((m) => m.borrowerId === borrowerId).sort(byTime),
    [allMessages],
  )

  // RLS scopes rows: borrowers get their own thread, admins get all threads.
  const fetchMessages = useCallback(async () => {
    if (!meId) return
    const { data, error } = await supabase.from('messages').select('*').order('created_at')
    if (error) {
      console.error('[messages] load failed:', error.message)
      return
    }
    setAllMessages((data ?? []).map(mapMessage))
  }, [meId])

  useEffect(() => {
    if (!meId) return undefined
    let active = true
    ;(async () => {
      await fetchMessages()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [meId, fetchMessages])

  const [epoch, setEpoch] = useState(0)
  useEffect(() => {
    if (!meId) return undefined
    const channel = supabase
      .channel(`messages-rt-${meId}-${epoch}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchMessages()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [meId, epoch, fetchMessages])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setEpoch((e) => e + 1)
        fetchMessages()
      }
    })
    return () => sub.remove()
  }, [fetchMessages])

  // Incoming-activity sounds (messages/reactions from the OTHER party).
  const soundRef = useRef<{ meId: string | null; map: Map<string, any> }>({ meId: null, map: new Map() })
  useEffect(() => {
    const prev = soundRef.current
    const snapshot = () => new Map(allMessages.map((m: any) => [m.id, m]))
    if (prev.meId !== meId) {
      soundRef.current = { meId, map: snapshot() }
      return
    }
    const otherKey = isAdmin ? 'borrower' : 'admin'
    allMessages.forEach((m: any) => {
      const before = prev.map.get(m.id)
      const incoming = isAdmin ? !m.fromAdmin : m.fromAdmin
      if (!before) {
        if (incoming) {
          playReceive()
          lightHaptic()
        }
      } else {
        const had = before.reactions || {}
        const now = m.reactions || {}
        if (now[otherKey] && now[otherKey] !== had[otherKey]) playReaction()
      }
    })
    prev.map = snapshot()
  }, [allMessages, meId, isAdmin])

  // Borrower: sendMessage(text). Admin: sendMessage(borrowerId, text).
  const sendMessage = useCallback(
    async (a: string, b?: string) => {
      const borrowerId = b === undefined ? meId : a
      const body = b === undefined ? a : b
      const text = String(body ?? '').trim()
      if (!text || !borrowerId) return
      const { error } = await supabase
        .from('messages')
        .insert({ borrower_id: borrowerId, from_admin: isAdmin, body: text })
      if (error) {
        console.error('[messages] send failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [meId, isAdmin, fetchMessages],
  )

  // Mark the OTHER party's messages in a thread as read.
  const markRead = useCallback(
    async (borrowerId?: string) => {
      const thread = borrowerId ?? meId
      if (!thread) return
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('borrower_id', thread)
        .eq('from_admin', !isAdmin)
        .is('read_at', null)
      if (error) {
        console.error('[messages] mark-read failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [meId, isAdmin, fetchMessages],
  )

  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = allMessages.find((m) => m.id === messageId)
      if (!msg) return
      const key = isAdmin ? 'admin' : 'borrower'
      const next = { ...(msg.reactions || {}) }
      if (next[key] === emoji) delete next[key]
      else next[key] = emoji
      const { error } = await supabase.from('messages').update({ reactions: next }).eq('id', messageId)
      if (error) {
        console.error('[messages] react failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [allMessages, isAdmin, fetchMessages],
  )

  const togglePin = useCallback(
    async (messageId: string) => {
      const msg = allMessages.find((m) => m.id === messageId)
      if (!msg) return
      const next = !msg.pinned
      if (next) {
        await supabase.from('messages').update({ pinned: false }).eq('borrower_id', msg.borrowerId).eq('pinned', true)
      }
      const { error } = await supabase.from('messages').update({ pinned: next }).eq('id', messageId)
      if (error) {
        console.error('[messages] pin failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [allMessages, fetchMessages],
  )

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const { error } = await supabase.from('messages').delete().eq('id', messageId)
      if (error) {
        console.error('[messages] delete failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [fetchMessages],
  )

  const clearConversation = useCallback(
    async (borrowerId?: string) => {
      const thread = borrowerId ?? meId
      if (!thread) return
      const { error } = await supabase.from('messages').delete().eq('borrower_id', thread)
      if (error) {
        console.error('[messages] clear failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [meId, fetchMessages],
  )

  // Per-borrower unread counts (admin) — unread = borrower messages not yet read.
  const unreadByBorrower = useMemo(() => {
    const map: Record<string, number> = {}
    if (!isAdmin) return map
    allMessages.forEach((m) => {
      if (!m.fromAdmin && !m.readAt) map[m.borrowerId] = (map[m.borrowerId] ?? 0) + 1
    })
    return map
  }, [allMessages, isAdmin])

  const unreadTotal = useMemo(() => {
    if (isAdmin) return allMessages.filter((m) => !m.fromAdmin && !m.readAt).length
    return messages.filter((m: any) => m.fromAdmin && !m.readAt).length
  }, [isAdmin, allMessages, messages])

  const value = useMemo(
    () => ({
      messages,
      messagesFor,
      loading,
      sendMessage,
      markRead,
      reactToMessage,
      togglePin,
      deleteMessage,
      clearConversation,
      unreadByBorrower,
      unreadTotal,
    }),
    [
      messages,
      messagesFor,
      loading,
      sendMessage,
      markRead,
      reactToMessage,
      togglePin,
      deleteMessage,
      clearConversation,
      unreadByBorrower,
      unreadTotal,
    ],
  )

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
}

export function useMessages() {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessages must be used within MessagesProvider')
  return ctx
}
