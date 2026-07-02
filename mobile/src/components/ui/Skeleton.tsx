import { useEffect } from 'react'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

// Pulsing placeholder block shown during first data load.
export default function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useSharedValue(0.45)
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true)
  }, [opacity])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={style} className={`rounded-xl bg-slate-200 ${className}`} />
}
