import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useNotifications } from '../../context/NotificationsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import { Button, Card, CardHeader, EmptyState, Field, MultiSelect, inputClass } from '../../components/ui'
import {
  NOTIFICATION_CATEGORIES,
  categoryMeta,
  fileToAttachment,
  formatBytes,
  isImageAttachment,
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
} from '../../lib/notifications'
import TemplatesModal from '../../components/notifications/TemplatesModal'

const fmt = (iso) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : ''

function CategoryChip({ category }) {
  const m = categoryMeta(category)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.tone}`}>
      <Icon name={m.icon} className="h-3 w-3" />
      {m.label}
    </span>
  )
}

const emptyForm = { category: 'general', title: '', body: '', audience: 'all', attachments: [] }

export default function AdminNotifications() {
  const { users } = useApp()
  const {
    notifications, createNotification, updateNotification, deleteNotification, readCountFor, recipientCountFor,
    templates, createTemplate, updateTemplate, deleteTemplate,
  } = useNotifications()

  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const options = useMemo(() => borrowers.map((b) => ({ value: b.id, label: b.name })), [borrowers])
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id

  const [form, setForm] = useState(emptyForm)
  const [targetSel, setTargetSel] = useState(() => new Set())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [tplDraft, setTplDraft] = useState(null)
  const fileRef = useRef(null)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const canSave = form.body.trim().length > 0 && (form.audience === 'all' || targetSel.size > 0)

  // Admin-managed templates for the selected category (pre-fill title + message).
  const categoryTemplates = useMemo(
    () => templates.filter((t) => t.category === form.category),
    [templates, form.category],
  )
  const applyTemplate = (id) => {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    set({ title: tpl.title, body: tpl.body })
  }
  const openSaveAsTemplate = () => {
    setTplDraft({
      name: form.title.trim(),
      category: form.category,
      title: form.title.trim(),
      body: form.body.trim(),
    })
    setTplOpen(true)
  }
  const openManageTemplates = () => {
    setTplDraft(null)
    setTplOpen(true)
  }

  const reset = () => {
    setForm(emptyForm)
    setTargetSel(new Set())
    setEditingId(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const onPickFiles = async (e) => {
    setError('')
    const files = [...(e.target.files || [])]
    if (fileRef.current) fileRef.current.value = ''
    const room = MAX_ATTACHMENTS - form.attachments.length
    if (room <= 0) {
      setError(`Up to ${MAX_ATTACHMENTS} attachments.`)
      return
    }
    try {
      const added = await Promise.all(files.slice(0, room).map(fileToAttachment))
      set({ attachments: [...form.attachments, ...added] })
    } catch (err) {
      setError(err.message)
    }
  }

  const removeAttachment = (i) => set({ attachments: form.attachments.filter((_, idx) => idx !== i) })

  const startEdit = (n) => {
    setEditingId(n.id)
    setForm({
      category: n.category,
      title: n.title,
      body: n.body,
      audience: n.audience,
      attachments: n.attachments ?? [],
    })
    setTargetSel(new Set(n.targetUserIds ?? []))
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    const payload = {
      category: form.category,
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      targetUserIds: [...targetSel],
      attachments: form.attachments,
    }
    const res = editingId ? await updateNotification(editingId, payload) : await createNotification(payload)
    setSaving(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    reset()
  }

  const previewCat = categoryMeta(form.category)

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Send a categorized notification — with optional attachments — to all borrowers or specific ones."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Composer */}
        <Card>
          <CardHeader title={editingId ? 'Edit notification' : 'New notification'} />
          <div className="space-y-4 px-5 py-4">
            <Field label="Category" htmlFor="ntf-cat">
              <div className="grid grid-cols-2 gap-2" id="ntf-cat">
                {NOTIFICATION_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set({ category: c.value })}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.category === c.value
                        ? 'border-navy-300 bg-navy-50 text-navy-800'
                        : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon name={c.icon} className="h-4 w-4" />
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Start from a template"
              htmlFor="ntf-tpl"
              hint="Pick a saved message for this category to fill the fields below, or manage your templates."
            >
              <div className="flex items-center gap-2">
                <select
                  id="ntf-tpl"
                  className={inputClass}
                  value=""
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">
                    {categoryTemplates.length
                      ? `— Select a ${categoryMeta(form.category).label} template —`
                      : `No ${categoryMeta(form.category).label} templates yet`}
                  </option>
                  {categoryTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.title}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={openManageTemplates} className="shrink-0 whitespace-nowrap">
                  <Icon name="pencil" className="h-4 w-4" />
                  Manage
                </Button>
              </div>
            </Field>

            <Field label="Title (optional)" htmlFor="ntf-title">
              <input
                id="ntf-title"
                className={inputClass}
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder="Your statement of account is ready"
              />
            </Field>

            <Field label="Message" htmlFor="ntf-body">
              <textarea
                id="ntf-body"
                rows={3}
                className={inputClass}
                value={form.body}
                onChange={(e) => set({ body: e.target.value })}
                placeholder="We've attached your latest statement. Reply here if anything looks off."
              />
            </Field>

            <Field label="Attachments (optional)" htmlFor="ntf-files" hint="Images or PDF, up to 5 files.">
              <input
                ref={fileRef}
                id="ntf-files"
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                onChange={onPickFiles}
                className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy-800 hover:file:bg-navy-100"
              />
              {form.attachments.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {form.attachments.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm">
                      <Icon name={isImageAttachment(a) ? 'image' : 'file'} className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{a.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{formatBytes(a.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        aria-label={`Remove ${a.name}`}
                        className="shrink-0 cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            <Field label="Audience" htmlFor="ntf-aud">
              <div className="grid grid-cols-2 gap-2" id="ntf-aud">
                {[['all', 'All borrowers'], ['targeted', 'Specific borrowers']].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set({ audience: value })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.audience === value
                        ? 'border-navy-300 bg-navy-50 text-navy-800'
                        : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {form.audience === 'targeted' && (
              <Field label="Recipients" htmlFor="ntf-targets" hint="Pick the borrowers who should receive this.">
                <MultiSelect label="borrowers" options={options} selected={targetSel} onChange={setTargetSel} className="w-full" />
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingId && (
                <Button variant="secondary" onClick={reset}>
                  Cancel
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={openSaveAsTemplate}
                disabled={form.body.trim().length === 0}
              >
                <Icon name="file" className="h-4 w-4" />
                Save as template
              </Button>
              <Button variant="gold" onClick={submit} disabled={!canSave || saving}>
                <Icon name="send" className="h-4 w-4" />
                {saving ? 'Saving…' : editingId ? 'Update notification' : 'Send notification'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Live preview */}
        <Card className="self-start">
          <CardHeader title="Preview" subtitle="How the borrower sees it" />
          <div className="px-5 py-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <CategoryChip category={form.category} />
                <span className="text-xs text-slate-400">just now</span>
              </div>
              {form.title && <p className="mt-2 text-sm font-bold text-slate-900">{form.title}</p>}
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                {form.body || 'Your message preview appears here.'}
              </p>
              {form.attachments.length > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-navy-700">
                  <Icon name="file" className="h-3.5 w-3.5" />
                  {form.attachments.length} attachment{form.attachments.length === 1 ? '' : 's'}
                </p>
              )}
              <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
                <Icon name={previewCat.icon} className="mr-1 inline h-3 w-3" />
                {form.audience === 'all' ? 'All borrowers' : `${targetSel.size} recipient${targetSel.size === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sent list */}
      <Card className="mt-6">
        <CardHeader title="Sent" subtitle={`${notifications.length} notification${notifications.length === 1 ? '' : 's'}`} />
        {notifications.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet" body="Send one above to deliver it to borrowers." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notifications.map((n) => {
              const read = readCountFor(n.id)
              const total = recipientCountFor(n)
              return (
                <li key={n.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CategoryChip category={n.category} />
                      {n.title && <span className="text-sm font-semibold text-slate-900">{n.title}</span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.body}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span>
                        {n.audience === 'all'
                          ? 'All borrowers'
                          : `${n.targetUserIds.length} recipient${n.targetUserIds.length === 1 ? '' : 's'}: ${n.targetUserIds.map(nameOf).join(', ')}`}
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <Icon name="check" className="h-3 w-3" />
                        {read}/{total} read
                      </span>
                      {n.attachments?.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Icon name="file" className="h-3 w-3" />
                            {n.attachments.length}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{fmt(n.createdAt)}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(n)}
                    aria-label="Edit notification"
                    title="Edit"
                    className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-navy-50 hover:text-navy-800"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteNotification(n.id)}
                    aria-label="Delete notification"
                    title="Delete"
                    className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {tplOpen && (
        <TemplatesModal
          key={tplDraft ? 'draft' : 'manage'}
          initialDraft={tplDraft}
          templates={templates}
          onCreate={createTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onClose={() => setTplOpen(false)}
        />
      )}
    </>
  )
}
