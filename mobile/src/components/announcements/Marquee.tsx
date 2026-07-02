import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

// Seamless marquee (web .marquee-track port): two copies of the text translate
// 0 → -width on a loop; static when the text already fits the container.
export default function Marquee({
  children,
  textClassName,
  speed = 60, // px per second (web keyframe feel)
}: {
  children: string
  textClassName?: string
  speed?: number
}) {
  const [boxW, setBoxW] = useState(0)
  const [textW, setTextW] = useState(0)
  const x = useSharedValue(0)
  const overflows = textW > boxW && boxW > 0
  const GAP = 48

  useEffect(() => {
    if (!overflows) {
      x.set(0)
      return
    }
    const distance = textW + GAP
    x.set(0)
    x.set(
      withRepeat(
        withTiming(-distance, { duration: (distance / speed) * 1000, easing: Easing.linear }),
        -1,
      ),
    )
  }, [overflows, textW, speed, x])

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }))

  return (
    <View
      className="min-w-0 flex-1 overflow-hidden"
      onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ flexDirection: 'row' }, style]}>
        <Text
          className={textClassName}
          numberOfLines={1}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
          style={overflows ? { flexShrink: 0 } : undefined}
        >
          {children}
        </Text>
        {overflows && (
          <Text className={textClassName} numberOfLines={1} style={{ flexShrink: 0, marginLeft: GAP }}>
            {children}
          </Text>
        )}
      </Animated.View>
    </View>
  )
}
