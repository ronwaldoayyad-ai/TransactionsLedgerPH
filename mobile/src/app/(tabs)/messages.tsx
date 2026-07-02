import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
// SDK 56+ expo-router vendors bottom-tabs; the hook is only exposed on this
// internal path (importing the @react-navigation package now throws).
import { useBottomTabBarHeight } from 'expo-router/build/react-navigation/bottom-tabs'
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, ZoomIn } from 'react-native-reanimated'
import { Pin, Send, Smile, Trash2, Volume2, VolumeX, X } from 'lucide-react-native'
import { useApp } from '../../context/AppContext'
import { useMessages } from '../../context/MessagesContext'
import { EMOJIS, QUICK_REACTIONS } from '../../lib/emoji'
import { isMuted, playSend, setMuted } from '../../lib/sounds'
import { lightHaptic, tapHaptic, warningHaptic } from '../../lib/haptics'
import Avatar from '../../components/ui/Avatar'
import EmptyState from '../../components/ui/EmptyState'
import { colors, fonts } from '../../theme'

const timeShort = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

// Borrower ⇄ lender chat (web UserMessages/ChatThread port). Hover toolbar
// becomes a long-press action sheet; the list is inverted (native chat feel).
export default function Messages() {
  const { users } = useApp()
  const {
    messages,
    sendMessage,
    markRead,
    reactToMessage,
    togglePin,
    deleteMessage,
    clearConversation,
    unreadTotal,
  } = useMessages()
  const tabBarHeight = useBottomTabBarHeight()

  const admin = useMemo(() => users.find((u: any) => u.role === 'admin'), [users])
  const adminName = admin?.name ?? 'LoanLedger PH'

  const [draft, setDraft] = useState('')
  const [muted, setMutedState] = useState(isMuted())
  const [actionMsg, setActionMsg] = useState<any>(null) // long-pressed message
  const [emojiMode, setEmojiMode] = useState<'react' | 'compose' | null>(null)

  // Mark admin messages read while this tab is focused.
  useFocusEffect(
    useCallback(() => {
      if (unreadTotal > 0) markRead()
    }, [unreadTotal, markRead]),
  )

  const pinned = messages.find((m: any) => m.pinned)
  const inverted = useMemo(() => [...messages].reverse(), [messages])

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    playSend()
    lightHaptic()
    await sendMessage(text)
  }

  const openActions = (m: any) => {
    warningHaptic()
    setActionMsg(m)
  }

  const react = (m: any, emoji: string) => {
    tapHaptic()
    reactToMessage(m.id, emoji)
    setActionMsg(null)
    setEmojiMode(null)
  }

  const confirmClear = () => {
    Alert.alert('Clear conversation?', 'This deletes the entire message history for both sides.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => clearConversation() },
    ])
  }

  const confirmDelete = (m: any) => {
    setActionMsg(null)
    Alert.alert('Delete this message?', 'It will be removed for both sides.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(m.id) },
    ])
  }

  const renderItem = ({ item: m, index }: { item: any; index: number }) => {
    const mine = !m.fromAdmin
    // Chronological successor in the inverted list is data[index - 1].
    const successor = index > 0 ? inverted[index - 1] : null
    const endOfRun = !successor || successor.fromAdmin !== m.fromAdmin
    const predecessor = index < inverted.length - 1 ? inverted[index + 1] : null
    const newDay = !predecessor || dayLabel(predecessor.createdAt) !== dayLabel(m.createdAt)
    const reactions = Object.values(m.reactions ?? {}) as string[]

    return (
      <View>
        {newDay && (
          <View className="my-3 items-center">
            <Text className="rounded-full bg-slate-200/70 px-3 py-1 font-sans text-[11px] text-slate-600">
              {dayLabel(m.createdAt)}
            </Text>
          </View>
        )}
        <View
          className={`flex-row items-end gap-2 px-3 ${mine ? 'justify-end' : 'justify-start'} ${
            endOfRun ? 'mb-2' : 'mb-0.5'
          }`}
        >
          {!mine &&
            (endOfRun ? (
              <Avatar name={adminName} url={admin?.avatarUrl} size={26} />
            ) : (
              <View style={{ width: 26 }} />
            ))}
          <Pressable
            onLongPress={() => openActions(m)}
            delayLongPress={280}
            className="max-w-[76%]"
            accessibilityHint="Long-press for reactions and actions"
          >
            <View
              className={`rounded-2xl px-3.5 py-2.5 ${
                mine
                  ? `bg-navy-800 ${endOfRun ? 'rounded-br-md' : ''}`
                  : `border border-slate-200 bg-white ${endOfRun ? 'rounded-bl-md' : ''}`
              }`}
            >
              {m.pinned && (
                <View className="mb-1 flex-row items-center gap-1">
                  <Pin size={11} color={mine ? '#fcd34d' : colors.gold500} />
                  <Text
                    className={`font-sans-medium text-[10px] ${mine ? 'text-amber-200' : 'text-gold-600'}`}
                  >
                    Pinned
                  </Text>
                </View>
              )}
              <Text
                className={`font-sans text-[15px] leading-[21px] ${mine ? 'text-white' : 'text-slate-800'}`}
              >
                {m.body}
              </Text>
              <Text
                className={`mt-1 self-end font-sans text-[10px] ${mine ? 'text-navy-200' : 'text-slate-400'}`}
              >
                {timeShort(m.createdAt)}
              </Text>
            </View>
            {reactions.length > 0 && (
              <Animated.View
                entering={ZoomIn.springify().damping(14)}
                className={`-mt-1.5 flex-row gap-1 ${mine ? 'self-end pr-1' : 'self-start pl-1'}`}
              >
                <View className="flex-row items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 shadow-sm">
                  {reactions.map((e, i) => (
                    <Text key={i} className="text-[13px]">
                      {e}
                    </Text>
                  ))}
                </View>
              </Animated.View>
            )}
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <Avatar name={adminName} url={admin?.avatarUrl} size={38} />
          <View className="min-w-0 flex-1">
            <Text className="font-sans-semibold text-[15px] text-slate-900" numberOfLines={1}>
              {adminName}
            </Text>
            <Text className="font-sans text-xs text-slate-500">Direct line to your lender</Text>
          </View>
          <Pressable
            onPress={() => {
              const next = !muted
              setMuted(next)
              setMutedState(next)
              tapHaptic()
            }}
            hitSlop={8}
            className="rounded-full p-2"
            accessibilityLabel={muted ? 'Unmute chat sounds' : 'Mute chat sounds'}
          >
            {muted ? (
              <VolumeX size={19} color={colors.slate500} />
            ) : (
              <Volume2 size={19} color={colors.navy700} />
            )}
          </Pressable>
          {messages.length > 0 && (
            <Pressable
              onPress={confirmClear}
              hitSlop={8}
              className="rounded-full p-2"
              accessibilityLabel="Clear conversation"
            >
              <Trash2 size={18} color={colors.slate500} />
            </Pressable>
          )}
        </View>

        {/* Pinned banner */}
        {pinned && (
          <Animated.View
            entering={FadeInDown.duration(250)}
            className="flex-row items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5"
          >
            <Pin size={14} color={colors.gold600} />
            <Text className="flex-1 font-sans text-xs text-amber-900" numberOfLines={1}>
              {pinned.body}
            </Text>
            <Pressable onPress={() => togglePin(pinned.id)} hitSlop={8} accessibilityLabel="Unpin">
              <X size={14} color={colors.gold600} />
            </Pressable>
          </Animated.View>
        )}

        {/* Thread */}
        <FlatList
          inverted
          data={inverted}
          keyExtractor={(m: any) => m.id}
          renderItem={renderItem}
          className="flex-1"
          contentContainerClassName="py-3"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={{ transform: [{ scaleY: -1 }] }}>
              <EmptyState
                icon={<Smile size={20} color={colors.slate500} />}
                title={`Say hi to ${adminName.split(' ')[0]}`}
                body="Your message will be delivered directly to your lender."
              />
            </View>
          }
        />

        {/* Composer */}
        <View className="flex-row items-end gap-2 border-t border-slate-200 bg-white px-3 py-2.5">
          <Pressable
            onPress={() => setEmojiMode('compose')}
            hitSlop={6}
            className="pb-2"
            accessibilityLabel="Insert emoji"
          >
            <Smile size={22} color={colors.slate500} />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
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
              paddingTop: 9,
              paddingBottom: 9,
            }}
            cursorColor={colors.navy800}
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim()}
            className={`h-10 w-10 items-center justify-center rounded-full ${
              draft.trim() ? 'bg-gold-500' : 'bg-slate-200'
            }`}
            accessibilityLabel="Send message"
          >
            <Send size={17} color={draft.trim() ? '#ffffff' : '#94a3b8'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Long-press actions sheet */}
      {actionMsg && (
        <Modal transparent visible animationType="none" onRequestClose={() => setActionMsg(null)}>
          <View className="flex-1 justify-end">
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
            >
              <Pressable style={{ flex: 1 }} onPress={() => setActionMsg(null)} />
            </Animated.View>
            <Animated.View
              entering={SlideInDown.springify().damping(18).stiffness(190)}
              className="rounded-t-3xl bg-white pb-8"
            >
              <View className="items-center pt-3">
                <View className="h-1 w-10 rounded-full bg-slate-200" />
              </View>
              {/* Quick reactions */}
              <View className="flex-row justify-around px-6 py-4">
                {QUICK_REACTIONS.map((e: string) => (
                  <Pressable
                    key={e}
                    onPress={() => react(actionMsg, e)}
                    className={`h-11 w-11 items-center justify-center rounded-full ${
                      actionMsg.reactions?.borrower === e ? 'bg-navy-50' : 'bg-slate-50'
                    }`}
                    accessibilityLabel={`React ${e}`}
                  >
                    <Text className="text-[22px]">{e}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => setEmojiMode('react')}
                  className="h-11 w-11 items-center justify-center rounded-full bg-slate-50"
                  accessibilityLabel="More emojis"
                >
                  <Smile size={20} color={colors.slate500} />
                </Pressable>
              </View>
              {/* Actions */}
              <Pressable
                onPress={() => {
                  togglePin(actionMsg.id)
                  setActionMsg(null)
                }}
                className="flex-row items-center gap-3 px-6 py-3.5 active:bg-slate-50"
              >
                <Pin size={18} color={colors.navy700} />
                <Text className="font-sans-medium text-[15px] text-slate-800">
                  {actionMsg.pinned ? 'Unpin message' : 'Pin message'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(actionMsg)}
                className="flex-row items-center gap-3 px-6 py-3.5 active:bg-red-50"
              >
                <Trash2 size={18} color="#dc2626" />
                <Text className="font-sans-medium text-[15px] text-red-600">Delete message</Text>
              </Pressable>
            </Animated.View>
          </View>
        </Modal>
      )}

      {/* Emoji grid (react to a message, or insert into the composer) */}
      {emojiMode && (
        <Modal transparent visible animationType="none" onRequestClose={() => setEmojiMode(null)}>
          <View className="flex-1 justify-end">
            <Animated.View
              entering={FadeIn.duration(150)}
              exiting={FadeOut.duration(120)}
              style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
            >
              <Pressable style={{ flex: 1 }} onPress={() => setEmojiMode(null)} />
            </Animated.View>
            <Animated.View
              entering={SlideInDown.springify().damping(18).stiffness(190)}
              className="rounded-t-3xl bg-white pb-8"
            >
              <View className="items-center pt-3">
                <View className="h-1 w-10 rounded-full bg-slate-200" />
              </View>
              <View className="flex-row flex-wrap justify-center gap-1 px-4 py-4">
                {EMOJIS.map((e: string) => (
                  <Pressable
                    key={e}
                    onPress={() => {
                      if (emojiMode === 'react' && actionMsg) {
                        react(actionMsg, e)
                      } else {
                        setDraft((d) => d + e)
                        setEmojiMode(null)
                      }
                      tapHaptic()
                    }}
                    className="h-11 w-11 items-center justify-center rounded-xl active:bg-slate-100"
                    accessibilityLabel={`Emoji ${e}`}
                  >
                    <Text className="text-[24px]">{e}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}
