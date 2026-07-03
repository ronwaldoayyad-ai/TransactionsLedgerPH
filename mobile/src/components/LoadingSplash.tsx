import { useEffect, useState } from 'react'
import { Text, View, useWindowDimensions } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import FadeInView from './ui/FadeInView'
import { colors, fonts } from '../theme'

// RN recreation of the web sign-in splash (src/components/LoadingScreen.jsx):
// spinning ring, brand, borrower-chase, cycling status line, ~5s progress bar.
const PHRASES = [
  { time: 0, text: 'Deploying collections squad…' },
  { time: 1300, text: 'Borrower spotted! Pursuing…' },
  { time: 2500, text: 'Running calculations…' },
  { time: 3800, text: 'Securing the perimeter…' },
  { time: 4600, text: 'Ledger balanced. Ready!' },
]

export default function LoadingSplash() {
  const { width } = useWindowDimensions()
  const [text, setText] = useState(PHRASES[0].text)

  useEffect(() => {
    const timers = PHRASES.slice(1).map((p) => setTimeout(() => setText(p.text), p.time))
    return () => timers.forEach(clearTimeout)
  }, [])

  // Spinning ring (UI thread, linear, endless).
  const spin = useSharedValue(0)
  useEffect(() => {
    spin.set(withRepeat(withTiming(360, { duration: 3000, easing: Easing.linear }), -1))
  }, [spin])
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }))

  // The chase: two runners crossing the stage on a loop.
  const stageW = Math.min(width - 80, 300)
  const chase = useSharedValue(0)
  useEffect(() => {
    chase.set(withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1))
  }, [chase])
  const lenderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -40 + (stageW + 80) * chase.get() }],
  }))
  const borrowerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -90 + (stageW + 80) * chase.get() }],
  }))

  // Progress bar easing through the web keyframe feel (30/65/90/100 over ~5s).
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.set(
      withSequence(
        withTiming(0.3, { duration: 1200, easing: Easing.out(Easing.quad) }),
        withTiming(0.65, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withDelay(300, withTiming(0.9, { duration: 1100, easing: Easing.inOut(Easing.quad) })),
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
      ),
    )
  }, [progress])
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }))

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: '#090d16' }}
      accessibilityRole="progressbar"
      accessibilityLabel="Signing you in"
    >
      {/* Spinning ring around the brand */}
      <View className="items-center justify-center" style={{ width: 260, height: 260 }}>
        <Animated.View
          style={[
            ringStyle,
            {
              position: 'absolute',
              width: 260,
              height: 260,
              borderRadius: 130,
              borderWidth: 3,
              borderColor: 'rgba(224,175,52,0.15)',
              borderTopColor: colors.gold400,
            },
          ]}
        />
        <View className="items-center">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 30, color: '#ffffff' }}>
            LoanLedger <Text style={{ color: colors.gold400 }}>PH</Text>
          </Text>
          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: 13,
              color: colors.navy300,
              letterSpacing: 2,
              marginTop: 6,
            }}
          >
            Simplify. Track. Succeed.
          </Text>
        </View>
      </View>

      {/* The chase */}
      <View style={{ width: stageW, height: 40, overflow: 'hidden' }} aria-hidden>
        <Animated.Text style={[lenderStyle, { position: 'absolute', fontSize: 24, top: 4 }]}>
          🏃‍♂️
        </Animated.Text>
        <Animated.Text style={[borrowerStyle, { position: 'absolute', fontSize: 24, top: 4 }]}>
          🏃💨
        </Animated.Text>
      </View>

      {/* Status line + progress */}
      <View className="mt-6 w-full items-center" style={{ maxWidth: 320 }}>
        <FadeInView key={text} dy={0}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.navy200 }}>
            {text}
          </Text>
        </FadeInView>
        <View
          className="mt-4 w-full overflow-hidden rounded-full"
          style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <Animated.View
            style={[barStyle, { height: 5, borderRadius: 999, backgroundColor: colors.gold400 }]}
          />
        </View>
      </View>
    </View>
  )
}
