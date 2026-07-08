import { useState } from 'react'
import { Button, Field, Modal, inputClass } from '../ui'
import { BANKS } from '../../lib/loanRequest'

// Borrower edits the disbursement bank name / account number / account name on
// their own request (allowed while the request isn't in a terminal state).
export default function EditBankModal({ request, onSave, onClose }) {
  const [bankName, setBankName] = useState(request.bankName)
  const [accountNumber, setAccountNumber] = useState(request.bankAccountNumber)
  const [accountName, setAccountName] = useState(request.bankAccountName)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!bankName || !accountNumber.trim() || !accountName.trim()) {
      setError('Please complete all bank fields.')
      return
    }
    setError('')
    setSaving(true)
    const res = await onSave({
      bankName,
      bankAccountNumber: accountNumber.trim(),
      bankAccountName: accountName.trim(),
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
      title="Edit bank details"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="gold" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Bank Name" htmlFor="eb-bank">
          <select id="eb-bank" className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)}>
            <option value="">— Select your bank —</option>
            {BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bank Account Number" htmlFor="eb-acct-no">
          <input
            id="eb-acct-no"
            className={inputClass}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="1234567890"
          />
        </Field>
        <Field
          label="Bank Account Name"
          htmlFor="eb-acct-name"
          hint="Enter the name exactly as it appears on your bank account."
        >
          <input
            id="eb-acct-name"
            className={inputClass}
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Juan Dela Cruz"
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
