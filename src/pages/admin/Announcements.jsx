import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useAnnouncements } from '../../context/AnnouncementsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import TemplatesModal from '../../components/announcements/TemplatesModal'
import EditAnnouncementModal from '../../components/announcements/EditAnnouncementModal'
import { Button, Card, CardHeader, EmptyState, Field, MultiSelect, inputClass } from '../../components/ui'

const TYPES = [
  ['toast', 'Toast', 'Top-right card, auto-dismisses after 30s'],
  ['banner', 'Banner', 'Full-width bar that pushes the page down'],
]

const fmt = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : null)

export default function Announcements() {
  const { users } = useApp()
  const { announcements, createAnnouncement, updateAnnouncement, deleteAnnouncement, templates, createTemplate, updateTemplate, deleteTemplate } =
    useAnnouncements()

  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const options = useMemo(() => borrowers.map((b) => ({ value: b.id, label: b.name })), [borrowers])
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? id

  const [type, setType] = useState('toast')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [targetSel, setTargetSel] = useState(() => new Set())
  const [until, setUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [tplOpen, setTplOpen] = useState(false)
  const [tplDraft, setTplDraft] = useState(null)
  const [editing, setEditing] = useState(null) // announcement being edited

  const templatesForType = templates.filter((t) => t.type === type)
  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setTitle(t.title)
    setBody(t.body)
  }

  const canSave = body.trim().length > 0 && (audience === 'all' || targetSel.size > 0)

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    await createAnnouncement({
      type,
      title: title.trim(),
      body: body.trim(),
      audience,
      targetUserIds: [...targetSel],
      expiresAt: until ? new Date(`${until}T23:59:59`).toISOString() : null,
    })
    setSaving(false)
    setTitle('')
    setBody('')
    setAudience('all')
    setTargetSel(new Set())
    setUntil('')
  }

  const [now] = useState(() => Date.now())

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="Broadcast a toast or banner to all borrowers, or target specific ones."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Composer */}
        <Card>
          <CardHeader title="New announcement" />
          <div className="space-y-4 px-5 py-4">
            <Field label="Type" htmlFor="ann-type">
              <div className="grid grid-cols-2 gap-2" id="ann-type">
                {TYPES.map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      type === value ? 'border-navy-300 bg-navy-50' : 'cursor-pointer border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Start from a template" htmlFor="ann-tpl" hint="Pick a saved message to fill the fields below.">
              <div className="flex gap-2">
                <select
                  id="ann-tpl"
                  className={inputClass}
                  value=""
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">— Select a {type} template —</option>
                  {templatesForType.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.title || 'Untitled'}
                    </option>
                  ))}
                </select>
                <Button variant="secondary" onClick={() => { setTplDraft(null); setTplOpen(true) }}>
                  Manage
                </Button>
              </div>
            </Field>

            <Field label="Title (optional)" htmlFor="ann-title">
              <input
                id="ann-title"
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="🚀 New Feature Live!"
              />
            </Field>

            <Field label="Message" htmlFor="ann-body">
              <textarea
                id="ann-body"
                rows={3}
                className={inputClass}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="We've just added a new dark mode setting to your profile."
              />
            </Field>

            <Field label="Audience" htmlFor="ann-aud">
              <div className="grid grid-cols-2 gap-2" id="ann-aud">
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
              <Field label="Recipients" htmlFor="ann-targets" hint="Pick the borrowers who should see this.">
                <MultiSelect label="borrowers" options={options} selected={targetSel} onChange={setTargetSel} className="w-full" />
              </Field>
            )}

            <Field label="Show until (optional)" htmlFor="ann-until" hint="Reappears on every login until this date. Leave blank to keep showing until you delete it.">
              <input
                id="ann-until"
                type="date"
                className={`${inputClass} w-48`}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="secondary"
                onClick={() => { setTplDraft({ type, title: title.trim(), body: body.trim() }); setTplOpen(true) }}
                disabled={!body.trim()}
              >
                <Icon name="plus" className="h-4 w-4" />
                Save as template
              </Button>
              <Button variant="gold" onClick={submit} disabled={!canSave || saving}>
                <Icon name="send" className="h-4 w-4" />
                {saving ? 'Publishing…' : 'Publish announcement'}
              </Button>
            </div>
          </div>
        </Card>

        {/* Live preview */}
        <Card className="self-start">
          <CardHeader title="Preview" />
          <div className="px-5 py-5">
            {type === 'toast' ? (
              <div className="ml-auto w-80 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    {title && <p className="text-sm font-bold text-slate-900">{title}</p>}
                    <p className="mt-0.5 text-sm text-slate-600">{body || 'Your message preview appears here.'}</p>
                  </div>
                  <Icon name="x" className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-4 py-2.5 text-sm text-white">
                <Icon name="alert" className="h-4 w-4 shrink-0" />
                <p className="min-w-0 text-center">
                  {title && <span className="font-semibold">{title} </span>}
                  {body || 'Your message preview appears here.'}
                </p>
                <span className="shrink-0 rounded-md border border-white/40 bg-white/10 px-2.5 py-1 text-xs font-medium">Dismiss</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Published list */}
      <Card className="mt-6">
        <CardHeader title="Published" subtitle={`${announcements.length} announcement${announcements.length === 1 ? '' : 's'}`} />
        {announcements.length === 0 ? (
          <EmptyState icon="alert" title="No announcements yet" body="Publish one above to push it to borrowers." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {announcements.map((a) => {
              const expired = a.expiresAt && new Date(a.expiresAt).getTime() < now
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${a.type === 'toast' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>
                    {a.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {a.title ? `${a.title} — ` : ''}
                      <span className="font-normal text-slate-600">{a.body}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {a.audience === 'all' ? 'All borrowers' : `${a.targetUserIds.length} recipient${a.targetUserIds.length === 1 ? '' : 's'}: ${a.targetUserIds.map(nameOf).join(', ')}`}
                      {' · '}
                      {expired ? <span className="font-medium text-red-600">Expired</span> : a.expiresAt ? `Until ${fmt(a.expiresAt)}` : 'No expiry'}
                      {a.oneTime && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">one-time</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditing(a)}
                    aria-label="Edit announcement"
                    title="Edit"
                    className="shrink-0 cursor-pointer rounded-lg p-2 text-slate-500 transition-colors hover:bg-navy-50 hover:text-navy-800"
                  >
                    <Icon name="pencil" className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteAnnouncement(a.id)}
                    aria-label="Delete announcement"
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
          initialDraft={tplDraft}
          templates={templates}
          onCreate={createTemplate}
          onUpdate={updateTemplate}
          onDelete={deleteTemplate}
          onClose={() => setTplOpen(false)}
        />
      )}

      {editing && (
        <EditAnnouncementModal
          announcement={editing}
          options={options}
          onSave={(patch) => updateAnnouncement(editing.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
