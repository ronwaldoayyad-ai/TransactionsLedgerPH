import {useRef,useState} from 'react'
import {Button,Field,Modal,inputClass} from './ui'
import {centsAmount,moneyCents,outstandingCents,reviewPaymentAllocation} from '../lib/paymentAllocation'
import {formatDate,formatPeso,toISODate} from '../lib/amortization'

export default function PaymentAllocationDialog({proof,borrower,transactions,onSubmit,onClose}) {
  const creditOnly=!proof, cash=proof?.amount ?? 0
  const [dues]=useState(()=>transactions.filter(t=>t.userId===borrower.id&&!t.archivedAt&&['unpaid','past_due'].includes(t.status)&&t.amount>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)))
  const [amounts,setAmounts]=useState(()=>{
    let funds=moneyCents(cash);const requested=new Set((proof?.allocations||[]).map(a=>a.id)),values={}
    for(const t of dues){if(!requested.has(t.id))continue;const amount=Math.min(outstandingCents(t),funds);if(amount>0){values[t.id]=centsAmount(amount);funds-=amount}}
    return values
  })
  const [useCredit,setUseCredit]=useState(creditOnly),[confirmed,setConfirmed]=useState(false),[note,setNote]=useState(''),[date,setDate]=useState(toISODate(new Date()))
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[frozen,setFrozen]=useState(false)
  const retry=useRef(null)
  let review,validation=''
  try{
    const allocations=Object.entries(amounts).map(([id,amount])=>({id,amount})),allocated=allocations.reduce((sum,a)=>sum+moneyCents(a.amount),0)
    review=reviewPaymentAllocation({borrowerId:borrower.id,cashAmount:cash,availableCredit:borrower.creditBalance??0,creditUsed:useCredit?centsAmount(Math.max(allocated-moneyCents(cash),0)):'0',dues,allocations})
  }catch(e){validation=e.message}
  const save=async()=>{
    if(!review||!confirmed||busy)return
    if(!retry.current)retry.current={key:crypto.randomUUID(),reviewed:true,expectedCredit:String(borrower.creditBalance??0),creditUsed:centsAmount(review.creditUsedCents),allocations:review.allocations.map(({id,amount,expectedBalance})=>({id,amount,expectedBalance})),note,paidDate:date,userId:borrower.id}
    setFrozen(true);setBusy(true);setError('')
    try{const result=await onSubmit(retry.current);if(result?.error)setError(result.error);else onClose()}catch(e){setError(e.message||'Unable to confirm the result. Retry this same review.')}
    finally{setBusy(false)}
  }
  return <Modal open title={creditOnly?'Apply account credit':'Review payment allocation'} onClose={()=>!busy&&onClose()} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Close</Button><Button disabled={busy||!confirmed||!!validation} onClick={save}>{busy?'Posting…':frozen?'Retry same review':creditOnly?'Apply credit':'Approve & post'}</Button></>}>
    <p className="font-semibold text-slate-900">{borrower.name}</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm"><dt>Cash received</dt><dd className="text-right font-mono">{formatPeso(cash)}</dd><dt>Available credit</dt><dd className="text-right font-mono">{formatPeso(borrower.creditBalance??0)}</dd></dl>
    {proof&&<p className="mt-2 break-words text-xs text-slate-500">Ref {proof.reference} · Paid {formatDate(proof.paidDate)}</p>}
    <p className="my-3 text-sm text-slate-600">Choose the dues and amount to apply to each. Any unapplied cash stays as account credit.</p>
    <fieldset disabled={busy||frozen} className="space-y-3 disabled:opacity-70">
      {creditOnly&&<Field label="Credit application date" htmlFor="credit-date"><input id="credit-date" type="date" value={date} max={toISODate(new Date())} onChange={e=>setDate(e.target.value)} className={inputClass}/></Field>}
      {dues.length===0&&<p className="text-sm">There are no open dues. Cash can be retained as account credit.</p>}
      {dues.map(t=><div key={t.id} className="rounded-xl border border-slate-200 p-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={Object.hasOwn(amounts,t.id)} onChange={e=>setAmounts(prev=>{const next={...prev};if(e.target.checked)next[t.id]=centsAmount(outstandingCents(t));else delete next[t.id];return next})} className="mt-1"/><span className="min-w-0 break-words font-medium">{t.description}<small className="mt-1 block font-normal text-slate-500">Due {formatDate(t.dueDate)} · Remaining {formatPeso(t.amount)}{t.paidAmount>0&&` · Applied ${formatPeso(t.paidAmount)} of ${formatPeso(t.originalAmount)}`}</small></span></label>{Object.hasOwn(amounts,t.id)&&<Field label="Apply amount" htmlFor={`allocate-${t.id}`}><input id={`allocate-${t.id}`} aria-label={`Apply amount to ${t.description}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={amounts[t.id]} onChange={e=>setAmounts(prev=>({...prev,[t.id]:e.target.value}))} className={inputClass}/></Field>}</div>)}
      {!creditOnly&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useCredit} onChange={e=>setUseCredit(e.target.checked)}/>Use available credit for any amount above the cash received</label>}
      <Field label="Lender note (optional)" htmlFor="posting-note"><textarea id="posting-note" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} rows={2} className={inputClass}/></Field>
    </fieldset>
    {review&&<dl className="my-4 grid grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm"><dt>Apply to dues</dt><dd className="text-right font-mono">{formatPeso(review.allocatedCents/100)}</dd><dt>Use prior credit</dt><dd className="text-right font-mono">{formatPeso(review.creditUsedCents/100)}</dd><dt>Add to credit</dt><dd className="text-right font-mono">{formatPeso(review.creditAddedCents/100)}</dd><dt>Credit after posting</dt><dd className="text-right font-mono font-semibold">{formatPeso(review.creditAfterCents/100)}</dd></dl>}
    {creditOnly&&!Object.keys(amounts).length&&!error?<p className="my-3 text-sm text-slate-600">Select a due and enter how much credit to apply.</p>:(error||validation)&&<p role="alert" className="my-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error||validation}</p>}
    {frozen&&error&&<p className="mb-3 text-xs text-slate-600">Retry uses the same review to prevent duplicates. If the balances changed, close this window, refresh records and review again.</p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy||frozen} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>{creditOnly?'I reviewed every allocation and the account credit to use.':'I verified the proof and every allocation, including any credit retained or used.'}</label>
  </Modal>
}
