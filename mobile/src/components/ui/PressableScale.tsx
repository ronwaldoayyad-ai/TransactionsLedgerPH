import { ReactNode } from 'react'
import { Pressable, PressableProps } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { tapHaptic } from '../../lib/haptics'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// The app-wide press affordance: a quick UI-thread scale-down + selection
// haptic, mirroring the web's `active:scale-[0.98]` idiom.
export default function PressableScale({
  children,
  haptic = true,
  scaleTo = 0.97,
  onPressIn,
  disabled,
  ...props
}: PressableProps & { children: ReactNode; haptic?: boolean; scaleTo?: number }) {
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <AnimatedPressable
      style={style}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withSpring(scaleTo, { damping: 20, stiffness: 400 }))
        if (haptic && !disabled) tapHaptic()
        onPressIn?.(e)
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 20, stiffness: 400 }))
      }}
      {...props}
    >
      {children}
    </AnimatedPressable>
  )
}
