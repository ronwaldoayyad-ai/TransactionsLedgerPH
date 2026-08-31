import { useApp } from '../context/AppContext'
import { useDisbursements } from '../context/DisbursementsContext'
import { useNotifications } from '../context/NotificationsContext'
import { disbursementPdfAttachment } from '../lib/disbursementPdf'

// Borrower accepts a Loan Disbursement agreement. One place for the whole
// automation so both entry points (the "My Disbursements" checkbox and the
// "Accept agreement" button on the notification) behave identically:
//
//   1. acknowledgeDisbursement() stamps the acceptance and notifies every admin
//      (SECURITY DEFINER RPC live; in-memory in demo), returning the updated row.
//   2. Render the ACCEPTED copy of the PDF — the returned row carries
//      acknowledgedAt, so the document now shows the acceptance date and time.
//   3. Send the borrower a confirmation carrying that accepted copy.
//
// The confirmation insert is allowed in live mode by the "notifications: self
// insert" policy (a user may notify only themselves); in demo it uses the
// in-memory store. A failure at step 3 must not undo the acceptance, so it is
// swallowed and logged. Returns { error } if the acceptance itself fails.
export function useAcceptDisbursement() {
  const { session } = useApp()
  const { acknowledgeDisbursement } = useDisbursements()
  const { createNotification } = useNotifications()
  const myName = session.user.name
  const myId = session.user.id

  return async (d) => {
    const { disbursement, error } = await acknowledgeDisbursement(d.id)
    if (error) return { error }
    const accepted = disbursement ?? { ...d, acknowledgedAt: new Date().toISOString() }

    try {
      const pdf = disbursementPdfAttachment({
        ...accepted,
        billedToName: myName,
        acknowledgedByName: myName,
      })
      await createNotification({
        category: 'general',
        title: '✅ Loan Disbursement Accepted',
        body: 'Thank you for accepting the agreement. Please find the attached copy of the accepted Loan Disbursement Document.',
        audience: 'targeted',
        targetUserIds: [myId],
        attachments: [pdf],
      })
    } catch (e) {
      console.error('[disbursements] acceptance confirmation failed:', e?.message ?? e)
    }

    return { disbursement: accepted }
  }
}
