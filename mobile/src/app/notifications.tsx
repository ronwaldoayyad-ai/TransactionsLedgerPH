import { useMemo, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { AlertCircle, Check, EyeOff, FileText, Mail, Send, Users, Wallet } from 'lucide-react-native'
import { useNotifications } from '../context/NotificationsContext'
import { useMessages } from '../context/MessagesContext'
import { formatDate } from '../lib/amortization'
import { NOTIFICATION_CATEGORIES, categoryMeta, isImageAttachment, buildReplyQuote, relTime } from '../lib/notifications'
import { QUICK_REACTIONS } from '../lib/emoji'
import EmptyState from '../components/ui/EmptyState'
import FadeInView from '../components/ui/FadeInView'
import { Card } from '../components/ui/Card'
import { colors, fonts } from '../theme'

const CAT_ICON: Record<string, any> = { wallet: Wallet, file: FileText, users: Users, alert: AlertCircle }

function CategoryChip({ category }: { category: string }) {
  const m = categoryMeta(category)
  const Ico = CAT_ICON[m.iconKey] ?? AlertCircle
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${m.bg}`}>
      <Ico size={11} color="#334155" />
      <Text className={`font-sans-semibold text-[11px] ${m.text}`}>{m.label}</Text>
    </View>
  )
}

function NotifRow({
  n,
  read,
  first,
  onMarkRead,
  onMarkUnread,
  onReply,
  onReact,
}: {
  n: any
  read: boolean
  first: boolean
  onMarkRead: (id: string) => void
  onMarkUnread: (id: string) => void
  onReply: (n: any, text: string) => Promise<void>
  onReact: (n: any, emoji: string) => Promise<any>
}) {
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [reacted, setReacted] = useState<string | null>(null)

  const expand = () => {
    const next = !open
    setOpen(next)
    if (next && !read) onMarkRead(n.id)
  }
  const send = async () => {
    const text = reply.trim()
    if (!text) return
    setSending(true)
    await onReply(n, text)
    setSending(false)
    setReply('')
    setSent(true)
    if (!read) onMarkRead(n.id)
  }
  const react = async (emoji: string) => {
    const res = await onReact(n, emoji)
    if (!res?.error) {
      setReacted(emoji)
      if (!read) onMarkRead(n.id)
    }
  }

  return (
    <View className={`px-4 py-3.5 ${first ? '' : 'border-t border-slate-100'} ${read ? '' : 'border-l-4 border-l-navy-500 bg-navy-50/40'}`}>
      <View className="flex-row items-start gap-2">
        <Pressable onPress={expand} className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <CategoryChip category={n.category} />
            {n.title ? (
              <Text className={`text-sm ${read ? 'font-sans-medium text-slate-800' : 'font-sans-bold text-slate-900'}`}>{n.title}</Text>
            ) : null}
            <Text className="ml-auto font-sans text-[11px] text-slate-400">{relTime(n.createdAt)}</Text>
          </View>
          <Text className="mt-1 font-sans text-sm text-slate-600" numberOfLines={open ? undefined : 2}>
            {n.body}
          </Text>
          {n.createdAt ? (
            <Text className="mt-1.5 font-sans text-[11px] text-slate-400">{formatDate(n.createdAt)}</Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => (read ? onMarkUnread(n.id) : onMarkRead(n.id))}
          hitSlop={8}
          accessibilityLabel={read ? 'Mark as unread' : 'Mark as read'}
          className="rounded-lg p-1.5"
        >
          {read ? <EyeOff size={16} color={colors.slate500} /> : <Check size={16} color={colors.navy700} />}
        </Pressable>
      </View>

      {/* Attachments (images) */}
      {open && Array.isArray(n.attachments) && n.attachments.length > 0 && (
        <View className="mt-3 flex-row flex-wrap gap-2 pl-1">
          {n.attachments.map((a: any, i: number) =>
            isImageAttachment(a) ? (
              <Image key={i} source={{ uri: a.dataUrl }} className="h-24 w-32 rounded-lg" resizeMode="cover" />
            ) : (
              <View key={i} className="flex-row items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <FileText size={16} color={colors.navy700} />
                <Text className="max-w-[10rem] font-sans-medium text-sm text-navy-700" numberOfLines={1}>{a.name}</Text>
              </View>
            ),
          )}
        </View>
      )}

      {/* Quick reactions — notifies your lender */}
      <View className="mt-2.5 flex-row flex-wrap items-center gap-1.5 pl-1">
        {QUICK_REACTIONS.map((emoji: string) => (
          <Pressable
            key={emoji}
            onPress={() => react(emoji)}
            className={`rounded-full border px-2 py-0.5 ${reacted === emoji ? 'border-navy-300 bg-navy-50' : 'border-slate-200 bg-white'}`}
          >
            <Text className="text-base leading-tight">{emoji}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            setOpen(true)
            setSent(false)
            if (!read) onMarkRead(n.id)
          }}
          className="flex-row items-center gap-1 rounded-lg border border-navy-200 bg-navy-50 px-2.5 py-1"
        >
          <Mail size={14} color={colors.navy800} />
          <Text className="font-sans-medium text-xs text-navy-800">Reply</Text>
        </Pressable>
        {reacted ? <Text className="font-sans-medium text-[11px] text-emerald-700">Sent {reacted}</Text> : null}
      </View>

      {/* Reply composer */}
      {open && (
        <View className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {sent ? (
            <View className="flex-row items-center gap-2">
              <Check size={16} color="#059669" />
              <Text className="font-sans-medium text-[13px] text-emerald-700">Reply sent to your lender.</Text>
              <Pressable onPress={() => setSent(false)}>
                <Text className="font-sans-medium text-[13px] text-navy-700">Reply again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextInput
                value={reply}
                onChangeText={setReply}
                placeholder="Type your reply…"
                multiline
                className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-800"
              />
              <View className="mt-2 flex-row items-center justify-end">
                <Pressable
                  onPress={send}
                  disabled={!reply.trim() || sending}
                  className={`flex-row items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 ${!reply.trim() || sending ? 'opacity-50' : ''}`}
                >
                  <Send size={14} color="#ffffff" />
                  <Text className="font-sans-semibold text-sm text-white">{sending ? 'Sending…' : 'Send reply'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  )
}

// Borrower Notification Center — mirrors the web borrower Notifications page:
// filter chips, read/unread, quick reactions + reply (both notify the admin).
export default function BorrowerNotifications() {
  const { notifications, isRead, markRead, markUnread, unreadCount, notifyAdmins, refreshNotifications, loading } =
    useNotifications()
  const { sendMessage } = useMessages()
  const [filter, setFilter] = useState('all')

  const presentCategories = useMemo(() => {
    const set = new Set(notifications.map((n: any) => n.category))
    return NOTIFICATION_CATEGORIES.filter((c) => set.has(c.value))
  }, [notifications])

  const visible = useMemo(() => {
    if (filter === 'all') return notifications
    if (filter === 'unread') return notifications.filter((n: any) => !isRead(n.id))
    return notifications.filter((n: any) => n.category === filter)
  }, [notifications, filter, isRead])

  const onReply = async (n: any, text: string) => {
    await sendMessage(buildReplyQuote(n) + text)
    await notifyAdmins({
      category: n.category,
      title: n.title ? `Reply: ${n.title}` : 'Reply from borrower',
      body: `${buildReplyQuote(n)}${text}`,
    })
  }
  const onReact = (n: any, emoji: string) =>
    notifyAdmins({
      category: n.category,
      title: `Reacted ${emoji}`,
      body: `${emoji} — reacted to your notification${n.title ? ` “${n.title}”` : ''}.`,
    })

  const chips: { value: string; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'unread', label: 'Unread', count: unreadCount },
    ...presentCategories.map((c) => ({ value: c.value, label: c.label, count: notifications.filter((n: any) => n.category === c.value).length })),
  ]

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Notifications', headerTitleStyle: { fontFamily: fonts.sansSemibold } }} />
      <ScrollView
        contentContainerClassName="gap-3 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshNotifications} tintColor={colors.navy600} />}
      >
        <FadeInView className="flex-row flex-wrap gap-2">
          {chips.map((c) => {
            const active = filter === c.value
            return (
              <Pressable
                key={c.value}
                onPress={() => setFilter(c.value)}
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? 'border-navy-300 bg-navy-800' : 'border-slate-200 bg-white'}`}
              >
                <Text className={`font-sans-medium text-sm ${active ? 'text-white' : 'text-slate-600'}`}>{c.label}</Text>
                {c.count > 0 ? (
                  <View className={`rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                    <Text className={`font-sans-semibold text-[11px] ${active ? 'text-white' : 'text-slate-600'}`}>{c.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </FadeInView>

        <FadeInView delay={60}>
          <Card className="overflow-hidden p-0">
            {visible.length === 0 ? (
              <EmptyState title={filter === 'all' ? 'No notifications yet' : 'Nothing here'} body="Notifications from your lender will appear here." />
            ) : (
              visible.map((n: any, idx: number) => (
                <NotifRow
                  key={n.id}
                  n={n}
                  first={idx === 0}
                  read={isRead(n.id)}
                  onMarkRead={markRead}
                  onMarkUnread={markUnread}
                  onReply={onReply}
                  onReact={onReact}
                />
              ))
            )}
          </Card>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  )
}
