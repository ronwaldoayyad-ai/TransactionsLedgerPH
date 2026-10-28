import {useMemo} from 'react'
import {useApp} from '../context/AppContext'
import {buildCreditActivity} from '../lib/paymentReadModel'
import {formatDate,formatPeso} from '../lib/amortization'

export default function BorrowerCreditActivity(){
  const {session,paymentPostings,transactions,archivedTransactions,paymentLogs}=useApp()
  const ownerId=session?.user.id
  const rows=useMemo(()=>buildCreditActivity({ownerId,postings:paymentPostings,transactions:[...transactions,...archivedTransactions],logs:paymentLogs}),[ownerId,paymentPostings,transactions,archivedTransactions,paymentLogs])
  if(!rows.length)return null
  return <section aria-label="Account credit activity" className="mb-6 space-y-3">
    <h2 className="text-base font-semibold text-slate-900">Account credit activity</h2>
    <p className="text-sm text-slate-600">Credit applied to your dues. These entries use existing credit, not new cash payments.</p>
    {rows.map(row=><article key={row.id} className={`rounded-xl border p-4 text-sm ${row.status==='applied'?'border-emerald-200 bg-emerald-50/60':'border-slate-200 bg-slate-50'}`}>
      <div className="flex flex-wrap justify-between gap-2"><strong>{row.status==='reversal'?'Credit application reversed':'Account credit applied'}</strong><strong className={row.status==='applied'?'text-emerald-800':'text-slate-600'}>{formatPeso(row.creditUsed)}</strong></div>
      <p className="mt-1 text-xs text-slate-600">{formatDate(row.date)}{row.status==='reversed'?' · Reversed':''}{row.reference?' · '+row.reference:''}</p>
      {row.cashIncluded>0&&<p className="mt-2">Cash included in this posting: {formatPeso(row.cashIncluded)} · Total applied: {formatPeso(row.totalApplied)}</p>}
      <details className="mt-3"><summary className="cursor-pointer font-medium">Allocation breakdown ({row.allocations.length})</summary>
        <ul className="mt-2 space-y-3">{row.allocations.map((a,i)=><li key={i} className="rounded-lg bg-white/70 p-3">
          <strong className="break-words">{a.description}</strong>{a.dueDate&&<p className="text-xs text-slate-500">Due {formatDate(a.dueDate)}</p>}
          <dl className="mt-2 grid grid-cols-2 gap-2"><dt>Balance before</dt><dd className="text-right">{formatPeso(a.beforeBalance)}</dd><dt>{row.status==='reversal'?'Allocation reversed':'Applied to due'}</dt><dd className="text-right">{formatPeso(a.amount)}</dd><dt>Balance after this entry</dt><dd className="text-right font-semibold">{formatPeso(a.afterBalance)}</dd></dl>
        </li>)}</ul>
        {!row.allocations.length&&<p>Allocation details are unavailable.</p>}
      </details>
      {row.note&&<p className="mt-2 break-words text-xs text-slate-600">{row.note}</p>}
    </article>)}
  </section>
}
