import { useState } from 'react'
import { Button, CurrencyInput, Field, Modal, Switch, inputClass } from '../ui'
import { CATEGORIES, NETWORKS, TIERS } from '../../lib/wallet'

const BLANK = {
  bankName: '',
  bankLogo: '',
  networkLogo: '',
  primaryColor: '#1e3a8a',
  secondaryColor: '#0ea5e9',
  first6: '',
  last4: '',
  network: 'Visa',
  tier: 'Classic',
  category: '',
  creditLimit: 0,
  availableLimit: 0,
  statementDate: '',
  dueDate: '',
  activationDate: '',
  expiryDate: '',
  naffl: false,
  amf: 0,
  amfDate: '',
}

// Add/Edit card modal. Mounted with a `key` by the parent so it initializes
// fresh from `initial` each time it opens.
export default function CardForm({ open, initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...(initial ?? {}) }))
  const [logoName, setLogoName] = useState('')
  const [netLogoName, setNetLogoName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Dual logo inputs (bank + network override): URL and file are mutually exclusive.
  const fileToField = (file, field, setName) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      set({ [field]: String(reader.result) }) // base64 data URI (PRD §2)
      setName(file.name)
    }
    reader.readAsDataURL(file)
  }
  const urlValue = form.bankLogo.startsWith('data:') ? '' : form.bankLogo
  const onUrl = (e) => {
    set({ bankLogo: e.target.value })
    setLogoName('')
  }
  const onFile = (e) => fileToField(e.target.files?.[0], 'bankLogo', setLogoName)
  const netUrlValue = (form.networkLogo || '').startsWith('data:') ? '' : form.networkLogo || ''
  const onNetUrl = (e) => {
    set({ networkLogo: e.target.value })
    setNetLogoName('')
  }
  const onNetFile = (e) => fileToField(e.target.files?.[0], 'networkLogo', setNetLogoName)

  const save = async () => {
    setSaving(true)
    setSaveError('')
    const err = await onSave(form)
    setSaving(false)
    // onSave returns an error message string on failure, or null/undefined on success.
    if (err) setSaveError(typeof err === 'string' ? err : 'Could not save — please try again.')
    else onClose()
  }

  return (
    <Modal
      open={open}
      title={initial ? 'Edit Card' : 'Add New Card'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {saveError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            Couldn&apos;t save the card: {saveError}
          </p>
        )}
        <Field label="Bank Name" htmlFor="wc-bank">
          <input id="wc-bank" className={inputClass} value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank Logo Image URL" htmlFor="wc-logo-url">
            <input id="wc-logo-url" type="url" placeholder="https://…" className={inputClass} value={urlValue} onChange={onUrl} />
          </Field>
          <Field label="Or Upload Bank Logo" htmlFor="wc-logo-file">
            <input id="wc-logo-file" type="file" accept="image/*" onChange={onFile} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-2 file:py-1.5 file:text-xs" />
            {logoName && <p className="mt-1 truncate text-xs text-slate-500">{logoName}</p>}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            ['Primary Color', 'primaryColor'],
            ['Secondary Color', 'secondaryColor'],
          ].map(([label, key]) => (
            <Field key={key} label={label} htmlFor={`wc-${key}`}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={label} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-slate-300" />
                <input id={`wc-${key}`} className={`${inputClass} font-mono`} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
              </div>
            </Field>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="First 6 Digits" htmlFor="wc-first6">
            <input id="wc-first6" inputMode="numeric" maxLength={6} className={`${inputClass} font-mono`} value={form.first6} onChange={(e) => set({ first6: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
          </Field>
          <Field label="Last 4 Digits" htmlFor="wc-last4">
            <input id="wc-last4" inputMode="numeric" maxLength={4} className={`${inputClass} font-mono`} value={form.last4} onChange={(e) => set({ last4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Network" htmlFor="wc-network">
            <select id="wc-network" className={inputClass} value={form.network} onChange={(e) => set({ network: e.target.value })}>
              {NETWORKS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Tier" htmlFor="wc-tier">
            <select id="wc-tier" className={inputClass} value={form.tier} onChange={(e) => set({ tier: e.target.value })}>
              {TIERS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Category" htmlFor="wc-cat">
            <select id="wc-cat" className={inputClass} value={form.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">(None)</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Network Logo URL (override)" htmlFor="wc-net-url" hint="Optional — overrides the auto logo.">
            <input id="wc-net-url" type="url" placeholder="https://…" className={inputClass} value={netUrlValue} onChange={onNetUrl} />
          </Field>
          <Field label="Or Upload Network Logo" htmlFor="wc-net-file">
            <input id="wc-net-file" type="file" accept="image/*" onChange={onNetFile} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-2 file:py-1.5 file:text-xs" />
            {netLogoName && <p className="mt-1 truncate text-xs text-slate-500">{netLogoName}</p>}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Credit Limit (₱)" htmlFor="wc-credit">
            <CurrencyInput id="wc-credit" value={form.creditLimit} onValueChange={(v) => set({ creditLimit: v ?? 0 })} />
          </Field>
          <Field label="Available Limit (₱)" htmlFor="wc-avail">
            <CurrencyInput id="wc-avail" value={form.availableLimit} onValueChange={(v) => set({ availableLimit: v ?? 0 })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Statement Date" htmlFor="wc-stmt" hint="e.g. 1st">
            <input id="wc-stmt" className={inputClass} value={form.statementDate} onChange={(e) => set({ statementDate: e.target.value })} />
          </Field>
          <Field label="Due Date" htmlFor="wc-due" hint="e.g. 21st">
            <input id="wc-due" className={inputClass} value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Card Activation Date" htmlFor="wc-activation" hint="Used to compute how long you've had the card.">
            <input id="wc-activation" type="date" className={inputClass} value={form.activationDate ?? ''} onChange={(e) => set({ activationDate: e.target.value })} />
          </Field>
          <Field label="Card Expiry Date" htmlFor="wc-expiry">
            <input id="wc-expiry" type="date" className={inputClass} value={form.expiryDate ?? ''} onChange={(e) => set({ expiryDate: e.target.value })} />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="text-sm font-medium text-slate-700">No Annual Fee for Life (NAFFL)</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {form.naffl ? 'Annual fee waived for life.' : 'This card has an annual membership fee.'}
              </span>
            </span>
            <Switch checked={form.naffl} onChange={(v) => set({ naffl: v })} label="No Annual Fee for Life" />
          </label>
          {!form.naffl && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Annual Membership Fee (₱)" htmlFor="wc-amf">
                <CurrencyInput id="wc-amf" value={form.amf} onValueChange={(v) => set({ amf: v ?? 0 })} />
              </Field>
              <Field label="Anniversary Date (AMF charged)" htmlFor="wc-amf-date">
                <input id="wc-amf-date" type="date" className={inputClass} value={form.amfDate ?? ''} onChange={(e) => set({ amfDate: e.target.value })} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
