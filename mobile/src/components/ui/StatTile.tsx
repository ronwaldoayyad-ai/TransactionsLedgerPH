import { ReactNode } from 'react'
import { Text, View } from 'react-native'
import PressableScale from './PressableScale'
import RainbowBorder from './RainbowBorder'

// Web StatCard port: icon chip, label, mono value, hint. `highlight` wraps the
// tile in the animated rainbow border (Next Payment Due).
export default function StatTile({
  icon,
  label,
  value,
  hint,
  accentBg = 'bg-navy-50',
  onPress,
  highlight = false,
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
  accentBg?: string
  onPress?: () => void
  highlight?: boolean
}) {
  const body = (
    <View className="rounded-2xl bg-white p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="font-sans-medium text-xs text-slate-500" numberOfLines={2}>
            {label}
          </Text>
          <Text className="mt-1.5 font-mono-semibold text-lg text-slate-900" numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          {hint ? (
            <Text className="mt-1 font-sans text-[11px] leading-4 text-slate-500" numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </View>
        <View className={`rounded-xl p-2 ${accentBg}`}>{icon}</View>
      </View>
    </View>
  )

  const framed = highlight ? (
    <RainbowBorder>{body}</RainbowBorder>
  ) : (
    <View className="rounded-2xl border border-slate-200/70 bg-white shadow-sm">{body}</View>
  )

  if (!onPress) return framed
  return <PressableScale onPress={onPress}>{framed}</PressableScale>
}
