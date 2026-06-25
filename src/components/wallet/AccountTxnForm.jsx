import { useState } from 'react'
import { Button, CurrencyInput, Field, Modal, inputClass } from '../ui'
import { INCOME_CATEGORIES, accountMask } from '../../lib/wallet'

// Add Income / Add Expense modal for a deposit account.
//   expense → debits the selected account's available balance (asks Merchant)
//   income  → credits it (asks Category)
// Mounted with a `key` by the parent so it initializes fresh each time it opens.
export default function AccountTxnForm({ kind, accounts, defaultAccountId, today, onClose, onSave }) {
  const isExpense = kind === 'expense'
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? '')
  const [amount, setAmount] = useState(0)
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState(INCOME_CATEGORIES[0])
  const [txnDate, setTxnDate] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const canSave = accountId && amount > 0 && txnDate

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const res = await onSave({
      accountId,
      kind,
      amount,
      merchant: isExpense ? merchant.trim() : '',
      category: isExpense ? '' : category,
      txnDate,
      note: note.trim(),
    })
    setSaving(false)
    if (res?.error) setSaveError(typeof res.error === 'string' ? res.error : 'Could not save — please try again.')
    else onClose()
  }

  return (
    <Modal
      open
      title={isExpense ? 'Add Expense' : 'Add Income'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={isExpense ? 'primary' : 'success'}
            disabled={!canSave || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : isExpense ? 'Add Expense' : 'Add Income'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{saveError}</p>
        )}
        <p className="text-sm text-slate-600">
          {isExpense
            ? 'This amount is deducted from the selected account’s available balance.'
            : 'This amount is added to the selected account’s available balance.'}
        </p>
        <Field label="Account" htmlFor="wt-account">
          <select id="wt-account" className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{accountMask(a)}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount (₱)" htmlFor="wt-amount">
          <CurrencyInput id="wt-amount" value={amount} onValueChange={(v) => setAmount(v ?? 0)} />
        </Field>
        {isExpense ? (
          <Field label="Merchant Name" htmlFor="wt-merchant">
            <input id="wt-merchant" className={inputClass} value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. SM Supermarket" />
          </Field>
        ) : (
          <Field label="Category" htmlFor="wt-category">
            <select id="wt-category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Transaction Date" htmlFor="wt-date">
          <input id="wt-date" type="date" className={inputClass} value={txnDate ?? ''} onChange={(e) => setTxnDate(e.target.value)} />
        </Field>
        <Field label="Notes" htmlFor="wt-note">
          <textarea id="wt-note" rows={2} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
    </Modal>
  )
}
