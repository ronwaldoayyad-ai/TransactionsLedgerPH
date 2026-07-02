import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import TransactionsView from '../components/TransactionsView'
import { fonts } from '../theme'

// Straight Transactions — one-time purchases settled in a single payment
// (web StraightTransactions port; status filter + hide-settled + sort only).
export default function Straight() {
  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Straight Transactions',
          headerTitleStyle: { fontFamily: fonts.sansSemibold },
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <View className="px-4 pb-1 pt-2">
        <Text className="font-sans text-xs text-slate-500">
          One-time purchases settled in a single payment — no loan or disclosure statement.
        </Text>
      </View>
      <TransactionsView
        keyPrefix="straight"
        straightOnly
        emptyDefaultBody="You have no straight transactions yet."
      />
    </SafeAreaView>
  )
}
