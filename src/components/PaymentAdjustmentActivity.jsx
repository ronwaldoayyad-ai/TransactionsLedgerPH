import {useMemo} from 'react'
import {useApp} from '../context/AppContext'
import {buildPaymentAdjustments} from '../lib/paymentReadModel'
import {formatDate,formatPeso} from '../lib/amortization'

export default function PaymentAdjustmentActivity({ownerId:requestedOwner,search=''}){
 const {session,users,paymentPostings,transactions,archivedTransactions,paymentLogs}=useApp()
 const admin=session?.user.role==='admin',owner=admin?requestedOwner:session?.user.id
 const rows=useMemo(()=>{
  const ids=owner?[owner]:admin?[...new Set(paymentPostings.map(p=>p.user_id))]:[]
  return ids.flatMap(ownerId=>buildPaymentAdjustments({ownerId,postings:paymentPostings,transactions:[...transactions,...archivedTransactions],logs:paymentLogs}).map(r=>({...r,ownerId}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
 },[owner,admin,paymentPostings,transactions,archivedTransactions,paymentLogs])
 const visible=rows.filter(r=>!search||JSON.stringify([r.reference,r.note,r.dueDates,r.allocations,users.find(u=>u.id===r.ownerId)?.name]).toLowerCase().includes(search.toLowerCase()))
 if(!visible.length)return null
 return <section aria-label="Payment breakdown" className="mb-6 space-y-3"><h2 className="text-base font-semibold text-slate-900">Payment breakdown</h2><p className="text-sm text-slate-600">From saved postings. These amounts are already reflected in balances.</p>
 {visible.map(r=><article key={r.id} data-payment-adjustment-id={r.id} className={`rounded-xl border p-4 text-sm ${r.status==='reversed'?'border-slate-200 bg-slate-50':'border-emerald-200 bg-emerald-50/60'}`}>
  <header className="flex flex-wrap justify-between gap-2"><strong>{r.kind==='overpayment'?'Overpayment':'Partial Payment'} for {r.dueDates.length?r.dueDates.map(formatDate).join(' · '):'unallocated credit'}</strong><strong>−{formatPeso(Math.abs(r.amount))}</strong></header>
  <p className="mt-1 text-xs text-slate-600">{admin&&`${users.find(u=>u.id===r.ownerId)?.name||'Borrower'} · `}{formatDate(r.date)}{r.status==='reversed'?' · Reversed':''}{r.reference&&` · ${r.reference}`}</p>
  <details className="mt-3"><summary className="cursor-pointer font-medium">Allocation breakdown</summary><p className="mt-2">Cash received: {formatPeso(r.cashReceived)} · Credit used: {formatPeso(r.creditUsed)} · Applied to dues: {formatPeso(r.totalApplied)}</p><ul className="mt-2 space-y-2">{r.allocations.map((a,i)=><li key={i} className="rounded-lg bg-white/70 p-3"><strong>{a.description}</strong>{a.dueDate&&<p>Due {formatDate(a.dueDate)}</p>}<p>Before: {formatPeso(a.beforeBalance)} · Applied: {formatPeso(a.amount)} · After: {formatPeso(a.afterBalance)}</p></li>)}</ul></details>{r.note&&<p className="mt-2 break-words text-xs text-slate-600">{r.note}</p>}
 </article>)}
 </section>
}
