import { useState } from 'react'
import { Button, CurrencyInput, Field, Modal, inputClass } from '../ui'
import { REQUEST_STATUSES, STATUS_NOTES } from '../../lib/loanRequest'

// Admin: transition a request's status (with a note) and optionally override
// the auto-calculated Notarial Fee and DST. A note is required when declining.
export default function UpdateStatusModal({ request, onSave, onClose }) {
  const [status, setStatus] = useState(request.status)
  // Auto-fill the standard description for the current status; changing the
  // status swaps in that status's default (admin can still edit it).
  const [note, setNote] = useState(STATUS_NOTES[request.status] ?? '')

  const pickStatus = (next) => {
    setStatus(next)
    setNote(STATUS_NOTES[next] ?? '')
  }
  const [notarial, setNotarial] = useState(request.notarialFee)
  const [dst, setDst] = useState(request.dst)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const feesChanged = notarial !== request.notarialFee || dst !== request.dst

  const save = async () => {
    if (status === 'declined' && !note.trim()) {
      setError('A reason is required when declining a request.')
      return
    }
    setError('')
    setSaving(true)
    const res = await onSave({
      status,
      note: note.trim(),
      fees: feesChanged ? { notarialFee: Number(notarial) || 0, dst: Number(dst) || 0 } : null,
    })
    setSaving(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    onClose()
  }

  return (
    <Modal
      open
      title="Update Loan Request Status"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? 'Updating…' : 'Update Request'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">{request.reference}</p>

        <Field label="Select Status" htmlFor="us-status">
          <select id="us-status" className={inputClass} value={status} onChange={(e) => pickStatus(e.target.value)}>
            {REQUEST_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Admin Note"
          htmlFor="us-note"
          hint={status === 'declined' ? 'Required — the borrower sees this reason.' : 'Optional — shown on the borrower timeline.'}
        >
          <textarea
            id="us-note"
            rows={3}
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Your application has been successfully received and is now waiting to be picked up for processing."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Notarial Fee" htmlFor="us-notarial">
            <CurrencyInput id="us-notarial" value={notarial} onValueChange={setNotarial} />
          </Field>
          <Field label="DST Amount" htmlFor="us-dst">
            <CurrencyInput id="us-dst" value={dst} onValueChange={setDst} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
