import { useApp } from '../../context/AppContext'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/AppShell'
import RefreshButton from '../../components/RefreshButton'
import PaymentList from '../../components/PaymentList'
import { Card } from '../../components/ui'

// Centralized verification inbox for user-uploaded proofs of payment.
export default function Queue() {
  const { payments } = useApp()
  const [params, setParams] = useSearchParams()
  const selectedProof = params.get('proof')
  const shown = selectedProof ? payments.filter(payment => payment.id === selectedProof) : payments
  const pending = payments.filter(payment => payment.status === 'pending' && !payment.retractedAt).length
  return (
    <>
      <PageHeader
        title="Payment review"
        subtitle={`${pending} payment proofs awaiting review. Check the uploaded proof and requested allocation before deciding.`}
        action={<RefreshButton />}
      />
      {selectedProof && <div className="aw-sync-error"><span>{shown.length ? 'Showing the selected payment proof.' : 'This proof is no longer available in the current records.'}</span><button onClick={() => setParams({})}>Show all proofs</button></div>}
      <Card>
        <PaymentList
          key={selectedProof || 'all-proofs'}
          payments={shown}
          defaultTab={selectedProof ? 'all' : 'pending'}
          canReview
          showControls
          showBorrower
          pageSize={8}
          emptyBody="No payment proofs match this filter."
        />
      </Card>
    </>
  )
}
