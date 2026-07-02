import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import TransactionsView from '../../components/TransactionsView'

// Consolidated Transactions — every installment and straight transaction
// combined (web ConsolidatedLoans port).
export default function Transactions() {
  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <View className="px-4 pb-1 pt-2">
        <Text className="font-sans-bold text-xl text-slate-900">Consolidated Transactions</Text>
        <Text className="mt-0.5 font-sans text-xs text-slate-500">
          Every installment and straight transaction combined into a single view.
        </Text>
      </View>
      <TransactionsView
        keyPrefix="consolidated"
        emptyDefaultBody="You have no loan schedules yet."
      />
    </SafeAreaView>
  )
}
