import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Megaphone, X } from 'lucide-react-native'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import Marquee from './Marquee'
import { lightHaptic } from '../../lib/haptics'
import { colors } from '../../theme'

// Auto-dismiss windows (web AnnouncementToasts parity: 30s, 20s for one-time).
const TOAST_MS = 30_000
const ONE_TIME_MS = 20_000

function ToastCard({ a }: { a: any }) {
  const { dismiss } = useAnnouncements()
  const router = useRouter()
  const ttl = a.oneTime ? ONE_TIME_MS : TOAST_MS

  // Countdown bar + auto-dismiss.
  const progress = useSharedValue(1)
  useEffect(() => {
    lightHaptic()
    progress.set(withTiming(0, { duration: ttl, easing: Easing.linear }))
    const t = setTimeout(() => dismiss(a), ttl)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id])
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }))

  return (
    <Animated.View
      entering={SlideInRight.springify().damping(19).stiffness(160)}
      exiting={SlideOutRight.duration(220)}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
    >
      <Pressable
        onPress={() => {
          dismiss(a)
          router.push({ pathname: '/announcement/[id]', params: { id: a.id } })
        }}
        accessibilityLabel="Read full announcement"
      >
        <View className="flex-row items-start gap-3 p-4">
          <View className="rounded-full bg-navy-50 p-2">
            <Megaphone size={15} color={colors.navy800} />
          </View>
          <View className="min-w-0 flex-1">
            {a.title ? (
              <Text className="font-sans-bold text-sm text-slate-900" numberOfLines={1}>
                {a.title}
              </Text>
            ) : null}
            <Text className="mt-0.5 font-sans text-[13px] leading-[18px] text-slate-600" numberOfLines={3}>
              {a.body}
            </Text>
            <Text className="mt-1.5 font-sans-medium text-xs text-navy-700">Read more</Text>
          </View>
          <Pressable
            onPress={() => dismiss(a)}
            hitSlop={10}
            accessibilityLabel="Close announcement"
          >
            <X size={16} color={colors.slate400} />
          </Pressable>
        </View>
      </Pressable>
      <View className="h-1 bg-slate-100">
        <Animated.View
          style={[barStyle, { height: '100%', backgroundColor: colors.gold400, transformOrigin: 'left center' }]}
        />
      </View>
    </Animated.View>
  )
}

// Global overlays mounted once in the root layout so they float over any tab.
export default function AnnouncementOverlays() {
  const { toasts, banners, dismiss } = useAnnouncements()
  const insets = useSafeAreaInsets()
  const banner = banners[0] ?? null

  return (
    <>
      {/* Banner: persistent bar pinned under the status bar, marquee if long */}
      {banner && (
        <Animated.View
          entering={FadeInDown.duration(300)}
          exiting={FadeOutUp.duration(200)}
          style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 40 }}
          className="flex-row items-center gap-3 bg-blue-600 px-4 py-2.5"
        >
          <Megaphone size={14} color="#ffffff" />
          <Marquee textClassName="font-sans text-[13px] text-white">
            {(banner.title ? `${banner.title}  —  ` : '') + banner.body}
          </Marquee>
          <Pressable
            onPress={() => dismiss(banner)}
            hitSlop={8}
            className="rounded-md border border-white/40 bg-white/10 px-2 py-1"
            accessibilityLabel="Dismiss banner"
          >
            <Text className="font-sans-medium text-[11px] text-white">Dismiss</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Toast stack: top of screen (below the banner when both show) */}
      {toasts.length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + (banner ? 52 : 8),
            left: 16,
            right: 16,
            zIndex: 50,
            gap: 8,
          }}
          pointerEvents="box-none"
        >
          {toasts.slice(0, 3).map((a: any) => (
            <ToastCard key={a.id} a={a} />
          ))}
        </View>
      )}
    </>
  )
}
