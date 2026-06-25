import { useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import PaymentList from '../../components/PaymentList'
import RefreshButton from '../../components/RefreshButton'
import Toast from '../../components/Toast'
import { Button, Card, CardHeader, CurrencyInput, Field, inputClass } from '../../components/ui'

const ACCEPTED = '.jpg,.jpeg,.png,.pdf'
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

// Payment proof submission + status tracking for the borrower.
export default function Payments() {
  const { session, loans, payments, transactions, submitPayment, syncError, realSession, isViewingAs } =
    useApp()
  // Loan dropdown: only the borrower's loans that still have an outstanding
  // installment with a POSITIVE amount (not fully paid / refunded / cancelled).
  // Negative-amount items are credits (overpayment / partial-payment, e.g.
  // "Overpayment Credit") — there is nothing to pay against them, so they are
  // excluded from the selectable list.
  const myLoans = loans.filter((l) => {
    if (l.userId !== session.user.id) return false
    const txns = transactions.filter((t) => t.loanId === l.id)
    return txns.some((t) => t.amount > 0 && !['paid', 'refunded', 'cancelled'].includes(t.status))
  })
  const myPayments = payments.filter((p) => p.userId === session.user.id)
  const isLive = realSession?.source === 'supabase'

  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  // Multi-select: one proof can cover several loans that fall on the same due date.
  const [loanIds, setLoanIds] = useState(() => new Set())
  const [amount, setAmount] = useState(null)
  const [method, setMethod] = useState('GCash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const toastTimer = useRef(null)

  // Show an auto-dismissing toast; replaces any toast already on screen.
  const showToast = (next) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ ...next, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 4500)
  }

  const toggleLoan = (id) =>
    setLoanIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const acceptFile = (f) => {
    if (!f) return
    if (!/\.(jpe?g|png|pdf)$/i.test(f.name)) {
      setError('Unsupported file type. Only JPG, PNG, or PDF files are accepted.')
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(
        `File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). The maximum allowed size is 5 MB.`,
      )
      return
    }
    setFile(f)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return setError('Please attach your proof of payment.')
    if (loanIds.size === 0) return setError('Please select at least one loan this payment is for.')
    if (!amount || amount <= 0) return setError('Please enter the amount you paid.')
    setError('')
    // One proof can cover multiple loans (same due date) — record it against each.
    const ids = [...loanIds]
    let saved
    try {
      const results = []
      for (const id of ids) {
        const payment = await submitPayment(session.user.name, {
          userId: session.user.id,
          loanId: id,
          amount,
          method,
          reference: reference.trim() || '—',
          fileName: file.name,
          fileType: /\.pdf$/i.test(file.name) ? 'pdf' : 'image',
          file, // live mode uploads this to Storage
          // Demo fallback: session-scoped object URL so view/download still work.
          fileUrl: URL.createObjectURL(file),
        })
        results.push(payment)
      }
      saved = results.filter(Boolean).length
    } catch {
      saved = 0
    }
    // Any shortfall (thrown error or a rejected save) is an upload failure.
    if (saved < ids.length) {
      showToast({
        variant: 'error',
        title: 'Upload Failed',
        message: 'Please try uploading again.',
      })
      return
    }
    setFile(null)
    setAmount(null)
    setReference('')
    setLoanIds(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ''
    showToast({
      variant: 'success',
      title: 'Upload Complete',
      message: 'Your proof of payment has been uploaded and now being verified.',
    })
  }

  return (
    <>
      <PageHeader
        title="My Payments"
        subtitle="Submit proof of payment and track its verification status."
        action={<RefreshButton />}
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Submit Proof of Payment"
            subtitle="GCash receipts, bank transfer screenshots, or PDFs"
          />
          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4" noValidate>
            {isViewingAs && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900">
                <Icon name="eye" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Submitting on behalf of <span className="font-semibold">{session.user.name}</span> — this
                proof will be attributed to this borrower.
              </p>
            )}
            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                acceptFile(e.dataTransfer.files[0])
              }}
              className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors duration-200 ${
                dragOver ? 'border-navy-600 bg-navy-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                    <Icon name={/\.pdf$/i.test(file.name) ? 'file' : 'image'} className="h-5 w-5" />
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">{file.name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="cursor-pointer text-xs text-red-600 transition-colors duration-200 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="mx-auto inline-flex rounded-full bg-white p-3 text-slate-400 shadow-sm">
                    <Icon name="upload" className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm text-slate-600">
                    Drag & drop your receipt here, or{' '}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer font-medium text-navy-700 underline-offset-2 hover:underline"
                    >
                      browse files
                    </button>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">JPG, PNG, or PDF · max 5 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                id="proof-file"
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                onChange={(e) => acceptFile(e.target.files[0])}
              />
            </div>

            <Field
              label="Loan(s)"
              htmlFor="pay-loans"
              hint="Select every loan this payment covers — useful when several share a due date."
            >
              <div
                id="pay-loans"
                className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-slate-300/80 bg-white/70 p-2"
              >
                {myLoans.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-slate-400">No outstanding loans to pay.</p>
                ) : (
                  myLoans.map((l) => (
                    <label
                      key={l.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={loanIds.has(l.id)}
                        onChange={() => toggleLoan(l.id)}
                        className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                      />
                      <span className="truncate">
                        {l.label} ({l.id})
                      </span>
                    </label>
                  ))
                )}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount paid (PHP)" htmlFor="pay-amount">
                <CurrencyInput
                  id="pay-amount"
                  value={amount}
                  onValueChange={setAmount}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Payment method" htmlFor="pay-method">
                <select
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className={inputClass}
                >
                  <option>GCash</option>
                  <option>Maya</option>
                  <option>Bank Transfer</option>
                  <option>Cash Deposit</option>
                </select>
              </Field>
            </div>

            <Field label="Reference number (optional)" htmlFor="pay-ref">
              <input
                id="pay-ref"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={inputClass}
                placeholder="e.g. GC-2026-123456"
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={myLoans.length === 0}>
              <Icon name="send" className="h-4 w-4" />
              Submit for verification
            </Button>
          </form>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="Submission History"
            subtitle={`${myPayments.length} proof${myPayments.length === 1 ? '' : 's'} submitted — view and download any of them`}
            action={<RefreshButton />}
          />
          {isLive && syncError && (
            <p
              role="alert"
              className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700"
            >
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Some records couldn&apos;t be loaded from the database ({syncError}). Tap Refresh; if
              proofs are still missing, contact your administrator.
            </p>
          )}
          <PaymentList
            payments={myPayments}
            defaultTab="all"
            emptyBody="Your uploaded proofs and their verification status will appear here."
          />
        </Card>
      </div>

      <Toast
        open={!!toast}
        variant={toast?.variant}
        title={toast?.title}
        message={toast?.message}
        onClose={() => setToast(null)}
      />
    </>
  )
}
