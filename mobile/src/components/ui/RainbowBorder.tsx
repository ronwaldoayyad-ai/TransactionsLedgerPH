import { ReactNode, useEffect, useState } from 'react'
import { View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

// Port of the web `.rainbow-border` (index.css): an oversized 4-quadrant
// gradient rotates behind an opaque child, so only a moving multicolor edge
// shows. Rotation runs on the UI thread (Reanimated) — no JS-thread jank.
const C = { green: '#399953', yellow: '#fbb300', red: '#d53e33', blue: '#377af5' }

export default function RainbowBorder({
  children,
  thickness = 3,
  radius = 16,
}: {
  children: ReactNode
  thickness?: number
  radius?: number
}) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const spin = useSharedValue(0)

  useEffect(() => {
    spin.set(withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1))
  }, [spin])

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }))

  // The rotating square must cover the card at every angle → side = diagonal.
  const diag = Math.ceil(Math.sqrt(size.w * size.w + size.h * size.h)) + 8
  const half = diag / 2

  return (
    <View
      style={{ borderRadius: radius, overflow: 'hidden' }}
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
      }
    >
      {size.w > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            spinStyle,
            {
              position: 'absolute',
              width: diag,
              height: diag,
              left: size.w / 2 - half,
              top: size.h / 2 - half,
            },
          ]}
        >
          {/* Four gradient quadrants ≈ the web's 4-stop conic look */}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <LinearGradient colors={[C.green, C.yellow]} style={{ flex: 1 }} />
            <LinearGradient colors={[C.yellow, C.red]} style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <LinearGradient colors={[C.blue, C.green]} style={{ flex: 1 }} />
            <LinearGradient colors={[C.red, C.blue]} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      )}
      <View style={{ margin: thickness, borderRadius: radius - thickness, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  )
}
