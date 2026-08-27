import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { BORROWER_STATUS_LABELS, STATUS_LABELS, borrowerStatus } from '../lib/transactions'
import { Badge, inputClass } from './ui'
import Pagination from './Pagination'
import { usePagination } from '../hooks/usePagination'

// Uncontrolled input that commits to the parent only on blur (so each
// keystroke doesn't fire a persist+audit write). `key={value}` remounts it
// when the committed value changes externally, keeping it in sync without
// a state-syncing effect.
function EditCell({ value, type = 'text', onCommit, className = '', ...props }) {
  return (
    <input
      key={String(value ?? '')}
      type={type}
      defaultValue={value ?? ''}
      onBlur={(e) => {
        if (String(e.target.value) !== String(value ?? '')) onCommit(e.target.value)
      }}
      className={`${inputClass} !min-h-8 !px-2 !py-1 !text-xs ${className}`}
      {...props}
    />
  )
}

// Borrower-facing amortization grid driven by the shared transactions store.
// `showTxnDate` adds the availment-date column (Straight Transactions view).
// `editable` + `onUpdate(id, patch)` turn the rows into inline editors — used
// by the admin while viewing a borrower; read-only for the borrower.
export default function BorrowerScheduleTable({
  transactions,
  showTxnDate = false,
  editable = false,
  onUpdate,
  pageSize = 0, // 0 = show all; >0 paginates rows while the footer keeps full totals
}) {
  const today = toISODate(new Date())
  const total = transactions.reduce((s, t) => s + t.amount, 0)
  const colCount = 2 + (showTxnDate ? 1 : 0) + 2 // # + desc + [txn] + due + paid, before amount
  const paginate = pageSize > 0
  const pag = usePagination(transactions, paginate ? pageSize : 1)
  const rows = paginate ? pag.pageItems : transactions
  // Background tint shared by table rows and mobile cards: emerald for credits
  // (negative amounts), red for past due, transparent otherwise.
  const tintFor = (t, status) =>
    t.amount < 0
      ? 'bg-emerald-50/70'
      : status === 'past_due'
        ? 'bg-red-50/70'
        : ''
  return (
    <>
    {/* Mobile: stacked cards (ports the mobile app's TxnRow) so each schedule
        row fits a single phone-width view instead of a horizontally-scrolling
        table. Hidden at md+, where the full table below takes over. */}
    <div className="md:hidden">
      {rows.map((t) => {
        const status = borrowerStatus(t, today)
        const tint = tintFor(t, status)
        return editable ? (
          <div key={t.id} className={`space-y-2.5 border-b border-slate-100 px-3 py-3 ${tint}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-medium text-slate-500">#{t.n}</span>
              <select
                value={t.status}
                onChange={(e) => onUpdate(t.id, { status: e.target.value })}
                aria-label={`Status for installment ${t.n}`}
                className={`${inputClass} !min-h-8 !w-32 !px-2 !py-1 !text-xs`}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Item Description
              </span>
              <EditCell
                value={t.description}
                onCommit={(v) => onUpdate(t.id, { description: v })}
                className="!w-full"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {showTxnDate && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Txn Date
                  </span>
                  <EditCell
                    type="date"
                    value={t.txnDate}
                    onCommit={(v) => onUpdate(t.id, { txnDate: v })}
                    className="!w-full"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Payment Due Date
                </span>
                <EditCell
                  type="date"
                  value={t.dueDate}
                  onCommit={(v) => onUpdate(t.id, { dueDate: v })}
                  className="!w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Payment Date
                </span>
                <EditCell
                  type="date"
                  value={t.datePaid ?? ''}
                  onCommit={(v) => onUpdate(t.id, { datePaid: v || null })}
                  className="!w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Total Amortization
                </span>
                <EditCell
                  type="number"
                  value={t.amount}
                  onCommit={(v) => onUpdate(t.id, { amount: Number(v) || 0 })}
                  className="!w-full !text-right"
                  step="0.01"
                  min="0"
                />
              </label>
            </div>
          </div>
        ) : (
          <div key={t.id} className={`flex items-center gap-3 border-b border-slate-100 px-3 py-3 ${tint}`}>
            <span className="w-6 shrink-0 font-mono text-xs text-slate-400">{t.n}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-slate-800">{t.description}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                {showTxnDate ? `Txn ${formatDate(t.txnDate)} · ` : ''}Due {formatDate(t.dueDate)}
                {t.datePaid ? ` · Paid ${formatDate(t.datePaid)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-mono text-[13px] font-semibold text-slate-900">{formatPeso(t.amount)}</span>
              <Badge status={status}>{BORROWER_STATUS_LABELS[status]}</Badge>
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between gap-3 bg-navy-50/70 px-3 py-3 text-sm font-semibold text-navy-900">
        <span>
          TOTALS ({transactions.length} item{transactions.length === 1 ? '' : 's'})
        </span>
        <span className="font-mono">{formatPeso(total)}</span>
      </div>
    </div>

    {/* Desktop / tablet: full table (md and up). */}
    <div className="hidden overflow-x-auto md:block">
      <table className={`w-full text-sm ${editable ? 'min-w-[820px]' : 'min-w-[640px]'}`}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3">#</th>
            <th scope="col" className="px-4 py-3">Item Description</th>
            {showTxnDate && <th scope="col" className="px-4 py-3">Txn Date</th>}
            <th scope="col" className="px-4 py-3">Payment Due Date</th>
            <th scope="col" className="px-4 py-3">Payment Date</th>
            <th scope="col" className="px-4 py-3 text-right">Total Amortization</th>
            <th scope="col" className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const status = borrowerStatus(t, today)
            return (
              <tr
                key={t.id}
                className={`border-b border-slate-100 transition-colors duration-150 ${
                  t.amount < 0
                    ? 'bg-emerald-50/70 hover:bg-emerald-50'
                    : status === 'past_due'
                      ? 'bg-red-50/70 hover:bg-red-50'
                      : 'hover:bg-navy-50/50'
                }`}
              >
                <td className="px-4 py-2.5 font-mono text-slate-500">{t.n}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  {editable ? (
                    <EditCell value={t.description} onCommit={(v) => onUpdate(t.id, { description: v })} />
                  ) : (
                    t.description
                  )}
                </td>
                {showTxnDate && (
                  <td className="px-4 py-2.5 text-slate-700">
                    {editable ? (
                      <EditCell type="date" value={t.txnDate} onCommit={(v) => onUpdate(t.id, { txnDate: v })} />
                    ) : (
                      formatDate(t.txnDate)
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5 text-slate-700">
                  {editable ? (
                    <EditCell type="date" value={t.dueDate} onCommit={(v) => onUpdate(t.id, { dueDate: v })} />
                  ) : (
                    formatDate(t.dueDate)
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-700">
                  {editable ? (
                    <EditCell
                      type="date"
                      value={t.datePaid ?? ''}
                      onCommit={(v) => onUpdate(t.id, { datePaid: v || null })}
                    />
                  ) : t.datePaid ? (
                    formatDate(t.datePaid)
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-900">
                  {editable ? (
                    <EditCell
                      type="number"
                      value={t.amount}
                      onCommit={(v) => onUpdate(t.id, { amount: Number(v) || 0 })}
                      className="!text-right"
                      step="0.01"
                      min="0"
                    />
                  ) : (
                    formatPeso(t.amount)
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {editable ? (
                    <select
                      value={t.status}
                      onChange={(e) => onUpdate(t.id, { status: e.target.value })}
                      aria-label={`Status for installment ${t.n}`}
                      className={`${inputClass} !min-h-8 !w-28 !px-2 !py-1 !text-xs`}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge status={status}>{BORROWER_STATUS_LABELS[status]}</Badge>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-navy-50/70 text-sm font-semibold text-navy-900">
            <td className="px-4 py-3" colSpan={colCount}>
              TOTALS ({transactions.length} item{transactions.length === 1 ? '' : 's'})
            </td>
            <td className="px-4 py-3 text-right font-mono">{formatPeso(total)}</td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </table>
    </div>
    {paginate && transactions.length > 0 && (
      <Pagination
        page={pag.page}
        pageCount={pag.pageCount}
        pageSize={pag.pageSize}
        total={pag.total}
        start={pag.start}
        end={pag.end}
        onPageChange={pag.setPage}
        onPageSizeChange={pag.setPageSize}
        pageSizeOptions={[15, 25, 50, 100]}
        itemLabel="items"
      />
    )}
    </>
  )
}
