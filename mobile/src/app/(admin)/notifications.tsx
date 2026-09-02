import { useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertCircle, Check, FileText, Inbox, Send, Trash2, Users, Wallet } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useNotifications } from '../../context/NotificationsContext'
import { NOTIFICATION_CATEGORIES, categoryMeta, relTime } from '../../lib/notifications'
import FadeInView from '../../components/ui/FadeInView'
import EmptyState from '../../components/ui/EmptyState'
import { Card, CardHeader } from '../../components/ui/Card'
import { colors } from '../../theme'

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

type Tab = 'inbox' | 'sent' | 'compose'

// Admin Notification Center — mirrors the web admin page (scoped to mobile):
// Inbox (borrower reactions/replies), Sent (with read counts), and a Compose
// tab (category, title, body, audience all/targeted). Attachments + templates
// remain web-only.
export default function AdminNotifications() {
  const { users, refreshing, refreshData } = useApp()
  const {
    notifications,
    inboxNotifications,
    isRead,
    markRead,
    unreadCount,
    readCountFor,
    recipientCountFor,
    createNotification,
    deleteNotification,
  } = useNotifications()

  const nameOf = (id: string) => users.find((u: any) => u.id === id)?.name ?? id
  const borrowers = useMemo(() => users.filter((u: any) => u.role === 'user'), [users])

  const [tab, setTab] = useState<Tab>('inbox')

  const inboxIds = useMemo(() => new Set(inboxNotifications.map((n: any) => n.id)), [inboxNotifications])
  const sent = useMemo(() => notifications.filter((n: any) => !inboxIds.has(n.id)), [notifications, inboxIds])

  // Compose state
  const [category, setCategory] = useState('general')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'all' | 'targeted'>('all')
  const [targetSel, setTargetSel] = useState<Set<string>>(() => new Set())
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  const toggleTarget = (id: string) =>
    setTargetSel((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const composeReply = (n: any) => {
    setCategory(n.category ?? 'general')
    setTitle(n.title ? `Re: ${n.title}` : 'Reply')
    setBody('')
    setAudience('targeted')
    setTargetSel(new Set(n.createdBy ? [n.createdBy] : []))
    setTab('compose')
  }

  const canSend = body.trim().length > 0 && (audience === 'all' || targetSel.size > 0)
  const send = async () => {
    if (!canSend || sending) return
    setSending(true)
    const { error } = await createNotification({
      category,
      title: title.trim(),
      body: body.trim(),
      audience,
      targetUserIds: [...targetSel],
    })
    setSending(false)
    if (error) {
      setNotice(error)
      return
    }
    setTitle('')
    setBody('')
    setTargetSel(new Set())
    setAudience('all')
    setNotice('Notification sent.')
    setTab('sent')
    setTimeout(() => setNotice(''), 4000)
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'inbox', label: 'Inbox', badge: unreadCount },
    { key: 'sent', label: 'Sent' },
    { key: 'compose', label: 'Compose' },
  ]

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />}
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Notifications</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Send updates to borrowers and see their replies and reactions.
          </Text>
        </FadeInView>

        {/* Tabs */}
        <FadeInView delay={40} className="flex-row rounded-2xl bg-white p-1">
          {tabs.map((t) => {
            const active = tab === t.key
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2 ${active ? 'bg-navy-800' : ''}`}>
                <Text className={`font-sans-semibold text-sm ${active ? 'text-white' : 'text-slate-600'}`}>{t.label}</Text>
                {t.badge ? (
                  <View className={`rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-red-500'}`}>
                    <Text className="font-sans-semibold text-[11px] text-white">{t.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </FadeInView>

        {notice ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
            <Check size={16} color="#059669" />
            <Text className="font-sans-medium text-sm text-emerald-700">{notice}</Text>
          </View>
        ) : null}

        {/* INBOX */}
        {tab === 'inbox' && (
          <FadeInView delay={60}>
            <Card className="overflow-hidden p-0">
              {inboxNotifications.length === 0 ? (
                <EmptyState title="No replies yet" body="Borrower reactions and replies will appear here." />
              ) : (
                inboxNotifications.map((n: any, idx: number) => {
                  const read = isRead(n.id)
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => !read && markRead(n.id)}
                      className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''} ${read ? '' : 'border-l-4 border-l-navy-500 bg-navy-50/40'}`}
                    >
                      <View className="flex-row flex-wrap items-center gap-2">
                        <CategoryChip category={n.category} />
                        <Text className="font-sans-semibold text-sm text-slate-900">{nameOf(n.createdBy)}</Text>
                        <Text className="ml-auto font-sans text-[11px] text-slate-400">{relTime(n.createdAt)}</Text>
                      </View>
                      {n.title ? <Text className="mt-1 font-sans-medium text-sm text-slate-800">{n.title}</Text> : null}
                      <Text className="mt-0.5 font-sans text-sm text-slate-600">{n.body}</Text>
                      <Pressable onPress={() => composeReply(n)} className="mt-2 flex-row items-center gap-1.5 self-start rounded-lg border border-navy-200 bg-navy-50 px-2.5 py-1">
                        <Send size={13} color={colors.navy800} />
                        <Text className="font-sans-medium text-xs text-navy-800">Reply</Text>
                      </Pressable>
                    </Pressable>
                  )
                })
              )}
            </Card>
          </FadeInView>
        )}

        {/* SENT */}
        {tab === 'sent' && (
          <FadeInView delay={60}>
            <Card className="overflow-hidden p-0">
              {sent.length === 0 ? (
                <EmptyState title="Nothing sent yet" body="Notifications you send to borrowers will appear here." />
              ) : (
                sent.map((n: any, idx: number) => (
                  <View key={n.id} className={`px-4 py-3.5 ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                    <View className="flex-row flex-wrap items-center gap-2">
                      <CategoryChip category={n.category} />
                      {n.title ? <Text className="font-sans-medium text-sm text-slate-800">{n.title}</Text> : null}
                      <Text className="ml-auto font-sans text-[11px] text-slate-400">{relTime(n.createdAt)}</Text>
                    </View>
                    <Text className="mt-1 font-sans text-sm text-slate-600" numberOfLines={3}>{n.body}</Text>
                    <View className="mt-2 flex-row items-center justify-between">
                      <Text className="font-sans text-[11px] text-slate-500">
                        {n.audience === 'all' ? 'All borrowers' : `${(n.targetUserIds || []).length} targeted`} · {readCountFor(n.id)}/{recipientCountFor(n)} read
                      </Text>
                      <Pressable onPress={() => deleteNotification(n.id)} hitSlop={8} className="rounded-lg p-1.5">
                        <Trash2 size={15} color="#dc2626" />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </FadeInView>
        )}

        {/* COMPOSE */}
        {tab === 'compose' && (
          <FadeInView delay={60}>
            <Card>
              <CardHeader title="New notification" subtitle="Sent to borrowers instantly" />
              <View className="gap-3 p-4">
                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs uppercase tracking-wide text-slate-500">Category</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {NOTIFICATION_CATEGORIES.map((c) => {
                      const active = category === c.value
                      return (
                        <Pressable key={c.value} onPress={() => setCategory(c.value)} className={`rounded-full border px-2.5 py-1 ${active ? 'border-navy-700 bg-navy-800' : 'border-slate-300 bg-white'}`}>
                          <Text className={`font-sans-medium text-xs ${active ? 'text-white' : 'text-slate-600'}`}>{c.label}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs uppercase tracking-wide text-slate-500">Title (optional)</Text>
                  <TextInput value={title} onChangeText={setTitle} placeholder="Short title" className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-sans text-sm text-slate-900" />
                </View>

                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs uppercase tracking-wide text-slate-500">Message</Text>
                  <TextInput value={body} onChangeText={setBody} placeholder="Write your message…" multiline className="min-h-[96px] rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-sans text-sm text-slate-900" />
                </View>

                <View>
                  <Text className="mb-1.5 font-sans-medium text-xs uppercase tracking-wide text-slate-500">Audience</Text>
                  <View className="flex-row gap-1.5">
                    <Pressable onPress={() => setAudience('all')} className={`flex-1 items-center rounded-xl border py-2 ${audience === 'all' ? 'border-navy-700 bg-navy-800' : 'border-slate-300 bg-white'}`}>
                      <Text className={`font-sans-medium text-sm ${audience === 'all' ? 'text-white' : 'text-slate-600'}`}>All borrowers</Text>
                    </Pressable>
                    <Pressable onPress={() => setAudience('targeted')} className={`flex-1 items-center rounded-xl border py-2 ${audience === 'targeted' ? 'border-navy-700 bg-navy-800' : 'border-slate-300 bg-white'}`}>
                      <Text className={`font-sans-medium text-sm ${audience === 'targeted' ? 'text-white' : 'text-slate-600'}`}>Select borrowers</Text>
                    </Pressable>
                  </View>
                </View>

                {audience === 'targeted' && (
                  <View className="flex-row flex-wrap gap-1.5">
                    {borrowers.map((b: any) => {
                      const on = targetSel.has(b.id)
                      return (
                        <Pressable key={b.id} onPress={() => toggleTarget(b.id)} className={`rounded-full border px-2.5 py-1 ${on ? 'border-navy-700 bg-navy-800' : 'border-slate-300 bg-white'}`}>
                          <Text className={`font-sans-medium text-xs ${on ? 'text-white' : 'text-slate-600'}`}>{b.name}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}

                <Pressable onPress={send} disabled={!canSend || sending} className={`mt-1 flex-row items-center justify-center gap-2 rounded-xl bg-navy-800 py-3 ${!canSend || sending ? 'opacity-50' : ''}`}>
                  <Send size={16} color="#ffffff" />
                  <Text className="font-sans-semibold text-sm text-white">{sending ? 'Sending…' : 'Send notification'}</Text>
                </Pressable>
              </View>
            </Card>
          </FadeInView>
        )}

        <View className="h-2" />
        <View className="flex-row items-center justify-center gap-2 opacity-60">
          <Inbox size={13} color={colors.slate500} />
          <Text className="font-sans text-[11px] text-slate-500">Attachments &amp; templates are managed on the web app.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
