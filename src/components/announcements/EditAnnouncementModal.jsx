import { useState } from 'react'
import { Button, Field, Modal, MultiSelect, inputClass } from '../ui'

// Local YYYY-MM-DD for a date input from an ISO timestamp.
const toDateInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Edit an existing announcement: title, message, audience/targets, and expiry.
// (Type is shown but kept as-is.) Mounted only while open so it inits fresh.
export default function EditAnnouncementModal({ announcement, options, onSave, onClose }) {
  const [title, setTitle] = useState(announcement.title)
  const [body, setBody] = useState(announcement.body)
  const [audience, setAudience] = useState(announcement.audience)
  const [targetSel, setTargetSel] = useState(() => new Set(announcement.targetUserIds))
  const [until, setUntil] = useState(toDateInput(announcement.expiresAt))
  const [saving, setSaving] = useState(false)

  const canSave = body.trim().length > 0 && (audience === 'all' || targetSel.size > 0)

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave({
      title: title.trim(),
      body: body.trim(),
      audience,
      targetUserIds: [...targetSel],
      expiresAt: until ? new Date(`${until}T23:59:59`).toISOString() : null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal
      open
      title="Edit announcement"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Type: <span className="font-semibold capitalize text-slate-700">{announcement.type}</span>
        </p>

        <Field label="Title (optional)" htmlFor="edit-title">
          <input id="edit-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Message" htmlFor="edit-body">
          <textarea id="edit-body" rows={3} className={inputClass} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>

        <Field label="Audience" htmlFor="edit-aud">
          <div className="grid grid-cols-2 gap-2" id="edit-aud">
            {[['all', 'All borrowers'], ['targeted', 'Specific borrowers']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAudience(value)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  audience === value ? 'border-navy-300 bg-navy-50 text-navy-800' : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {audience === 'targeted' && (
          <Field label="Recipients" htmlFor="edit-targets" hint="Pick the borrowers who should see this.">
            <MultiSelect label="borrowers" options={options} selected={targetSel} onChange={setTargetSel} className="w-full" />
          </Field>
        )}

        <Field label="Show until (optional)" htmlFor="edit-until" hint="Reappears on every login until this date. Leave blank to keep showing until you delete it.">
          <input id="edit-until" type="date" className={`${inputClass} w-48`} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
