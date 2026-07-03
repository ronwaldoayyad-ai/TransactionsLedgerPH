import { ReactNode, useEffect } from 'react'
import { ViewProps } from 'react-native'
import { cssInterop } from 'nativewind'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

// Mount fade/rise driven by useAnimatedStyle + withTiming instead of
// Reanimated's `entering=` layout animations, which intermittently leave
// views stuck invisible (opacity 0) in Release builds. Same visual effect
// as FadeInDown, guaranteed to settle at full opacity.
function FadeInView({
  delay = 0,
  dy = 10,
  style,
  children,
  ...props
}: Omit<ViewProps, 'style'> & {
  delay?: number
  dy?: number
  children: ReactNode
  // Accepts plain and Reanimated animated styles (e.g. the login shake).
  style?: any
}) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 400, easing: Easing.bezier(0.23, 1, 0.32, 1) })))
  }, [delay, p])
  const anim = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ translateY: (1 - p.get()) * dy }],
  }))
  return (
    <Animated.View style={[anim, style]} {...props}>
      {children}
    </Animated.View>
  )
}

// Let NativeWind compile className on this custom component into `style`.
cssInterop(FadeInView, { className: 'style' })

export default FadeInView
