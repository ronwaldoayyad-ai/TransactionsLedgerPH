import { useState } from 'react'
import { Button, Field, Modal, inputClass } from '../ui'
import Icon from '../Icon'

const BLANK = { name: '', type: 'toast', title: '', body: '' }

// Full CRUD for reusable announcement templates. Mounted only while open (the
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
    setForm({ name: t.name, type: t.type, title: t.title, body: t.body })
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const payload = { name: form.name.trim(), type: form.type, title: form.title.trim(), body: form.body.trim() }
    if (editingId) await onUpdate(editingId, payload)
    else await onCreate(payload)
    setSaving(false)
    startNew()
  }

  return (
    <Modal
      open
      title="Message templates"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        {/* Editor */}
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {editingId ? 'Edit template' : 'New template'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Template name" htmlFor="tpl-name">
              <input id="tpl-name" className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Payment reminder" />
            </Field>
            <Field label="Type" htmlFor="tpl-type">
              <div className="grid grid-cols-2 gap-2" id="tpl-type">
                {['toast', 'banner'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ type: t })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      form.type === t ? 'border-navy-300 bg-navy-50 text-navy-800' : 'cursor-pointer border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="Title (optional)" htmlFor="tpl-title">
            <input id="tpl-title" className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="🚀 New Feature Live!" />
          </Field>
          <Field label="Message" htmlFor="tpl-body">
            <textarea id="tpl-body" rows={2} className={inputClass} value={form.body} onChange={(e) => set({ body: e.target.value })} />
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved templates ({templates.length})</p>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400">No templates yet — save one above.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {templates.map((t) => (
                <li key={t.id} className={`flex items-center gap-3 px-3 py-2.5 ${editingId === t.id ? 'bg-navy-50/50' : ''}`}>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.type === 'toast' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                    {t.type}
                  </span>
                  <button onClick={() => startEdit(t)} className="min-w-0 flex-1 cursor-pointer text-left">
                    <span className="block truncate text-sm font-medium text-slate-900">{t.name || 'Untitled'}</span>
                    <span className="block truncate text-xs text-slate-500">{t.title ? `${t.title} — ` : ''}{t.body}</span>
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    aria-label="Delete template"
                    className="shrink-0 cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
