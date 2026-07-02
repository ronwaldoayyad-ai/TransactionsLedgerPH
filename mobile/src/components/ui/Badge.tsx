import { Text, View } from 'react-native'

// Port of the web Badge (ui.jsx badgeStyles/badgeDots) — same status vocabulary.
const badgeStyles: Record<string, string> = {
  pending: 'bg-amber-50 border-amber-200',
  approved: 'bg-emerald-50 border-emerald-200',
  rejected: 'bg-red-50 border-red-200',
  active: 'bg-emerald-50 border-emerald-200',
  invited: 'bg-sky-50 border-sky-200',
  disabled: 'bg-slate-100 border-slate-200',
  paid: 'bg-emerald-50 border-emerald-200',
  upcoming: 'bg-slate-50 border-slate-200',
  due: 'bg-amber-50 border-amber-200',
  unpaid: 'bg-amber-50 border-amber-200',
  refunded: 'bg-blue-50 border-blue-200',
  cancelled: 'bg-teal-50 border-teal-200',
  past_due: 'bg-red-50 border-red-200',
}

const badgeText: Record<string, string> = {
  pending: 'text-amber-700',
  approved: 'text-emerald-700',
  rejected: 'text-red-700',
  active: 'text-emerald-700',
  invited: 'text-sky-700',
  disabled: 'text-slate-500',
  paid: 'text-emerald-700',
  upcoming: 'text-slate-500',
  due: 'text-amber-700',
  unpaid: 'text-amber-700',
  refunded: 'text-blue-700',
  cancelled: 'text-teal-700',
  past_due: 'text-red-700',
}

const badgeDots: Record<string, string> = {
  pending: 'bg-amber-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-red-500',
  active: 'bg-emerald-500',
  invited: 'bg-sky-500',
  disabled: 'bg-slate-400',
  paid: 'bg-emerald-500',
  upcoming: 'bg-slate-300',
  due: 'bg-amber-500',
  unpaid: 'bg-amber-500',
  refunded: 'bg-blue-500',
  cancelled: 'bg-teal-500',
  past_due: 'bg-red-500',
}

export default function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 ${badgeStyles[status] ?? badgeStyles.upcoming}`}
    >
      <View className={`h-1.5 w-1.5 rounded-full ${badgeDots[status] ?? badgeDots.upcoming}`} />
      <Text className={`font-sans-medium text-xs capitalize ${badgeText[status] ?? badgeText.upcoming}`}>
        {label ?? status}
      </Text>
    </View>
  )
}
