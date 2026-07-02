import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

// Loan repayment progress: the fill springs to its width on mount/update.
export default function ProgressBar({
  progress, // 0..100
  color = '#10b981', // emerald-500 (web parity)
  delay = 0,
}: {
  progress: number
  color?: string
  delay?: number
}) {
  const w = useSharedValue(0)
  useEffect(() => {
    w.set(
      withDelay(
        delay,
        withTiming(Math.max(0, Math.min(100, progress)), {
          duration: 600,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
        }),
      ),
    )
  }, [progress, delay, w])
  const fill = useAnimatedStyle(() => ({ width: `${w.get()}%` }))

  return (
    <View
      className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: progress }}
    >
      <Animated.View style={[fill, { height: '100%', borderRadius: 999, backgroundColor: color }]} />
    </View>
  )
}
