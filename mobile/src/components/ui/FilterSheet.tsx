import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated'
import { Check, ChevronDown } from 'lucide-react-native'
import PressableScale from './PressableScale'
import Button from './Button'
import { tapHaptic } from '../../lib/haptics'
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

// Selections apply LIVE — every tap commits immediately (checkmark, chip
// count, and the list behind the sheet all update at once), so there's no
// draft/Apply step and no doubt whether a tap registered. Rows are full-width
// touch targets ≥52pt tall with ripple/pressed feedback and horizontal
// hit-slop; the checkbox is just a visual indicator.
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
  const toggle = (value: string) => {
    tapHaptic()
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
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
              {selected.size > 0 && (
                <Pressable onPress={() => onChange(new Set())} hitSlop={12}>
                  <Text className="font-sans-medium text-sm text-navy-700">Clear</Text>
                </Pressable>
              )}
            </View>
            <ScrollView style={{ maxHeight: 400 }} contentContainerClassName="pb-2">
              {options.length === 0 ? (
                <Text className="px-5 py-6 text-center font-sans text-sm text-slate-500">
                  Nothing to filter here.
                </Text>
              ) : (
                options.map((o) => {
                  const on = selected.has(o.value)
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => toggle(o.value)}
                      hitSlop={{ left: 12, right: 12 }}
                      android_ripple={{ color: '#e2e8f0' }}
                      style={({ pressed }) => ({
                        minHeight: 54,
                        backgroundColor: pressed ? '#f1f5f9' : on ? '#f0f4fa' : 'transparent',
                      })}
                      className="flex-row items-center gap-3 px-5"
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={o.label}
                    >
                      <View
                        className={`h-6 w-6 items-center justify-center rounded-lg border-2 ${
                          on ? 'border-navy-800 bg-navy-800' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {on && (
                          <Animated.View entering={ZoomIn.springify().damping(15).stiffness(300)}>
                            <Check size={15} color="#ffffff" strokeWidth={3.5} />
                          </Animated.View>
                        )}
                      </View>
                      <Text
                        className={`flex-1 py-3 text-[15px] ${
                          on ? 'font-sans-semibold text-navy-900' : 'font-sans text-slate-800'
                        }`}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  )
                })
              )}
            </ScrollView>
            <View className="px-5 pb-2 pt-1">
              <Button onPress={onClose}>
                {selected.size === 0
                  ? 'Done — showing all'
                  : `Done — ${selected.size} filter${selected.size === 1 ? '' : 's'} on`}
              </Button>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  )
}
