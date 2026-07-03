import { useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { Check, ChevronDown } from 'lucide-react-native'
import PressableScale from './PressableScale'
import Button from './Button'
import { colors } from '../../theme'

export type Option = { value: string; label: string }

// Mobile replacement for the web MultiSelect dropdown: a chip that opens a
// spring-up bottom sheet of checkbox rows. Empty selection = "All".
export function FilterChip({
  label,
  count,
  onPress,
}: {
  label: string
  count: number
  onPress: () => void
}) {
  const active = count > 0
  return (
    <PressableScale onPress={onPress}>
      <View
        className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${
          active ? 'border-navy-300 bg-navy-50' : 'border-slate-300 bg-white'
        }`}
      >
        <Text
          className={`font-sans-medium text-xs ${active ? 'text-navy-800' : 'text-slate-600'}`}
        >
          {label}
          {active ? ` · ${count}` : ''}
        </Text>
        <ChevronDown size={13} color={active ? colors.navy800 : colors.slate500} />
      </View>
    </PressableScale>
  )
}

export default function FilterSheet({
  visible,
  title,
  options,
  selected,
  onChange,
  onClose,
}: {
  visible: boolean
  title: string
  options: Option[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  onClose: () => void
}) {
  // Draft locally; commit on Done (matches the web dropdown's forgiving feel).
  // The sheet is mounted fresh on every open (see TransactionsView), so this
  // snapshot of `selected` is always current — a persistent instance would
  // resurrect stale checkmarks after Clear or a dashboard prefilter.
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected))

  const toggle = (value: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const done = () => {
    onChange(draft)
    onClose()
  }

  if (!visible) return null

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close filters" />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.springify().damping(18).stiffness(180)}
          exiting={SlideOutDown.duration(180)}
          className="rounded-t-3xl bg-white"
        >
          <SafeAreaView edges={['bottom']}>
            <View className="items-center pt-3">
              <View className="h-1 w-10 rounded-full bg-slate-200" />
            </View>
            <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
              <Text className="font-sans-semibold text-base text-slate-900">{title}</Text>
              {draft.size > 0 && (
                <Pressable onPress={() => setDraft(new Set())} hitSlop={8}>
                  <Text className="font-sans-medium text-sm text-navy-700">Clear</Text>
                </Pressable>
              )}
            </View>
            <ScrollView style={{ maxHeight: 380 }} contentContainerClassName="pb-2">
              {options.length === 0 ? (
                <Text className="px-5 py-6 text-center font-sans text-sm text-slate-500">
                  Nothing to filter here.
                </Text>
              ) : (
                options.map((o) => {
                  const on = draft.has(o.value)
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => toggle(o.value)}
                      className="flex-row items-center gap-3 px-5 py-3 active:bg-slate-50"
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View
                        className={`h-5 w-5 items-center justify-center rounded-md border ${
                          on ? 'border-navy-800 bg-navy-800' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {on && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </View>
                      <Text className="flex-1 font-sans text-[15px] text-slate-800">{o.label}</Text>
                    </Pressable>
                  )
                })
              )}
            </ScrollView>
            <View className="px-5 pb-2 pt-1">
              <Button onPress={done}>
                {draft.size === 0 ? 'Show all' : `Apply ${draft.size} filter${draft.size === 1 ? '' : 's'}`}
              </Button>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  )
}
