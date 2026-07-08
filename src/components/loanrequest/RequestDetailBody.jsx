import Icon from '../Icon'
import { Card, CardHeader } from '../ui'
import { formatPeso } from '../../lib/amortization'
import { buildRequestSchedule, requestSummary } from '../../lib/loanRequest'

function SummaryRow({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>{label}</span>
      <span className={`font-mono text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  )
}

// Read-only Cash Loan Summary + Bank Details + Amortization for a submitted
// request. Shared by the borrower's detail view and the admin's View modal.
// Pass `onEditBank` to surface an Edit affordance on the bank card (borrower).
export default function RequestDetailBody({ request, onEditBank }) {
  const feeArgs = {
    amount: request.amount,
    termMonths: request.termMonths,
    monthlyRate: request.monthlyRate,
    notarialFee: request.notarialFee,
    dst: request.dst,
  }
  const summary = requestSummary(feeArgs)
  const schedule = buildRequestSchedule(feeArgs)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Cash Loan Summary" />
        <div className="px-5 py-4">
          <div className="grid gap-x-6 sm:grid-cols-2">
            <SummaryRow label="Loan Amount" value={formatPeso(request.amount)} />
            <SummaryRow label="Monthly Add-on Rate" value={`${(request.monthlyRate * 100).toFixed(4)}%`} />
            <SummaryRow label="Processing Fee" value={formatPeso(request.processingFee)} />
            <SummaryRow label="DST Amount" value={formatPeso(request.dst)} />
            <SummaryRow label="Notarial Fee" value={formatPeso(request.notarialFee)} />
            <SummaryRow label="Payment Terms" value={`${request.termMonths} Months`} />
          </div>
          <div className="mt-2 border-t border-slate-200 pt-2">
            <SummaryRow label="Total Monthly Installment" value={formatPeso(summary.monthlyInstallment)} strong />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Disbursement Bank Details"
          action={
            onEditBank ? (
              <button
                onClick={onEditBank}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:bg-slate-50"
              >
                <Icon name="pencil" className="h-3.5 w-3.5" />
                Edit
              </button>
            ) : undefined
          }
        />
        <div className="px-5 py-2">
          {[
            ['Bank Name', request.bankName],
            ['Bank Account Number', request.bankAccountNumber],
            ['Bank Account Name', request.bankAccountName],
          ].map(([label, value], i) => (
            <div
              key={label}
              className={`flex items-center justify-between gap-3 py-2.5 ${i > 0 ? 'border-t border-slate-100' : ''}`}
            >
              <span className="text-sm text-slate-500">{label}</span>
              <span className="text-sm font-medium text-slate-900">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Amortization Schedule" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Month</th>
                <th className="px-4 py-3 text-right">Total Payment</th>
                <th className="px-4 py-3 text-right">Remaining Balance</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.month} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 text-slate-700">{row.month}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-900">{formatPeso(row.totalPayment)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-700">{formatPeso(row.remainingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
