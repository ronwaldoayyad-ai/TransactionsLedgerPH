import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import StatusBadge from '../../components/loanrequest/StatusBadge'
import HistoryTimeline from '../../components/loanrequest/HistoryTimeline'
import UpdateStatusModal from '../../components/loanrequest/UpdateStatusModal'
import { Button, Card, CardHeader, EmptyState, Field, Modal, Switch, inputClass } from '../../components/ui'
import { formatPeso } from '../../lib/amortization'
import { TERMS } from '../../lib/loanRequest'

// --- Feature Visibility: enable/disable loan requests per borrower ---
function AccessRow({ userId, initialEnabled, onSave }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = enabled !== initialEnabled

  const save = async () => {
    setSaving(true)
    await onSave(userId, enabled)
    setSaving(false)
    setSaved(true)
  }

  return (
    <div className="flex items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <Switch checked={enabled} onChange={(v) => { setEnabled(v); setSaved(false) }} label="Enable loan requests" />
        {enabled ? 'Enabled' : 'Disabled'}
      </label>
      <Button onClick={save} disabled={saving || (!dirty && saved)}>
        {saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save'}
      </Button>
    </div>
  )
}

function FeatureVisibility({ borrowers }) {
  const { accessFor, setAccess } = useLoanRequests()
  const [selectedId, setSelectedId] = useState('')

  return (
    <Card>
      <CardHeader title="Master Control — Feature Visibility" subtitle="Enable cash loan requests per borrower." />
      <div className="space-y-4 px-5 py-4">
        <Field label="Select Borrower" htmlFor="fv-borrower">
          <select id="fv-borrower" className={inputClass} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">— Select a borrower —</option>
            {borrowers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        {selectedId ? (
          <AccessRow key={selectedId} userId={selectedId} initialEnabled={accessFor(selectedId)} onSave={setAccess} />
        ) : (
          <p className="text-sm text-slate-500">Pick a borrower to toggle their access.</p>
        )}
      </div>
    </Card>
  )
}

// --- Rate configuration: per-term monthly add-on rate (4 decimals, in %) ---
function RateConfig({ initialRates, onSaveRate }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(TERMS.map((t) => [t, ((initialRates[t] ?? 0) * 100).toFixed(4)])),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const save = async () => {
    setSaving(true)
    for (const t of TERMS) {
      const pct = Number(draft[t])
      if (!Number.isNaN(pct)) await onSaveRate(t, pct / 100)
    }
    setSaving(false)
    setSaved(true)
  }

  return (
    <Card>
      <CardHeader title="Loan Rate Configuration" subtitle="Monthly add-on rate per term (4 decimal places)." />
      <div className="space-y-3 px-5 py-4">
        {TERMS.map((t) => (
          <div key={t} className="flex items-center gap-3">
            <label htmlFor={`rate-${t}`} className="w-24 text-sm font-medium text-slate-700">
              {t} months:
            </label>
            <input
              id={`rate-${t}`}
              type="number"
              step="0.0001"
              min="0"
              className={`${inputClass} w-32`}
              value={draft[t]}
              onChange={(e) => { setDraft((d) => ({ ...d, [t]: e.target.value })); setSaved(false) }}
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        ))}
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Rates'}
        </Button>
      </div>
    </Card>
  )
}

export default function LoanRequests() {
  const { users } = useApp()
  const { requests, rates, ratesByTerm, eventsFor, updateStatus, updateFees, deleteRequests, setRate } =
    useLoanRequests()
  const borrowers = useMemo(() => users.filter((u) => u.role === 'user'), [users])
  const nameOf = (id) => users.find((u) => u.id === id)?.name ?? '—'

  const [updating, setUpdating] = useState(null) // request being status-updated
  const [historyOf, setHistoryOf] = useState(null) // request whose history is shown
  const [selected, setSelected] = useState(() => new Set()) // ids checked for deletion
  const [confirming, setConfirming] = useState(null) // ids pending delete confirmation
  const [busy, setBusy] = useState(false)

  const pag = usePagination(requests, 10)

  const handleSave = async ({ status, note, fees }) => {
    if (fees) {
      const feeRes = await updateFees(updating.id, fees)
      if (feeRes?.error) return feeRes
    }
    return updateStatus(updating.id, status, note)
  }

  const pageIds = pag.pageItems.map((r) => r.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAllPage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  const confirmDelete = async () => {
    setBusy(true)
    await deleteRequests(confirming)
    setBusy(false)
    setSelected((prev) => {
      const next = new Set(prev)
      confirming.forEach((id) => next.delete(id))
      return next
    })
    setConfirming(null)
  }

  return (
    <>
      <PageHeader title="Loan Requests" subtitle="Configure rates, control access, and process borrower loan requests." />

      <div className="grid gap-6 lg:grid-cols-2">
        <FeatureVisibility borrowers={borrowers} />
        {rates.length > 0 ? (
          <RateConfig initialRates={ratesByTerm} onSaveRate={setRate} />
        ) : (
          <Card>
            <CardHeader title="Loan Rate Configuration" />
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Rate configuration loads once the loan-requests schema is set up.
            </p>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Loan Request Approval"
          subtitle={`${requests.length} request${requests.length === 1 ? '' : 's'}`}
          action={
            selected.size > 0 ? (
              <button
                onClick={() => setConfirming([...selected])}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                <Icon name="trash" className="h-4 w-4" />
                Delete selected ({selected.size})
              </button>
            ) : null
          }
        />
        {requests.length === 0 ? (
          <EmptyState icon="file" title="No loan requests yet" body="Borrower requests will appear here for review." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleAllPage}
                        aria-label="Select all on this page"
                        className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                      />
                    </th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Borrower</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Term</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pag.pageItems.map((r) => (
                    <tr key={r.id} className={`border-b border-slate-100 hover:bg-navy-50/40 ${selected.has(r.id) ? 'bg-navy-50/40' : ''}`}>
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Select ${r.reference}`}
                          className="h-4 w-4 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                        />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.reference}</td>
                      <td className="px-4 py-2.5 text-slate-700">{nameOf(r.userId)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatPeso(r.amount)}</td>
                      <td className="px-4 py-2.5 text-slate-700">{r.termMonths} months</td>
                      <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setHistoryOf(r)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            <Icon name="scroll" className="h-3.5 w-3.5" />
                            View History
                          </button>
                          <button
                            onClick={() => setUpdating(r)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gold-500 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-gold-600"
                          >
                            <Icon name="pencil" className="h-3.5 w-3.5" />
                            Update Status
                          </button>
                          <button
                            onClick={() => setConfirming([r.id])}
                            aria-label="Delete request"
                            title="Delete"
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pag.page}
              pageCount={pag.pageCount}
              pageSize={pag.pageSize}
              total={pag.total}
              start={pag.start}
              end={pag.end}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
              itemLabel="requests"
            />
          </>
        )}
      </Card>

      {updating && (
        <UpdateStatusModal request={updating} onSave={handleSave} onClose={() => setUpdating(null)} />
      )}

      {historyOf && (
        <Modal open title={`History — ${historyOf.reference}`} onClose={() => setHistoryOf(null)}>
          <HistoryTimeline events={eventsFor(historyOf.id)} />
        </Modal>
      )}

      {confirming && (
        <Modal
          open
          title={`Delete ${confirming.length} loan request${confirming.length === 1 ? '' : 's'}`}
          onClose={() => (busy ? null : setConfirming(null))}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={busy}>
                {busy ? 'Deleting…' : `Delete ${confirming.length}`}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            This permanently deletes {confirming.length} loan request{confirming.length === 1 ? '' : 's'} and{' '}
            {confirming.length === 1 ? 'its' : 'their'} history. This action cannot be undone.
          </p>
        </Modal>
      )}
    </>
  )
}
