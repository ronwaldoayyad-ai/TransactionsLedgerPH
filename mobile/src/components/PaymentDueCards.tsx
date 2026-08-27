import { useRef, useState } from 'react'
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { formatDate, formatPeso } from '../lib/amortization'
import RainbowBorder from './ui/RainbowBorder'
import PressableScale from './ui/PressableScale'
import { Card } from './ui/Card'
import { colors } from '../theme'

export type DueCard = {
  summary: any
  title: string
  bg: string
  onPress?: () => void
  emptyText?: string
}

// One payment-due card face: coloured background, big amount, item hint, and up
// to five due-date chips. The active card is wrapped in the animated rainbow
// border.
function CardFace({ card }: { card: DueCard }) {
  const { summary, title, bg, emptyText = 'No payments selected' } = card
  const inner = (
    <View className="rounded-2xl px-6 py-7" style={{ backgroundColor: bg }}>
      <View className="flex-row items-center justify-center gap-1">
        <Text className="font-sans-semibold text-xs uppercase tracking-[2px] text-slate-600">{title}</Text>
        {card.onPress ? <ChevronRight size={14} color={colors.slate400} /> : null}
      </View>
      <Text
        className="mt-2 text-center font-mono-semibold text-4xl text-slate-900"
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {summary.count ? formatPeso(summary.total) : '—'}
      </Text>
      {summary.count ? (
        <>
          <Text className="mt-1.5 text-center font-sans text-xs text-slate-500">
            {summary.count} item{summary.count === 1 ? '' : 's'} due
            {summary.pastDueCount ? (
              <Text className="font-sans text-xs text-slate-500">
                {' · including '}
                <Text className="font-sans-semibold text-red-600">{summary.pastDueCount} past due</Text>
              </Text>
            ) : null}
          </Text>
          <View className="mt-3 flex-row flex-wrap items-center justify-center gap-1.5">
            {summary.dates.slice(0, 5).map((d: any) => (
              <View
                key={d.date}
                className={`rounded-full px-2.5 py-1 ${d.kind === 'past_due' ? 'bg-red-50' : 'bg-emerald-50'}`}
              >
                <Text
                  className={`font-sans-medium text-xs ${d.kind === 'past_due' ? 'text-red-600' : 'text-emerald-700'}`}
                >
                  {formatDate(d.date)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <Text className="mt-1.5 text-center font-sans text-xs text-slate-500">{emptyText}</Text>
      )}
    </View>
  )
  const framed = <RainbowBorder>{inner}</RainbowBorder>
  return card.onPress ? <PressableScale onPress={card.onPress}>{framed}</PressableScale> : framed
}

// Swipe between the Current and Next payment-due cards (native horizontal
// paging). Dots below jump between them; `onActive` keeps the parent's Detailed
// Breakdown in sync. Single-card callers just get the one card.
export function PaymentDueCards({
  cards,
  active,
  onActive,
}: {
  cards: DueCard[]
  active: number
  onActive: (i: number) => void
}) {
  const [w, setW] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  if (cards.length === 1) return <CardFace card={cards[0]} />

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(w, 1))
    if (i !== active) onActive(i)
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        scrollEventThrottle={16}
      >
        {cards.map((c, i) => (
          <View key={i} style={{ width: w }}>
            {w > 0 ? <CardFace card={c} /> : null}
          </View>
        ))}
      </ScrollView>
      <View className="mt-3 flex-row items-center justify-center gap-2">
        {cards.map((c, i) => (
          <Pressable
            key={i}
            accessibilityLabel={`Show ${c.title}`}
            onPress={() => {
              onActive(i)
              scrollRef.current?.scrollTo({ x: i * w, animated: true })
            }}
            hitSlop={8}
          >
            <View className={`h-2 rounded-full ${i === active ? 'w-6 bg-navy-800' : 'w-2 bg-slate-300'}`} />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function Row({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'red' | 'emerald' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="font-sans text-sm text-slate-500">{label}</Text>
      <Text className={`font-mono-semibold text-sm ${color}`}>{value}</Text>
    </View>
  )
}

// The Detailed Breakdown card. `label` names which card the numbers reflect
// (Current / Next) and `accent` is that card's colour, shown as a chip.
export function PaymentDueBreakdown({
  summary,
  label,
  accent,
}: {
  summary: any
  label?: string
  accent?: string
}) {
  return (
    <Card>
      <View className="flex-row items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Text className="font-sans-semibold text-base text-slate-900">Detailed Breakdown</Text>
        {label ? (
          <View className="rounded-full border border-slate-200 px-2.5 py-0.5" style={accent ? { backgroundColor: accent } : undefined}>
            <Text className="font-sans-semibold text-xs text-slate-600">{label}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row gap-x-6 px-5 py-1">
        <View className="flex-1">
          <Row label="Total Due" value={formatPeso(summary.total)} />
          <View className="border-t border-slate-100" />
          <Row label="Upcoming" value={formatPeso(summary.upcomingTotal)} tone="emerald" />
          <View className="border-t border-slate-100" />
          <Row label="Past Due Items" value={String(summary.pastDueCount)} tone="red" />
          <View className="border-t border-slate-100" />
          <Row label="Due Date" value={summary.latestDate ? formatDate(summary.latestDate) : '—'} />
        </View>
        <View className="flex-1">
          <Row label="Past Due" value={formatPeso(summary.pastDueTotal)} tone="red" />
          <View className="border-t border-slate-100" />
          <Row label="Total Items" value={String(summary.count)} />
          <View className="border-t border-slate-100" />
          <Row label="Upcoming Items" value={String(summary.upcomingCount)} tone="emerald" />
        </View>
      </View>
    </Card>
  )
}
