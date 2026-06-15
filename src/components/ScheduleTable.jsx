import { formatDate, formatPeso } from '../lib/amortization'
import { Badge } from './ui'

// Amortization schedule grid.
// `view="admin"` shows the full principal/interest breakdown;
// `view="user"` shows only the payment date and total amortization.
// `paidSet` (optional Set of installment numbers) renders per-row payment
// status, sourced from the shared transactions store.
export default function ScheduleTable({ schedule, view = 'admin', paidSet = null }) {
  const showBreakdown = view === 'admin'
  const showStatus = paidSet !== null
  const hasUpfrontFees = (schedule.upfrontFees ?? 0) > 0
  const today = new Date()
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${showBreakdown ? 'min-w-[560px]' : 'min-w-[360px]'}`}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-3">#</th>
            <th scope="col" className="px-4 py-3">Payment Due Date</th>
            {showBreakdown && (
              <>
                <th scope="col" className="px-4 py-3 text-right">Principal</th>
                <th scope="col" className="px-4 py-3 text-right">Interest</th>
              </>
            )}
            <th scope="col" className="px-4 py-3 text-right">Total Amortization</th>
            {showStatus && <th scope="col" className="px-4 py-3">Status</th>}
          </tr>
        </thead>
        <tbody>
          {schedule.rows.map((row) => {
            const paid = showStatus && paidSet.has(row.n)
            const due = showStatus && !paid && new Date(row.date) <= today
            return (
              <tr
                key={row.n}
                className="border-b border-slate-100 transition-colors duration-150 hover:bg-navy-50/50"
              >
                <td className="px-4 py-2.5 font-mono text-slate-500">{row.n}</td>
                <td className="px-4 py-2.5 text-slate-700">{formatDate(row.date)}</td>
                {showBreakdown && (
                  <>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {formatPeso(row.principal)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {formatPeso(row.interest)}
                    </td>
                  </>
                )}
                <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-900">
                  {formatPeso(row.total)}
                  {row.fees > 0 && <span aria-hidden="true">*</span>}
                </td>
                {showStatus && (
                  <td className="px-4 py-2.5">
                    <Badge status={paid ? 'paid' : due ? 'due' : 'upcoming'}>
                      {paid ? 'Paid' : due ? 'Due' : 'Upcoming'}
                    </Badge>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-navy-50/70 text-sm font-semibold text-navy-900">
            <td className="px-4 py-3" colSpan={2}>
              TOTALS
            </td>
            {showBreakdown && (
              <>
                <td className="px-4 py-3 text-right font-mono">
                  {formatPeso(schedule.totals.principal)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatPeso(schedule.totals.interest)}
                </td>
              </>
            )}
            <td className="px-4 py-3 text-right font-mono">{formatPeso(schedule.totals.total)}</td>
            {showStatus && <td className="px-4 py-3" />}
          </tr>
        </tfoot>
      </table>
      {hasUpfrontFees && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          * The first payment includes {formatPeso(schedule.upfrontFees)} in fees &amp; deductions
          (not deducted from the loan proceeds).
        </p>
      )}
    </div>
  )
}
