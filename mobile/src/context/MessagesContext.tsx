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

// Borrower-only port of the web MessagesContext: reads/writes the `messages`
// table, subscribes to Supabase Realtime, refetch-on-any-event. A conversation
// is keyed by borrower_id; from_admin marks direction; read_at null = unread.

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

  const [liveMessages, setLiveMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const messages = useMemo(() => {
    if (!meId) return []
    return liveMessages.filter((m) => m.borrowerId === meId).sort(byTime)
  }, [liveMessages, meId])

  const fetchMessages = useCallback(async () => {
    if (!meId) return
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('borrower_id', meId)
      .order('created_at')
    if (error) {
      console.error('[messages] load failed:', error.message)
      return
    }
    setLiveMessages((data ?? []).map(mapMessage))
  }, [meId])

  // Initial load — setState only after the first await (web pattern).
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

  // Realtime + mobile resilience: the socket dies while backgrounded, so on
  // return to foreground we resubscribe (keyed by `epoch`) and refetch.
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
        setEpoch((e) => e + 1) // fresh channel
        fetchMessages() // catch up on anything missed
      }
    })
    return () => sub.remove()
  }, [fetchMessages])

  // Sounds for INCOMING activity (admin messages / admin reactions). My own
  // send/reaction sounds play locally in the chat screen. Baselines are
  // snapshotted silently on identity change (web parity).
  const soundRef = useRef<{ meId: string | null; map: Map<string, any> }>({
    meId: null,
    map: new Map(),
  })
  useEffect(() => {
    const prev = soundRef.current
    const snapshot = () => new Map(messages.map((m: any) => [m.id, m]))
    if (prev.meId !== meId) {
      soundRef.current = { meId, map: snapshot() }
      return
    }
    messages.forEach((m: any) => {
      const before = prev.map.get(m.id)
      if (!before) {
        if (m.fromAdmin) {
          playReceive()
          lightHaptic()
        }
      } else {
        const had = before.reactions || {}
        const now = m.reactions || {}
        if (now.admin && now.admin !== had.admin) playReaction()
      }
    })
    prev.map = snapshot()
  }, [messages, meId])

  const sendMessage = useCallback(
    async (body: string) => {
      const text = String(body ?? '').trim()
      if (!text || !meId) return
      const { error } = await supabase
        .from('messages')
        .insert({ borrower_id: meId, from_admin: false, body: text })
      if (error) {
        console.error('[messages] send failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [meId, fetchMessages],
  )

  // Mark every admin message in my thread as read.
  const markRead = useCallback(async () => {
    if (!meId) return
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('borrower_id', meId)
      .eq('from_admin', true)
      .is('read_at', null)
    if (error) {
      console.error('[messages] mark-read failed:', error.message)
      return
    }
    await fetchMessages()
  }, [meId, fetchMessages])

  // Toggle my emoji reaction (one per party; same emoji clears it).
  const reactToMessage = useCallback(
    async (messageId: string, emoji: string) => {
      const msg = liveMessages.find((m) => m.id === messageId)
      if (!msg) return
      const next = { ...(msg.reactions || {}) }
      if (next.borrower === emoji) delete next.borrower
      else next.borrower = emoji
      const { error } = await supabase
        .from('messages')
        .update({ reactions: next })
        .eq('id', messageId)
      if (error) {
        console.error('[messages] react failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [liveMessages, fetchMessages],
  )

  // Pin/unpin — pinning makes it the single pinned message in the thread.
  const togglePin = useCallback(
    async (messageId: string) => {
      const msg = liveMessages.find((m) => m.id === messageId)
      if (!msg) return
      const next = !msg.pinned
      if (next) {
        await supabase
          .from('messages')
          .update({ pinned: false })
          .eq('borrower_id', msg.borrowerId)
          .eq('pinned', true)
      }
      const { error } = await supabase
        .from('messages')
        .update({ pinned: next })
        .eq('id', messageId)
      if (error) {
        console.error('[messages] pin failed:', error.message)
        return
      }
      await fetchMessages()
    },
    [liveMessages, fetchMessages],
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

  const clearConversation = useCallback(async () => {
    if (!meId) return
    const { error } = await supabase.from('messages').delete().eq('borrower_id', meId)
    if (error) {
      console.error('[messages] clear failed:', error.message)
      return
    }
    await fetchMessages()
  }, [meId, fetchMessages])

  const unreadTotal = useMemo(
    () => messages.filter((m: any) => m.fromAdmin && !m.readAt).length,
    [messages],
  )

  const value = useMemo(
    () => ({
      messages,
      loading,
      sendMessage,
      markRead,
      reactToMessage,
      togglePin,
      deleteMessage,
      clearConversation,
      unreadTotal,
    }),
    [
      messages,
      loading,
      sendMessage,
      markRead,
      reactToMessage,
      togglePin,
      deleteMessage,
      clearConversation,
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
