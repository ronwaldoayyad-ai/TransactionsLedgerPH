import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useApp } from './AppContext'
import { supabase } from '../supabaseClient'

// Isolated data layer for in-app messaging (borrower ⇄ lender). Mirrors the
// app's dual-mode pattern: live sessions read/write the `messages` table and
// subscribe to Supabase Realtime; demo sessions use a shared in-memory store.
// A "conversation" is keyed by borrower_id; from_admin marks the direction;
// read_at = null means unread by the recipient.

const MessagesContext = createContext(null)

const mapMessage = (r) => ({
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

// Demo store: module-scoped so it survives navigation within the tab.
let demoMessages = []
let demoSeq = 0
const demoId = () => `m-${Date.now()}-${++demoSeq}`

const byTime = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt))

export function MessagesProvider({ children }) {
  const { realSession, session } = useApp()
  const isLive = realSession?.source === 'supabase'
  const me = session?.user ?? null
  const meId = me?.id ?? null
  const isAdmin = me?.role === 'admin'

  const [liveMessages, setLiveMessages] = useState([])
  const [demoVersion, setDemoVersion] = useState(0)
  const [loading, setLoading] = useState(isLive)

  // Messages visible to the current identity (admin: all; borrower: own).
  const messages = useMemo(() => {
    const base = isLive ? liveMessages : demoMessages
    if (!meId) return []
    const scoped = isAdmin ? base : base.filter((m) => m.borrowerId === meId)
    return [...scoped].sort(byTime)
    // demoVersion forces recompute after in-memory mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, liveMessages, demoVersion, meId, isAdmin])

  const fetchMessages = useCallback(async () => {
    if (!isLive || !meId) return
    let q = supabase.from('messages').select('*').order('created_at')
    if (!isAdmin) q = q.eq('borrower_id', meId)
    const { data, error } = await q
    if (error) {
      console.error('[messages] load failed:', error.message)
      return
    }
    setLiveMessages((data ?? []).map(mapMessage))
  }, [isLive, isAdmin, meId])

  // Initial load (live only) — all setState happens after the first await.
  useEffect(() => {
    if (!isLive || !meId) return undefined
    let active = true
    ;(async () => {
      await fetchMessages()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [isLive, meId, fetchMessages])

  // Realtime: refetch on any change the current user is allowed to see.
  useEffect(() => {
    if (!isLive || !meId) return undefined
    const channel = supabase
      .channel(`messages-rt-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchMessages()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [isLive, meId, fetchMessages])

  const sendMessage = useCallback(
    async (borrowerId, body) => {
      const text = String(body ?? '').trim()
      const target = isAdmin ? borrowerId : meId
      if (!text || !target || !meId) return
      if (isLive) {
        const { error } = await supabase
          .from('messages')
          .insert({ borrower_id: target, from_admin: isAdmin, body: text })
        if (error) {
          console.error('[messages] send failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        demoMessages = [
          ...demoMessages,
          {
            id: demoId(),
            borrowerId: target,
            senderId: meId,
            fromAdmin: isAdmin,
            body: text,
            createdAt: new Date().toISOString(),
            readAt: null,
            reactions: {},
            pinned: false,
          },
        ]
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, isAdmin, meId, fetchMessages],
  )

  // Mark every message directed at me in this conversation as read.
  const markRead = useCallback(
    async (borrowerId) => {
      const target = isAdmin ? borrowerId : meId
      if (!target || !meId) return
      const toMeFromAdmin = !isAdmin // borrower reads admin msgs; admin reads borrower msgs
      if (isLive) {
        const { error } = await supabase
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('borrower_id', target)
          .eq('from_admin', toMeFromAdmin)
          .is('read_at', null)
        if (error) {
          console.error('[messages] mark-read failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        const now = new Date().toISOString()
        demoMessages = demoMessages.map((m) =>
          m.borrowerId === target && m.fromAdmin === toMeFromAdmin && !m.readAt
            ? { ...m, readAt: now }
            : m,
        )
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, isAdmin, meId, fetchMessages],
  )

  // Toggle my emoji reaction on a message (one per party; same emoji clears it).
  const reactToMessage = useCallback(
    async (messageId, emoji) => {
      const base = isLive ? liveMessages : demoMessages
      const msg = base.find((m) => m.id === messageId)
      if (!msg) return
      const role = isAdmin ? 'admin' : 'borrower'
      const next = { ...(msg.reactions || {}) }
      if (next[role] === emoji) delete next[role]
      else next[role] = emoji
      if (isLive) {
        const { error } = await supabase.from('messages').update({ reactions: next }).eq('id', messageId)
        if (error) {
          console.error('[messages] react failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        demoMessages = demoMessages.map((m) => (m.id === messageId ? { ...m, reactions: next } : m))
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, isAdmin, liveMessages, fetchMessages],
  )

  // Pin/unpin a message. Pinning makes it the single pinned one in its thread.
  const togglePin = useCallback(
    async (messageId) => {
      const base = isLive ? liveMessages : demoMessages
      const msg = base.find((m) => m.id === messageId)
      if (!msg) return
      const next = !msg.pinned
      if (isLive) {
        if (next) {
          await supabase.from('messages').update({ pinned: false }).eq('borrower_id', msg.borrowerId).eq('pinned', true)
        }
        const { error } = await supabase.from('messages').update({ pinned: next }).eq('id', messageId)
        if (error) {
          console.error('[messages] pin failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        demoMessages = demoMessages.map((m) => {
          if (m.id === messageId) return { ...m, pinned: next }
          if (next && m.borrowerId === msg.borrowerId) return { ...m, pinned: false }
          return m
        })
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, liveMessages, fetchMessages],
  )

  const deleteMessage = useCallback(
    async (messageId) => {
      if (isLive) {
        const { error } = await supabase.from('messages').delete().eq('id', messageId)
        if (error) {
          console.error('[messages] delete failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        demoMessages = demoMessages.filter((m) => m.id !== messageId)
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, fetchMessages],
  )

  // Delete the whole conversation history.
  const clearConversation = useCallback(
    async (borrowerId) => {
      const target = isAdmin ? borrowerId : meId
      if (!target) return
      if (isLive) {
        const { error } = await supabase.from('messages').delete().eq('borrower_id', target)
        if (error) {
          console.error('[messages] clear failed:', error.message)
          return
        }
        await fetchMessages()
      } else {
        demoMessages = demoMessages.filter((m) => m.borrowerId !== target)
        setDemoVersion((v) => v + 1)
      }
    },
    [isLive, isAdmin, meId, fetchMessages],
  )

  // Unread counts (messages directed AT me that are still unread).
  const unreadByBorrower = useMemo(() => {
    const map = {}
    if (!meId) return map
    const toMeFromAdmin = !isAdmin
    messages.forEach((m) => {
      if (m.fromAdmin === toMeFromAdmin && !m.readAt) {
        map[m.borrowerId] = (map[m.borrowerId] ?? 0) + 1
      }
    })
    return map
  }, [messages, isAdmin, meId])

  const unreadTotal = useMemo(
    () => Object.values(unreadByBorrower).reduce((s, n) => s + n, 0),
    [unreadByBorrower],
  )

  const messagesFor = useCallback(
    (borrowerId) => messages.filter((m) => m.borrowerId === borrowerId).sort(byTime),
    [messages],
  )

  const value = useMemo(
    () => ({
      messages,
      loading,
      isAdmin,
      me,
      sendMessage,
      markRead,
      reactToMessage,
      togglePin,
      deleteMessage,
      clearConversation,
      messagesFor,
      unreadByBorrower,
      unreadTotal,
    }),
    [messages, loading, isAdmin, me, sendMessage, markRead, reactToMessage, togglePin, deleteMessage, clearConversation, messagesFor, unreadByBorrower, unreadTotal],
  )

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider
export function useMessages() {
  const ctx = useContext(MessagesContext)
  if (!ctx) throw new Error('useMessages must be used within MessagesProvider')
  return ctx
}
