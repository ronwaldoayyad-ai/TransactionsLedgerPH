import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { useDisbursements } from '../../context/DisbursementsContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Modal, inputClass } from '../../components/ui'
import { formatDate, formatPeso } from '../../lib/amortization'
import { disbursementStatusMeta } from '../../lib/disbursement'
import { disbursementPdfBlobUrl, downloadDisbursementPdf } from '../../lib/disbursementPdf'
import { useAcceptDisbursement } from '../../hooks/useAcceptDisbursement'

const SORT_OPTS = [
  ['disbursementDate', 'Disbursement Date'],
  ['netProceeds', 'Net Proceeds'],
  ['acknowledged', 'Accepted'],
]

// Borrower view: read-only list of disbursement documents assigned to them, with
// preview, download, and a one-time acknowledgment CHECKBOX. Checking it accepts
// the agreement (acknowledge_loan_disbursement RPC), which stamps the acceptance
// and notifies every admin. RLS guarantees they only ever receive their own
// ASSIGNED disbursements.
export default function Disbursements() {
  const { session } = useApp()
  const { disbursements } = useDisbursements()
  const acceptDisbursement = useAcceptDisbursement()
  const myName = session.user.name

  const [preview, setPreview] = useState(null)
  const [ackBusy, setAckBusy] = useState(false)
  const [ackErr, setAckErr] = useState('')

  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('disbursementDate')
  const [sortDir, setSortDir] = useState('desc')
  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  // Inject the borrower's display name so the PDF header/acknowledgment read correctly.
  const toPdf = (d) => ({ ...d, billedToName: myName, acknowledgedByName: myName })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const dir = sortDir === 'asc' ? 1 : -1
    return disbursements
      .filter((d) => !q || String(d.disbursementNumber).toLowerCase().includes(q))
      .sort((a, b) => {
        let cmp
        if (sortKey === 'netProceeds') cmp = (a.netProceeds || 0) - (b.netProceeds || 0)
        else if (sortKey === 'acknowledged') cmp = (a.acknowledgedAt ? 1 : 0) - (b.acknowledgedAt ? 1 : 0)
        else cmp = String(a.disbursementDate || '').localeCompare(String(b.disbursementDate || ''))
        return (cmp || String(a.disbursementNumber).localeCompare(String(b.disbursementNumber))) * dir
      })
  }, [disbursements, query, sortKey, sortDir])

  const doAcknowledge = async (d) => {
    setAckErr('')
    setAckBusy(true)
    const { disbursement, error } = await acceptDisbursement(d)
    setAckBusy(false)
    if (error) {
      setAckErr(error)
      return
    }
    // Reflect the stamped acceptance immediately in the open modal.
    if (disbursement) setPreview(disbursement)
  }

  const openPreview = (d) => {
    setAckErr('')
    setPreview(d)
  }

  return (
    <>
      <PageHeader
        title="My Disbursements"
        subtitle="Loan disbursement documents issued to your account. Open one to review, download, and accept."
        action={<RefreshButton />}
      />

      <Card>
        <CardHeader
          title="Disbursements"
          subtitle={disbursements.length === visible.length ? `${disbursements.length} issued` : `${visible.length} of ${disbursements.length}`}
        />
        {disbursements.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search disbursement no…"
              aria-label="Search disbursements"
              className={`${inputClass} sm:max-w-[16rem]`}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-500">Sort</span>
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {SORT_OPTS.map(([k, t]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleSort(k)}
                    aria-pressed={sortKey === k}
                    className={`min-h-8 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 ${
                      sortKey === k ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sortKey === k ? `${t} ${sortDir === 'asc' ? '↑' : '↓'}` : t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {disbursements.length === 0 ? (
          <EmptyState
            icon="file"
            title="No disbursements yet"
            body="When your administrator issues a loan disbursement document, it will appear here for you to review and accept."
          />
        ) : visible.length === 0 ? (
          <EmptyState icon="file" title="No matching disbursements" body="Adjust the search or sort." />
        ) : (
          <>
          {/* Mobile: stacked cards so every value stays visible (no clipping). */}
          <div className="md:hidden">
            {visible.map((d) => (
              <div key={d.id} className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px] font-semibold text-slate-900">{d.disbursementNumber}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      Disbursed {formatDate(d.disbursementDate)}
                    </p>
                  </div>
                  {d.acknowledgedAt ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <Icon name="check" className="h-3.5 w-3.5" />
                      Accepted
                    </span>
                  ) : (
                    <Badge status="upcoming">Action needed</Badge>
                  )}
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-semibold text-slate-900">{formatPeso(d.netProceeds)}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openPreview(d)}
                      title="Review"
                      aria-label={`Review ${d.disbursementNumber}`}
                      className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                    >
                      <Icon name="file" className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => downloadDisbursementPdf(toPdf(d))}
                      title="Download PDF"
                      aria-label={`Download ${d.disbursementNumber}`}
                      className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                    >
                      <Icon name="download" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Disbursement No</th>
                  <th className="px-5 py-3">Disbursement Date</th>
                  <th className="px-5 py-3 text-right">Net Proceeds</th>
                  <th className="px-5 py-3">Accepted</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-navy-50/40">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700">{d.disbursementNumber}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(d.disbursementDate)}</td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-slate-900">
                      {formatPeso(d.netProceeds)}
                    </td>
                    <td className="px-5 py-3.5">
                      {d.acknowledgedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <Icon name="check" className="h-3.5 w-3.5" />
                          {formatDate(d.acknowledgedAt.slice(0, 10))}
                        </span>
                      ) : (
                        <Badge status="upcoming">Action needed</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openPreview(d)}
                          title="Review"
                          aria-label={`Review ${d.disbursementNumber}`}
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="file" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadDisbursementPdf(toPdf(d))}
                          title="Download PDF"
                          aria-label={`Download ${d.disbursementNumber}`}
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="download" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {preview && (
        <Modal
          open
          title={`Disbursement ${preview.disbursementNumber}`}
          onClose={() => setPreview(null)}
        >
          <div className="space-y-4">
            <iframe
              title={`Preview ${preview.disbursementNumber}`}
              src={disbursementPdfBlobUrl(toPdf(preview))}
              className="h-[58vh] w-full rounded-lg border border-slate-200"
            />

            {/* Acknowledgment: a one-time checkbox. Once checked it locks and shows
                when it was accepted; checking it notifies every admin. */}
            <div
              className={`rounded-lg border px-4 py-3 ${
                preview.acknowledgedAt ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!!preview.acknowledgedAt}
                  disabled={!!preview.acknowledgedAt || ackBusy}
                  onChange={() => !preview.acknowledgedAt && doAcknowledge(preview)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-navy-800 focus:ring-navy-800 disabled:cursor-not-allowed"
                  aria-label="Acknowledge and accept this disbursement"
                />
                <span className="text-sm text-slate-700">
                  I acknowledge the gross amount, the itemized deductions, and the net amount, and I accept
                  the terms of this loan disbursement agreement.
                  {preview.acknowledgedAt && (
                    <span className="mt-1 block text-xs font-medium text-emerald-700">
                      Accepted on {formatDate(preview.acknowledgedAt.slice(0, 10))}. Your administrator has been notified.
                    </span>
                  )}
                </span>
              </label>
              {ackBusy && <p className="mt-2 text-xs text-slate-500">Recording your acceptance…</p>}
              {ackErr && <p className="mt-2 text-xs font-medium text-red-600">{ackErr}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge status={disbursementStatusMeta(preview.status).badge}>
                {disbursementStatusMeta(preview.status).label}
              </Badge>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPreview(null)}>
                  Close
                </Button>
                <Button variant="gold" onClick={() => downloadDisbursementPdf(toPdf(preview))}>
                  <Icon name="download" className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
