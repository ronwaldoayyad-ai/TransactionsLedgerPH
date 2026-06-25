import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import RefreshButton from '../../components/RefreshButton'
import PaymentList from '../../components/PaymentList'
import { Card } from '../../components/ui'

// Centralized verification inbox for user-uploaded proofs of payment.
export default function Queue() {
  const { payments } = useApp()
  return (
    <>
      <PageHeader
        title="Verification Queue"
        subtitle="Review uploaded proofs of payment and toggle their status."
        action={<RefreshButton />}
      />
      <Card>
        <PaymentList
          payments={payments}
          canReview
          showBorrower
          pageSize={8}
          emptyBody="No payment proofs match this filter."
        />
      </Card>
    </>
  )
}
