import { useState } from 'react'
import { useApp } from '../context/AppContext'
import Icon from './Icon'
import { Badge, Button, EmptyState, Field, Modal, inputClass } from './ui'
import { formatDate, formatPeso } from '../lib/amortization'

const TABS = ['pending', 'approved', 'rejected', 'all']

// Shared proof-of-payment list used by the admin Verification Queue (and the
// Overview mirror) with review actions, and by the borrower's My Payments /
// Recent Payments read-only (View + Download, no Approve/Reject).
export default function PaymentList({
  payments,
  canReview = false,
  showTabs = true,
  showBorrower = false,
  defaultTab,
  emptyBody = 'No submissions yet.',
}) {
  const { users, loans, reviewPayment, getProofUrl, deletePayment } = useApp()
  // Admin queue defaults to "pending" (work to do); the borrower's own history
  // defaults to "all" so approved/rejected proofs aren't hidden.
  const [filter, setFilter] = useState(defaultTab ?? (showTabs ? 'pending' : 'all'))
  const [rejecting, setRejecting] = useState(null)
  const [note, setNote] = useState('')
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null) // payment pending delete confirm
  const [busy, setBusy] = useState(false)

  const list = payments.filter((p) => filter === 'all' || p.status === filter)
  const pendingCount = payments.filter((p) => p.status === 'pending').length

  const hasProof = (p) => !!(p.fileUrl || p.filePath)
  const openProof = async (p) => {
    const url = await getProofUrl(p)
    if (url) setViewing({ ...p, fileUrl: url })
  }
  const downloadProof = async (p) => {
    const url = await getProofUrl(p)
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = p.fileName
    a.click()
  }
  const confirmReject = () => {
    reviewPayment(rejecting.id, 'rejected', note.trim())
    setRejecting(null)
    setNote('')
  }
  const confirmDelete = async () => {
    setBusy(true)
    await deletePayment(deleting)
    setBusy(false)
    setDeleting(null)
  }

  return (
    <>
      {showTabs && (
        <div
          className="flex flex-wrap gap-2 px-5 pt-4"
          role="tablist"
          aria-label="Filter payments by status"
        >
          {TABS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`min-h-9 cursor-pointer rounded-full px-3.5 py-1 text-sm font-medium capitalize transition-colors duration-200 ${
                filter === f
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-300 bg-white/70 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f}
              {f === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 text-xs opacity-80">({pendingCount})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState icon="upload" title="Nothing here" body={emptyBody} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {list.map((p) => {
            const borrower = users.find((u) => u.id === p.userId)
            const loan = loans.find((l) => l.id === p.loanId)
            return (
              <li key={p.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => hasProof(p) && openProof(p)}
                    disabled={!hasProof(p)}
                    aria-label={`View proof ${p.fileName}`}
                    title={hasProof(p) ? 'View proof' : 'File unavailable'}
                    className="flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 transition-colors duration-200 hover:border-navy-400 hover:text-navy-700 disabled:cursor-not-allowed"
                  >
                    <Icon name={p.fileType === 'pdf' ? 'file' : 'image'} className="h-5 w-5" />
                    <span className="text-[10px] font-medium uppercase">{p.fileType}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {showBorrower && <span>{borrower?.name ?? p.userId} · </span>}
                      <span className="font-mono text-sm text-slate-700">{formatPeso(p.amount)}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {loan?.label ?? p.loanId ?? 'Payment'} · {p.method} · Ref {p.reference}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {p.fileName} · submitted {formatDate(p.submittedAt)}
                      {p.reviewedAt && ` · reviewed ${formatDate(p.reviewedAt)}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasProof(p) && (
                      <>
                        <Button
                          variant="ghost"
                          className="!min-h-9 !px-2.5"
                          onClick={() => openProof(p)}
                          aria-label={`View proof ${p.fileName}`}
                        >
                          <Icon name="eye" className="h-4 w-4" />
                          View
                        </Button>
                        <button
                          onClick={() => downloadProof(p)}
                          aria-label={`Download proof ${p.fileName}`}
                          title="Download proof"
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="download" className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setDeleting(p)}
                      aria-label={`Delete proof ${p.fileName}`}
                      title="Delete proof permanently"
                      className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                    <Badge status={p.status} />
                    {canReview &&
                      (p.status === 'pending' ? (
                        <>
                          <Button
                            variant="primary"
                            className="!min-h-9 !px-3"
                            onClick={() => reviewPayment(p.id, 'approved')}
                          >
                            <Icon name="check" className="h-4 w-4" />
                            Approve
                          </Button>
                          <Button
                            variant="danger"
                            className="!min-h-9 !px-3"
                            onClick={() => setRejecting(p)}
                          >
                            <Icon name="x" className="h-4 w-4" />
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          className="!min-h-9 !px-3"
                          onClick={() => reviewPayment(p.id, 'pending')}
                        >
                          Re-open
                        </Button>
                      ))}
                  </div>
                </div>
                {p.status === 'rejected' && p.note && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">Admin note:</span> {p.note}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Reject reason (admin only) */}
      <Modal
        open={!!rejecting}
        title="Reject payment proof"
        onClose={() => setRejecting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReject}>
              Reject submission
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          The borrower will see this submission marked <Badge status="rejected" /> along with your
          note. They can re-upload a corrected proof.
        </p>
        <div className="mt-4">
          <Field label="Reason (shown to borrower)" htmlFor="reject-note">
            <textarea
              id="reject-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
              placeholder="e.g. Reference number not legible. Please re-upload a clearer photo."
            />
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation (both roles) */}
      <Modal
        open={!!deleting}
        title="Delete proof of payment"
        onClose={() => !busy && setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={busy}>
              <Icon name="trash" className="h-4 w-4" />
              {busy ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This permanently deletes the proof <span className="font-semibold">{deleting?.fileName}</span>{' '}
          and its file from storage. This cannot be undone.
        </p>
      </Modal>

      {/* Proof preview */}
      <Modal
        open={!!viewing}
        title={viewing?.fileName ?? 'Proof of payment'}
        onClose={() => setViewing(null)}
        footer={
          viewing && (
            <a
              href={viewing.fileUrl}
              download={viewing.fileName}
              className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-navy-700"
            >
              <Icon name="download" className="h-4 w-4" />
              Download
            </a>
          )
        }
      >
        {viewing &&
          (viewing.fileUrl.startsWith('data:image') || viewing.fileType === 'image' ? (
            <img
              src={viewing.fileUrl}
              alt={`Proof of payment: ${viewing.fileName}`}
              className="mx-auto max-h-[55vh] rounded-lg border border-slate-200"
            />
          ) : (
            <iframe
              src={viewing.fileUrl}
              title={`Proof of payment: ${viewing.fileName}`}
              className="h-[55vh] w-full rounded-lg border border-slate-200"
            />
          ))}
      </Modal>
    </>
  )
}
