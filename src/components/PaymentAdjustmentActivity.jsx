import {useMemo,useRef,useState} from 'react'
import {useApp} from '../context/AppContext'
import {buildPaymentAdjustments} from '../lib/paymentReadModel'
import {formatDate,formatPeso} from '../lib/amortization'
import {Button,Modal} from './ui'

export default function PaymentAdjustmentActivity({ownerId:requestedOwner,search=''}){
 const {session,users,paymentPostings,transactions,archivedTransactions,paymentLogs,hiddenPaymentBreakdowns,setPaymentBreakdownVisibility}=useApp()
 const [selected,setSelected]=useState(()=>new Set()),[showDeleted,setShowDeleted]=useState(false),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const running=useRef(false)
 const admin=session?.user.role==='admin',owner=admin?requestedOwner:session?.user.id
 const rows=useMemo(()=>{
  const ids=owner?[owner]:admin?[...new Set(paymentPostings.map(p=>p.user_id))]:[]
  return ids.flatMap(ownerId=>buildPaymentAdjustments({ownerId,postings:paymentPostings,transactions:[...transactions,...archivedTransactions],logs:paymentLogs}).map(r=>({...r,ownerId}))).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
 },[owner,admin,paymentPostings,transactions,archivedTransactions,paymentLogs])
 const hidden=new Set(hiddenPaymentBreakdowns.map(row=>row.posting_id))
 const visible=rows.filter(r=>(!hidden.has(r.id)||(admin&&showDeleted))&&(!search||JSON.stringify([r.reference,r.note,r.dueDates,r.allocations,users.find(u=>u.id===r.ownerId)?.name]).toLowerCase().includes(search.toLowerCase())))
 const selectable=visible.filter(r=>!hidden.has(r.id)),selectedIds=selectable.filter(r=>selected.has(r.id)).map(r=>r.id),allSelected=selectable.length>0&&selectedIds.length===selectable.length
 const toggle=id=>setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})
 const openReview=(ids,hide)=>{setError('');setReview({ids,hide,key:crypto.randomUUID()})}
 const confirm=async()=>{
  if(running.current)return;running.current=true;setBusy(true);setError('')
  try{const result=await setPaymentBreakdownVisibility(review.ids,review.hide,review.key);if(result.error)throw Error(result.error);setNotice(`${review.ids.length} breakdown${review.ids.length===1?'':'s'} ${review.hide?'deleted':'restored'}. Payments and balances are unchanged.`);setSelected(new Set());setReview(null)}
  catch(failure){setError(failure.message)}finally{running.current=false;setBusy(false)}
 }
 if(!rows.length||(!admin&&!visible.length))return null
 return <section aria-label="Payment breakdown" className="mb-6 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">Payment breakdown</h2>{admin&&<label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showDeleted} onChange={e=>{setShowDeleted(e.target.checked);setSelected(new Set())}}/> Show deleted breakdowns</label>}</div><p className="text-sm text-slate-600">From saved postings. These amounts are already reflected in balances.</p>
 {admin&&selectable.length>0&&<div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs"><label className="flex items-center gap-2"><input type="checkbox" aria-label="Select all visible payment breakdowns" checked={allSelected} disabled={busy} onChange={()=>setSelected(allSelected?new Set():new Set(selectable.map(r=>r.id)))}/> Select visible</label><span>{selectedIds.length} selected</span><Button variant="danger" disabled={busy||!selectedIds.length} onClick={()=>openReview(selectedIds,true)}>Delete selected breakdowns</Button></div>}
 {notice&&<p className="text-xs text-emerald-700" role="status">{notice}</p>}
 {!visible.length&&<p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">No payment breakdowns to show.</p>}
 {visible.map(r=><article key={r.id} data-payment-adjustment-id={r.id} className={`rounded-xl border p-4 text-sm ${r.status==='reversed'?'border-slate-200 bg-slate-50':'border-emerald-200 bg-emerald-50/60'}`}>
  {admin&&<div className="mb-3 flex flex-wrap items-center justify-between gap-2">{hidden.has(r.id)?<span className="text-xs text-slate-500">Deleted breakdown</span>:<label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" aria-label={'Select payment breakdown '+(r.reference||r.id)} checked={selectedIds.includes(r.id)} disabled={busy} onChange={()=>toggle(r.id)}/> Select</label>}<Button variant="secondary" disabled={busy} onClick={()=>openReview([r.id],!hidden.has(r.id))}>{hidden.has(r.id)?'Restore breakdown':'Delete breakdown'}</Button></div>}
  <header className="flex flex-wrap justify-between gap-2"><strong>{r.kind==='overpayment'?'Overpayment':'Partial Payment'} for {r.dueDates.length?r.dueDates.map(formatDate).join(' · '):'unallocated credit'}</strong><strong>−{formatPeso(Math.abs(r.amount))}</strong></header>
  <p className="mt-1 text-xs text-slate-600">{admin&&`${users.find(u=>u.id===r.ownerId)?.name||'Borrower'} · `}{formatDate(r.date)}{r.status==='reversed'?' · Reversed':''}{r.reference&&` · ${r.reference}`}</p>
  <details className="mt-3"><summary className="cursor-pointer font-medium">Allocation breakdown</summary><p className="mt-2">Cash received: {formatPeso(r.cashReceived)} · Credit used: {formatPeso(r.creditUsed)} · Applied to dues: {formatPeso(r.totalApplied)}</p><ul className="mt-2 space-y-2">{r.allocations.map((a,i)=><li key={i} className="rounded-lg bg-white/70 p-3"><strong>{a.description}</strong>{a.dueDate&&<p>Due {formatDate(a.dueDate)}</p>}<p>Before: {formatPeso(a.beforeBalance)} · Applied: {formatPeso(a.amount)} · After: {formatPeso(a.afterBalance)}</p></li>)}</ul></details>{r.note&&<p className="mt-2 break-words text-xs text-slate-600">{r.note}</p>}
 </article>)}
 {review&&<Modal open title={review.hide?'Delete payment breakdowns':'Restore payment breakdowns'} onClose={()=>{if(!busy)setReview(null)}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setReview(null)}>Cancel</Button><Button variant={review.hide?'danger':'primary'} disabled={busy} onClick={confirm}>{busy?'Saving…':`${review.hide?'Delete':'Restore'} ${review.ids.length} breakdown${review.ids.length===1?'':'s'}`}</Button></>}><p className="text-sm text-slate-600">{review.hide?'Hide':'Restore'} these {review.ids.length} breakdown{review.ids.length===1?'':'s'} in admin and borrower Transactions and History? Recorded payments, allocations and balances will stay unchanged.</p>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</Modal>}
 </section>
}
