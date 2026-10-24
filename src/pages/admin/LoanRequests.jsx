import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useLoanRequests } from '../../context/LoanRequestsContext'
import { useNotifications } from '../../context/NotificationsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import StatusBadge from '../../components/loanrequest/StatusBadge'
import HistoryTimeline from '../../components/loanrequest/HistoryTimeline'
import RequestDetailBody from '../../components/loanrequest/RequestDetailBody'
import UpdateStatusModal from '../../components/loanrequest/UpdateStatusModal'
import { Button, Card, CardHeader, EmptyState, Field, Modal, Switch, inputClass } from '../../components/ui'
import { formatPeso } from '../../lib/amortization'
import { TERMS, statusNotification } from '../../lib/loanRequest'

// --- Feature Visibility: enable/disable loan requests per borrower ---
function AccessRow({ userId, initialEnabled, onSave }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error,setError]=useState('')
  const dirty = enabled !== initialEnabled

  const save = async () => {
    setSaving(true)
    setError('');setSaved(false)
    try{const result=await onSave(userId, enabled);if(result?.error)setError(result.error);else setSaved(true)}catch(e){setError(e.message)}finally{setSaving(false)}
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <Switch checked={enabled} onChange={(v) => { setEnabled(v); setSaved(false) }} label="Enable loan requests" />
        {enabled ? 'Enabled' : 'Disabled'}
      </label>
      <Button onClick={save} disabled={saving || (!dirty && saved)}>
        {saving ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save'}
      </Button>
      {error&&<p role="alert" className="w-full text-sm text-red-700">{error}</p>}
    </div>
  )
}

function FeatureVisibility({ borrowers }) {
  const { accessFor, setAccess, accessReady, accessError, refreshRequests } = useLoanRequests()
  const [selectedId, setSelectedId] = useState('')
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('all')
  const enabledCount=borrowers.filter(b=>accessFor(b.id)).length
  const query=search.trim().toLowerCase()
  const visible=borrowers.filter(b=>(filter==='all'||accessFor(b.id)===(filter==='enabled'))&&[b.name,b.email,b.accountNumber].some(v=>String(v||'').toLowerCase().includes(query))).sort((a,b)=>String(a.name).localeCompare(String(b.name)))
  return <Card>
    <CardHeader title="Master Control — Feature Visibility" subtitle="Enable cash loan requests per borrower." />
    <div className="space-y-4 px-5 py-4">
      {accessError&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{accessError}<Button variant="secondary" onClick={refreshRequests} className="mt-2">Retry access</Button></div>}
      <Field label="Select Borrower" htmlFor="fv-borrower"><select id="fv-borrower" className={inputClass} value={selectedId} disabled={!accessReady} onChange={e=>setSelectedId(e.target.value)}><option value="">— Select a borrower —</option>{borrowers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      {selectedId&&accessReady?<AccessRow key={selectedId+':'+accessFor(selectedId)} userId={selectedId} initialEnabled={accessFor(selectedId)} onSave={setAccess}/>:<p className="text-sm text-slate-500">{accessReady?'Pick a borrower to toggle their access.':'Loading loan-request access…'}</p>}
    </div>
    <section aria-label="Borrower loan-request access" className="border-t border-slate-100">
      <div className="space-y-3 px-5 py-4"><h3 className="text-sm font-semibold text-slate-900">Borrower loan-request access</h3><p className="text-xs text-slate-500">Borrowers without enabled access cannot start a new loan request.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter borrower access">{[['all','All',borrowers.length],['enabled','Enabled',enabledCount],['disabled','Disabled',borrowers.length-enabledCount]].map(([value,label,count])=><button key={value} type="button" aria-pressed={filter===value} disabled={!accessReady} onClick={()=>setFilter(value)} className={'rounded-full border px-3 py-1.5 text-xs font-medium '+(filter===value?'border-navy-800 bg-navy-800 text-white':'border-slate-200 bg-white text-slate-600')}>{label}{accessReady?' ('+count+')':''}</button>)}</div>
      <input aria-label="Search borrower access" placeholder="Search name, email or account number" className={inputClass} value={search} onChange={e=>setSearch(e.target.value)}/></div>
      {accessReady&&<ul className="max-h-96 overflow-y-auto divide-y divide-slate-100">{visible.length?visible.map(b=><li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-slate-900">{b.name}</p><p className="break-all text-xs text-slate-500">{b.email}{b.accountNumber?' · '+b.accountNumber:''}</p></div><span className={'rounded-full border px-2 py-0.5 text-xs font-medium '+(accessFor(b.id)?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-slate-200 bg-slate-50 text-slate-600')}>{accessFor(b.id)?'Enabled':'Disabled'}</span><button type="button" aria-label={'Manage loan-request access for '+b.name} className="text-xs font-medium text-blue-700 underline underline-offset-2" onClick={()=>{setSelectedId(b.id);document.getElementById('fv-borrower')?.focus()}}>Manage</button></li>):<li className="px-5 py-4 text-sm text-slate-500">No borrowers match this filter.</li>}</ul>}
    </section>
  </Card>
}

// --- Rate configuration: per-term monthly add-on rate (4 decimals, in %) ---
function RateConfig({ initialRates, onSaveRates }) {
  const signature=JSON.stringify(initialRates)
  const [source,setSource]=useState(signature)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(TERMS.map((t) => [t, initialRates[t]===undefined?'':(initialRates[t] * 100).toFixed(4)])),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error,setError]=useState('')
  if(source!==signature){setSource(signature);setDraft(Object.fromEntries(TERMS.map(t=>[t,initialRates[t]===undefined?'':(initialRates[t]*100).toFixed(4)])));setSaved(false)}

  const save = async () => {
    setSaving(true)
    setError('');setSaved(false)
    try{const result=await onSaveRates(draft);if(result?.error)setError(result.error);else setSaved(true)}catch(e){setError(e.message)}finally{setSaving(false)}
  }

  return (
    <Card>
      <CardHeader title="Loan Rate Configuration" subtitle="Monthly add-on rate per term (4 decimal places)." />
      <div className="space-y-3 px-5 py-4">
        {!Object.keys(initialRates).length&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No rates have been configured yet. Enter a rate for each term and save. Blank fields are not treated as zero interest.</p>}
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
              max="100"
              disabled={saving}
              placeholder="Not configured"
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
        {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {saved&&<p role="status" className="text-sm text-emerald-700">All loan rates saved.</p>}
      </div>
    </Card>
  )
}

export default function LoanRequests() {
  const { users } = useApp()
  const { requests, ratesByTerm,ratesError,loading,refreshRequests,saveRates, eventsFor, updateStatus, updateFees, deleteRequests } =
    useLoanRequests()
  const { createNotification } = useNotifications()
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
    const statusChanged = status !== updating.status
    const res = await updateStatus(updating.id, status, note)
    // Automation: notify the borrower only when the status actually changed.
    // The status update is the source of truth — a notify failure never fails
    // the save (swallowed and logged), matching the disbursement automation.
    if (!res?.error && statusChanged) {
      try {
        await createNotification({
          autoEvent:'loan.status_changed',eventPayload:{source_id:updating.id,status,note,reference:updating.reference||''},
          ...statusNotification({ status, note, reference: updating.reference }),
          audience: 'targeted',
          targetUserIds: [updating.userId],
        })
      } catch (e) {
        console.error('[loan-requests] status notification failed:', e?.message ?? e)
      }
    }
    return res
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
        {!loading&&!ratesError ? (
          <RateConfig initialRates={ratesByTerm} onSaveRates={saveRates} />
        ) : (
          <Card>
            <CardHeader title="Loan Rate Configuration" />
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              {loading?'Loading loan rates…':ratesError}
            </p>
            {!loading&&<div className="px-5 pb-5"><Button variant="secondary" onClick={refreshRequests}>Retry loading rates</Button></div>}
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
            {/* Mobile: stacked cards so every field wraps into view (no
                horizontal scroll). Mirrors the desktop table's data + actions. */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {pag.pageItems.map((r) => (
                <li
                  key={r.id}
                  className={`px-4 py-3.5 ${selected.has(r.id) ? 'bg-navy-50/40' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Select ${r.reference}`}
                      className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-navy-800 focus:ring-navy-800"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-slate-900">{nameOf(r.userId)}</p>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{r.reference}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                        <span className="font-mono font-semibold text-slate-900">{formatPeso(r.amount)}</span>
                        <span className="text-slate-500">{r.termMonths} months</span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          onClick={() => setHistoryOf(r)}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          <Icon name="file" className="h-3.5 w-3.5" />
                          View
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
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
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
                            <Icon name="file" className="h-3.5 w-3.5" />
                            View
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
        <Modal open title={historyOf.reference} onClose={() => setHistoryOf(null)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Borrower: <span className="font-medium text-slate-900">{nameOf(historyOf.userId)}</span>
              </p>
              <StatusBadge status={historyOf.status} />
            </div>
            <RequestDetailBody request={historyOf} />
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">History Timeline</h3>
              <HistoryTimeline events={eventsFor(historyOf.id)} />
            </div>
          </div>
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
