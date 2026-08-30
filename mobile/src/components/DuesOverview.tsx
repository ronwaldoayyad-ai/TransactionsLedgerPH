import { useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarClock, Flame, Target } from 'lucide-react-native'
import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { buildDuesBreakdown, DuesSegmentKey } from '../lib/duesBreakdown'
import DuesDonutChart from './DuesDonutChart'
import { Card, CardHeader } from './ui/Card'
import PressableScale from './ui/PressableScale'
import EmptyState from './ui/EmptyState'
import { tapHaptic } from '../lib/haptics'

type Mode = 'amount' | 'count'

// Peso / count switch. Plain Views (no reanimated indicator) so the active
// state renders correctly on react-native-web as well as native.
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const opts: { value: Mode; label: string }[] = [
    { value: 'amount', label: '₱' },
    { value: 'count', label: '#' },
  ]
  return (
    <View className="flex-row rounded-xl bg-slate-100 p-1">
      {opts.map((o) => {
        const on = mode === o.value
        return (
          <PressableScale
            key={o.value}
            haptic={false}
            onPress={() => {
              tapHaptic()
              onChange(o.value)
            }}
          >
            <View className={`items-center rounded-lg px-4 py-1.5 ${on ? 'bg-navy-800' : ''}`}>
              <Text className={`font-sans-medium text-xs ${on ? 'text-white' : 'text-slate-600'}`}>
                {o.label}
              </Text>
            </View>
          </PressableScale>
        )
      })}
    </View>
  )
}

// A single tappable legend row: color dot, label, then amount + count.
function LegendRow({
  color,
  label,
  amount,
  count,
  mode,
  onPress,
}: {
  color: string
  label: string
  amount: number
  count: number
  mode: Mode
  onPress: () => void
}) {
  const dim = count === 0
  return (
    <PressableScale scaleTo={0.985} onPress={onPress}>
      <View
        className="flex-row items-center gap-3 rounded-xl px-2 py-2"
        style={dim ? { opacity: 0.45 } : undefined}
      >
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Text className="flex-1 font-sans-medium text-sm text-slate-700">{label}</Text>
        <View className="items-end">
          <Text className="font-mono-semibold text-sm text-slate-900" numberOfLines={1}>
            {mode === 'amount' ? formatPeso(amount) : count}
          </Text>
          <Text className="font-sans text-xs text-slate-400" numberOfLines={1}>
            {mode === 'amount' ? `${count} item${count === 1 ? '' : 's'}` : formatPeso(amount)}
          </Text>
        </View>
      </View>
    </PressableScale>
  )
}

// One of the three insight cards below the donut.
function Insight({
  icon,
  value,
  caption,
  accent = '#0f172a',
}: {
  icon: React.ReactNode
  value: string
  caption: string
  accent?: string
}) {
  return (
    <View className="flex-1 rounded-2xl bg-slate-50 p-3">
      <View className="mb-1.5">{icon}</View>
      <Text className="font-sans-semibold text-sm leading-5" style={{ color: accent }} numberOfLines={2}>
        {value}
      </Text>
      <Text className="mt-0.5 font-sans text-[11px] leading-4 text-slate-500" numberOfLines={2}>
        {caption}
      </Text>
    </View>
  )
}

export default function DuesOverview({
  myTxns,
  myLoans,
  title = 'Dues Overview',
  subtitle = 'Your overall payment status',
}: {
  myTxns: any[]
  myLoans: any[]
  title?: string
  subtitle?: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('amount')
  const [loanId, setLoanId] = useState<string>('all')
  const [w, setW] = useState(0)
  const seedNonce = useRef(0)
  const nextSeed = () => String(++seedNonce.current)

  const today = toISODate(new Date())
  const selected = loanId === 'all' ? undefined : loanId
  const b = buildDuesBreakdown(myTxns, today, selected)

  const donutSize = w > 0 ? Math.min(w, Math.max(240, Math.min(340, Math.round(w * 0.72)))) : 0

  // Segment → Transactions tab, prefiltered by borrower status (same seed
  // wiring the dashboard tiles already use).
  const goStatus = (key: DuesSegmentKey) => {
    router.push({
      pathname: '/(tabs)/transactions',
      params: {
        seedN: nextSeed(),
        seedStatus: key,
        seedDue: '',
        seedType: 'Installment',
        seedHide: key === 'paid' ? '0' : '1',
      },
    })
  }

  const paidPct = mode === 'amount' ? b.paidPctAmount : b.paidPctCount
  const centerCaption = b.allSettled
    ? 'All settled'
    : mode === 'amount'
      ? `${formatPeso(b.remainingAmount)} left`
      : `${b.remainingCount} of ${b.totalCount} left`

  const np = b.nextPayment
  const nextAccent = np?.kind === 'past_due' ? '#dc2626' : np?.kind === 'due' ? '#a16207' : '#24416c'
  const nextValue = np ? formatPeso(np.amount) : '—'
  const nextCaption = !np
    ? 'No payment due'
    : np.kind === 'past_due'
      ? `Overdue by ${Math.abs(np.daysUntil)} day${Math.abs(np.daysUntil) === 1 ? '' : 's'}`
      : np.kind === 'due'
        ? `Due today · ${formatDate(np.dueDate)}`
        : `Due in ${np.daysUntil} day${np.daysUntil === 1 ? '' : 's'}`

  const loanChips = [{ id: 'all', label: 'All loans' }, ...myLoans.map((l) => ({ id: l.id, label: l.label }))]

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={<ModeToggle mode={mode} onChange={setMode} />}
      />

      {b.isEmpty ? (
        <EmptyState
          title="No installment loans yet"
          body="Once you have an installment loan schedule, your dues breakdown will appear here."
        />
      ) : (
        <View className="gap-4 p-5">
          {/* Loan drill-down chips (only when there's more than one loan). */}
          {myLoans.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 pr-2"
            >
              {loanChips.map((c) => {
                const on = loanId === c.id
                return (
                  <PressableScale
                    key={c.id}
                    haptic={false}
                    onPress={() => {
                      tapHaptic()
                      setLoanId(c.id)
                    }}
                  >
                    {/* Style a plain View, not the Pressable — nativewind bg/pad
                        /radius applies reliably to Views on web. */}
                    <View className={`rounded-full px-3.5 py-1.5 ${on ? 'bg-navy-800' : 'bg-slate-100'}`}>
                      <Text
                        className={`font-sans-medium text-xs ${on ? 'text-white' : 'text-slate-600'}`}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </View>
                  </PressableScale>
                )
              })}
            </ScrollView>
          )}

          {/* Donut — sizes to the card, clamped so it stays legible on mobile web. */}
          <View className="items-center" onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {donutSize > 0 && (
              <DuesDonutChart
                size={donutSize}
                segments={b.segments.map((s) => ({
                  key: s.key,
                  color: s.color,
                  value: mode === 'amount' ? s.amount : s.count,
                }))}
                centerValue={paidPct}
                centerFormat={(n) => `${Math.round(n)}%`}
                centerCaption={`Paid · ${centerCaption}`}
              />
            )}
          </View>

          {/* Legend — each row taps through to the filtered ledger. */}
          <View className="gap-0.5">
            {b.segments.map((s) => (
              <LegendRow
                key={s.key}
                color={s.color}
                label={s.label}
                amount={s.amount}
                count={s.count}
                mode={mode}
                onPress={() => goStatus(s.key)}
              />
            ))}
          </View>

          {/* Insight cards. */}
          <View className="flex-row gap-2">
            <Insight
              icon={<CalendarClock size={18} color={nextAccent} />}
              value={nextValue}
              caption={nextCaption}
              accent={nextAccent}
            />
            <Insight
              icon={<Flame size={18} color={b.streak > 0 ? '#ea580c' : '#94a3b8'} />}
              value={b.streak > 0 ? `${b.streak} on-time` : 'No streak yet'}
              caption={b.streak > 0 ? 'Consecutive on-time payments' : 'Pay on time to start a streak'}
              accent={b.streak > 0 ? '#0f172a' : '#64748b'}
            />
            <Insight
              icon={<Target size={18} color="#24416c" />}
              value={`${b.payoff.pct}% of term`}
              caption={
                b.payoff.payoffDate
                  ? `${b.payoff.paidCount}/${b.payoff.totalCount} · ends ${formatDate(b.payoff.payoffDate)}`
                  : `${b.payoff.paidCount}/${b.payoff.totalCount} paid`
              }
            />
          </View>
        </View>
      )}
    </Card>
  )
}
