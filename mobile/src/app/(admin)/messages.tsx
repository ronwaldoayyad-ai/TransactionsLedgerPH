import { useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronLeft, Mail, Send, Trash2 } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { isReceivable } from '../../lib/transactions'
import { toISODate } from '../../lib/amortization'
import { playSend } from '../../lib/sounds'
import { lightHaptic } from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import EmptyState from '../../components/ui/EmptyState'
import { colors, fonts } from '../../theme'

const timeShort = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

export default function AdminMessages() {
  const { users, transactions } = useApp()
  const { messagesFor, sendMessage, markRead, clearConversation, unreadByBorrower } = useMessages()
  const today = toISODate(new Date())

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const { active, archived } = useMemo(() => {
    const borrowers = users.filter((u: any) => u.role === 'user')
    const hasReceivable = (id: string) => transactions.some((t: any) => t.userId === id && isReceivable(t, today))
    return {
      active: borrowers.filter((b: any) => hasReceivable(b.id)),
      archived: borrowers.filter((b: any) => !hasReceivable(b.id)),
    }
  }, [users, transactions, today])

  const selected = users.find((u: any) => u.id === selectedId) ?? null
  const thread = selectedId ? messagesFor(selectedId) : []
  const inverted = useMemo(() => [...thread].reverse(), [thread])

  useEffect(() => {
    if (selectedId && (unreadByBorrower[selectedId] ?? 0) > 0) markRead(selectedId)
  }, [selectedId, unreadByBorrower, markRead])

  const send = async () => {
    const text = draft.trim()
    if (!text || !selectedId) return
    setDraft('')
    playSend()
    lightHaptic()
    await sendMessage(selectedId, text)
  }

  const confirmClear = () =>
    Alert.alert('Clear conversation?', `Delete the entire chat with ${selected?.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => clearConversation(selectedId!) },
    ])

  // --- Conversation view ---
  if (selected) {
    return (
      <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-row items-center gap-2 border-b border-slate-200 bg-white px-3 py-3">
            <Pressable onPress={() => setSelectedId(null)} className="p-1" accessibilityLabel="Back">
              <ChevronLeft size={24} color={colors.navy800} />
            </Pressable>
            <Avatar name={selected.name} url={selected.avatarUrl} size={38} />
            <View className="min-w-0 flex-1">
              <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>
                {selected.name}
              </Text>
              <Text className="font-sans text-xs text-slate-500" numberOfLines={1}>
                {selected.email}
              </Text>
            </View>
            {thread.length > 0 ? (
              <Pressable onPress={confirmClear} className="p-2" accessibilityLabel="Clear conversation">
                <Trash2 size={18} color={colors.slate500} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            inverted
            data={inverted}
            keyExtractor={(m: any) => m.id}
            className="flex-1"
            contentContainerClassName="py-3"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: m }: { item: any }) => {
              const mine = m.fromAdmin
              return (
                <View className={`flex-row px-3 ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}>
                  <View
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                      mine ? 'bg-navy-800' : 'border border-slate-200 bg-white'
                    }`}
                  >
                    <Text className={`font-sans text-[15px] leading-[21px] ${mine ? 'text-white' : 'text-slate-800'}`}>
                      {m.body}
                    </Text>
                    <Text className={`mt-1 self-end font-sans text-[10px] ${mine ? 'text-navy-200' : 'text-slate-400'}`}>
                      {timeShort(m.createdAt)}
                    </Text>
                  </View>
                </View>
              )
            }}
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  icon={<Mail size={20} color={colors.slate500} />}
                  title={`Message ${selected.name.split(' ')[0]}`}
                  body="Start the conversation — your borrower will be notified."
                />
              </View>
            }
          />

          <View className="flex-row items-end gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Message ${selected.name.split(' ')[0]}…`}
              placeholderTextColor="#94a3b8"
              multiline
              style={{
                flex: 1,
                maxHeight: 110,
                fontFamily: fonts.sans,
                fontSize: 15,
                color: '#0f172a',
                backgroundColor: '#f1f5f9',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
              cursorColor={colors.navy800}
            />
            <Pressable
              onPress={send}
              disabled={!draft.trim()}
              className={`h-10 w-10 items-center justify-center rounded-full ${draft.trim() ? 'bg-gold-500' : 'bg-slate-200'}`}
              accessibilityLabel="Send message"
            >
              <Send size={17} color={draft.trim() ? '#ffffff' : '#94a3b8'} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  // --- Borrower list ---
  const groups: [string, string, any[]][] = [
    ['active', 'Active Loans', active],
    ['archived', 'Archived', archived],
  ]

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <View className="border-b border-slate-200 bg-white px-4 py-3">
        <Text className="font-sans-bold text-xl text-slate-900">Messages</Text>
        <Text className="font-sans text-xs text-slate-500">Direct conversations with your borrowers.</Text>
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g[0]}
        contentContainerClassName="pb-8"
        renderItem={({ item: [key, label, list] }) => (
          <View>
            <Text className="bg-slate-50 px-4 py-2 font-sans-semibold text-xs uppercase tracking-wide text-slate-500">
              {label}
            </Text>
            {list.length === 0 ? (
              <Text className="px-4 py-3 font-sans text-xs text-slate-400">No borrowers.</Text>
            ) : (
              list.map((b: any) => {
                const unread = unreadByBorrower[b.id] ?? 0
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setSelectedId(b.id)}
                    className="flex-row items-center gap-3 border-b border-slate-100 bg-white px-4 py-3 active:bg-slate-50"
                  >
                    <Avatar name={b.name} url={b.avatarUrl} size={40} />
                    <Text
                      className={`min-w-0 flex-1 text-sm ${unread ? 'font-sans-bold text-slate-900' : 'font-sans-medium text-slate-800'}`}
                      numberOfLines={1}
                    >
                      {b.name}
                    </Text>
                    {unread > 0 ? (
                      <View className="h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5">
                        <Text className="font-sans-semibold text-xs text-white">{unread}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                )
              })
            )}
          </View>
        )}
      />
    </SafeAreaView>
  )
}
