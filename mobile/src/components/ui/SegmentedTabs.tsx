import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated'
import { tapHaptic } from '../../lib/haptics'

// Animated segmented control: a navy indicator slides under the active tab.
export default function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { value: string; label: string }[]
  active: string
  onChange: (value: string) => void
}) {
  const [width, setWidth] = useState(0)
  const idx = Math.max(0, tabs.findIndex((t) => t.value === active))
  const segW = width / Math.max(1, tabs.length)
  const x = useDerivedValue(
    () => withTiming(idx * segW, { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1) }),
    [idx, segW],
  )
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))

  return (
    <View
      className="flex-row rounded-xl bg-slate-100 p-1"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - 8)}
    >
      {width > 0 && (
        <Animated.View
          style={[
            indicator,
            {
              position: 'absolute',
              left: 4,
              top: 4,
              bottom: 4,
              width: segW,
              borderRadius: 9,
              backgroundColor: '#1e3a8a',
            },
          ]}
        />
      )}
      {tabs.map((t) => (
        <Pressable
          key={t.value}
          className="flex-1 items-center py-1.5"
          onPress={() => {
            tapHaptic()
            onChange(t.value)
          }}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === t.value }}
        >
          <Text
            className={`font-sans-medium text-xs capitalize ${
              active === t.value ? 'text-white' : 'text-slate-600'
            }`}
          >
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
