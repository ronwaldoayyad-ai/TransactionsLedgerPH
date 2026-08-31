import { ReactNode, useEffect, useState } from 'react'
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native'

// 3D coverflow carousel driven by swipe (no nav arrows). Mirrors the Cards &
// Wallet look: one card centered + flat, neighbours tilted back in 3D. Tap a
// side card to centre it; tap the centred card to fire onActivate. Uses RN's
// built-in Animated (not reanimated) so it behaves on native and web alike.
const SPACING = 116 // px between neighbouring card centres
const SWIPE_DX = 40 // horizontal travel that counts as a swipe

export default function SwipeCoverflow<T extends { id: string; label?: string }>({
  items,
  renderItem,
  onActivate,
  hint = 'Swipe to switch',
  cardWidth = 228,
  cardHeight = 120,
}: {
  items: T[]
  renderItem: (item: T, isActive: boolean) => ReactNode
  onActivate?: (item: T) => void
  hint?: string
  cardWidth?: number
  cardHeight?: number
}) {
  const n = items.length
  const [active, setActive] = useState(0)
  // Size the stage to the tallest actual card so it fits snugly (no dead space).
  const [measuredH, setMeasuredH] = useState(0)
  const cardH = measuredH || cardHeight
  // Lazy state (not refs) so the values are stable and render-safe.
  const [indexAnim] = useState(() => new Animated.Value(0))
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        const dir = g.dx <= -SWIPE_DX ? 1 : g.dx >= SWIPE_DX ? -1 : 0
        if (dir) setActive((a) => Math.max(0, Math.min(n - 1, a + dir)))
      },
    }),
  )

  useEffect(() => {
    Animated.spring(indexAnim, {
      toValue: active,
      useNativeDriver: Platform.OS !== 'web',
      friction: 9,
      tension: 60,
    }).start()
  }, [active, indexAnim])

  const go = (i: number) => setActive(Math.max(0, Math.min(n - 1, i)))

  return (
    <View>
      <View {...pan.panHandlers} style={{ height: cardH, overflow: 'hidden' }}>
        {items.map((it, i) => {
          const off = Animated.subtract(i, indexAnim)
          const translateX = off.interpolate({
            inputRange: [-2, -1, 0, 1, 2],
            outputRange: [-2 * SPACING, -SPACING, 0, SPACING, 2 * SPACING],
            extrapolate: 'clamp',
          })
          const rotateY = off.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: ['38deg', '0deg', '-38deg'],
            extrapolate: 'clamp',
          })
          const scale = off.interpolate({
            inputRange: [-2, -1, 0, 1, 2],
            outputRange: [0.9, 0.95, 1, 0.95, 0.9],
            extrapolate: 'clamp',
          })
          const opacity = off.interpolate({
            inputRange: [-3, -2, -1, 0, 1, 2, 3],
            outputRange: [0, 0.45, 0.72, 1, 0.72, 0.45, 0],
            extrapolate: 'clamp',
          })
          const absActive = Math.abs(i - active)
          return (
            <Animated.View
              key={it.id}
              pointerEvents={absActive > 2 ? 'none' : 'auto'}
              style={{
                position: 'absolute',
                width: cardWidth,
                // Centre the card in the container, then translateX offsets it.
                left: '50%',
                top: '50%',
                marginLeft: -cardWidth / 2,
                marginTop: -cardH / 2,
                zIndex: 100 - absActive,
                opacity,
                transform: [{ perspective: 1000 }, { translateX }, { rotateY }, { scale }],
              }}
            >
              <Pressable onPress={() => (i === active ? onActivate?.(it) : go(i))}>
                <View
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height
                    setMeasuredH((p) => (h > p ? h : p))
                  }}
                >
                  {renderItem(it, i === active)}
                </View>
              </Pressable>
            </Animated.View>
          )
        })}
      </View>

      {/* Page dots + swipe hint (no arrows). */}
      <View className="mt-1 items-center gap-1.5">
        <View className="flex-row items-center gap-1.5">
          {items.map((it, i) => (
            <Pressable
              key={it.id}
              onPress={() => go(i)}
              accessibilityLabel={`Go to ${it.label ?? `item ${i + 1}`}`}
            >
              <View
                className={`h-1.5 rounded-full ${i === active ? 'w-4 bg-navy-700' : 'w-1.5 bg-slate-300'}`}
              />
            </Pressable>
          ))}
        </View>
        <Text className="font-sans text-xs text-slate-400">{`←  ${hint}  →`}</Text>
      </View>
    </View>
  )
}
