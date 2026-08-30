import { useState } from 'react'
import { Button, Field, Modal, inputClass } from '../ui'
import Icon from '../Icon'
import { NOTIFICATION_CATEGORIES, categoryMeta } from '../../lib/notifications'

const BLANK = { name: '', category: 'general', title: '', body: '' }

// Full CRUD for reusable notification templates. Mounted only while open (the
// parent keys it), so the editor initialises fresh from `initialDraft`.
export default function TemplatesModal({ initialDraft, templates, onCreate, onUpdate, onDelete, onClose }) {
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => ({ ...BLANK, ...(initialDraft ?? {}) }))
  const [saving, setSaving] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const canSave = form.name.trim().length > 0 && form.body.trim().length > 0

  const startNew = () => {
    setEditingId(null)
    setForm({ ...BLANK })
  }
  const startEdit = (t) => {
    setEditingId(t.id)
    setForm({ name: t.name, category: t.category, title: t.title, body: t.body })
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category: form.category,
      title: form.title.trim(),
      body: form.body.trim(),
    }
    if (editingId) await onUpdate(editingId, payload)
    else await onCreate(payload)
    setSaving(false)
    startNew()
  }

  return (
    <Modal
      open
      title="Notification templates"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {/* Editor */}
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {editingId ? 'Edit template' : 'New template'}
          </p>
          <Field label="Template name" htmlFor="ntpl-name">
            <input
              id="ntpl-name"
              className={inputClass}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Payment reminder"
            />
          </Field>
          <Field label="Category" htmlFor="ntpl-cat">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" id="ntpl-cat">
              {NOTIFICATION_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set({ category: c.value })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.category === c.value
                      ? 'border-navy-300 bg-navy-50 text-navy-800'
                      : 'cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Title (optional)" htmlFor="ntpl-title">
            <input
              id="ntpl-title"
              className={inputClass}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="💰 Payment Received"
            />
          </Field>
          <Field label="Message" htmlFor="ntpl-body" hint="Bracketed variables like [amount] are filled in before sending.">
            <textarea
              id="ntpl-body"
              rows={3}
              className={inputClass}
              value={form.body}
              onChange={(e) => set({ body: e.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2">
            {editingId && <Button variant="secondary" onClick={startNew}>New</Button>}
            <Button onClick={save} disabled={!canSave || saving}>
              {saving ? 'Saving…' : editingId ? 'Update template' : 'Save template'}
            </Button>
          </div>
        </div>

        {/* List */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Saved templates ({templates.length})
          </p>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">No templates yet — save one above.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {templates.map((t) => {
                const m = categoryMeta(t.category)
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2.5 ${editingId === t.id ? 'bg-navy-50/50' : ''}`}
                  >
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${m.tone}`}>
                      {m.label}
                    </span>
                    <button onClick={() => startEdit(t)} className="min-w-0 flex-1 cursor-pointer text-left">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {t.name || 'Untitled'}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {t.title ? `${t.title} — ` : ''}
                        {t.body}
                      </span>
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      aria-label="Delete template"
                      className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
