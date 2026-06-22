import { formatDate, formatPeso, toISODate } from '../lib/amortization'
import { BORROWER_STATUS_LABELS, STATUS_LABELS, borrowerStatus } from '../lib/transactions'
import { Badge, inputClass } from './ui'

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
}) {
  const today = toISODate(new Date())
  const total = transactions.reduce((s, t) => s + t.amount, 0)
  const colCount = 2 + (showTxnDate ? 1 : 0) + 2 // # + desc + [txn] + due + paid, before amount
  return (
    <div className="overflow-x-auto">
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
          {transactions.map((t) => {
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
  )
}
