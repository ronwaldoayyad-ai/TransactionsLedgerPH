import { useState } from 'react'
import { Button, CurrencyInput, Field, Modal, inputClass } from '../ui'

const BLANK = {
  accountNumber: '',
  productType: '',
  bankName: '',
  bankCode: '',
  swiftCode: '',
  branch: '',
  ownership: '',
  availableBalance: 0,
  maintainingBalance: 0,
  debitCardNumber: '',
}

// Add/Edit account modal. Mounted with a `key` by the parent so it initializes
// fresh from `initial` each time it opens (keep-open-on-error like CardForm).
export default function AccountForm({ open, initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...(initial ?? {}) }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const txt = (label, key, props = {}) => (
    <Field label={label} htmlFor={`wa-${key}`}>
      <input id={`wa-${key}`} className={inputClass} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </Field>
  )

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const err = await onSave(form)
    setSaving(false)
    if (err) setSaveError(typeof err === 'string' ? err : 'Could not save — please try again.')
    else onClose()
  }

  return (
    <Modal
      open={open}
      title={initial ? 'Edit Account' : 'Add Account'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            Couldn&apos;t save the account: {saveError}
          </p>
        )}
        {txt('Account Number', 'accountNumber', { inputMode: 'numeric' })}
        <div className="grid grid-cols-2 gap-4">
          {txt('Product Type', 'productType', { placeholder: 'e.g. Savings' })}
          {txt('Bank Name', 'bankName')}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {txt('Bank Code', 'bankCode', { placeholder: 'e.g. BPI' })}
          {txt('Swift Code', 'swiftCode')}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {txt('Branch of Account', 'branch')}
          {txt('Ownership', 'ownership', { placeholder: 'e.g. Single / Joint' })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Available Balance (₱)" htmlFor="wa-avail">
            <CurrencyInput id="wa-avail" allowNegative value={form.availableBalance} onValueChange={(v) => set({ availableBalance: v ?? 0 })} />
          </Field>
          <Field label="Maintaining Balance (₱)" htmlFor="wa-maint">
            <CurrencyInput id="wa-maint" value={form.maintainingBalance} onValueChange={(v) => set({ maintainingBalance: v ?? 0 })} />
          </Field>
        </div>
        {txt('Debit Card Number', 'debitCardNumber', { inputMode: 'numeric' })}
      </div>
    </Modal>
  )
}
