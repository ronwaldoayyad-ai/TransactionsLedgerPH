import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useApp } from '../../context/AppContext'
import PaymentList from '../../components/PaymentList'
import FadeInView from '../../components/ui/FadeInView'
import { Card } from '../../components/ui/Card'
import { colors } from '../../theme'

// Centralized verification inbox for uploaded proofs of payment (web Queue.jsx).
export default function AdminQueue() {
  const { payments, refreshing, refreshData } = useApp()
  const pending = payments.filter((p: any) => p.status === 'pending').length

  return (
    <SafeAreaView className="flex-1 bg-[#f3f6fb]" edges={['top']}>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.navy600} />
        }
      >
        <FadeInView className="px-1">
          <Text className="font-sans-bold text-2xl text-slate-900">Verification Queue</Text>
          <Text className="mt-0.5 font-sans text-sm text-slate-500">
            Review uploaded proofs of payment and set their status.
            {pending > 0 ? ` ${pending} awaiting review.` : ''}
          </Text>
        </FadeInView>

        <FadeInView delay={80}>
          <Card>
            <PaymentList
              payments={payments}
              canReview
              showBorrower
              pageSize={8}
              emptyBody="No payment proofs match this filter."
            />
          </Card>
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  )
}
