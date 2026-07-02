import { memo } from 'react'
import { Text, View } from 'react-native'
import Badge from './ui/Badge'
import { formatDate, formatPeso } from '../lib/amortization'
import { BORROWER_STATUS_LABELS, borrowerStatus } from '../lib/transactions'

// One schedule row as a mobile card line (BorrowerScheduleTable row port):
// same background tinting — emerald for credits (negative), red for past due.
function TxnRow({ txn, today, showTxnDate }: { txn: any; today: string; showTxnDate?: boolean }) {
  const status = borrowerStatus(txn, today)
  const tint =
    txn.amount < 0 ? 'bg-emerald-50/70' : status === 'past_due' ? 'bg-red-50/70' : 'bg-white'

  return (
    <View className={`flex-row items-center gap-3 border-b border-slate-100 px-4 py-3 ${tint}`}>
      <Text className="w-7 font-mono text-xs text-slate-500">{txn.n}</Text>
      <View className="min-w-0 flex-1">
        <Text className="font-sans-medium text-sm text-slate-800" numberOfLines={1}>
          {txn.description}
        </Text>
        <Text className="mt-0.5 font-sans text-xs text-slate-500" numberOfLines={1}>
          {showTxnDate ? `Txn ${formatDate(txn.txnDate)} · ` : ''}Due {formatDate(txn.dueDate)}
          {txn.datePaid ? ` · Paid ${formatDate(txn.datePaid)}` : ''}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className="font-mono-semibold text-sm text-slate-900">{formatPeso(txn.amount)}</Text>
        <Badge status={status} label={BORROWER_STATUS_LABELS[status]} />
      </View>
    </View>
  )
}

export default memo(TxnRow)
