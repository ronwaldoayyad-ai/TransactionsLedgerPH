import {useRef,useState} from 'react'
import {Modal,Button,inputClass} from '../ui'
import {formatPeso,toISODate} from '../../lib/amortization'
import {prepareAdminCorrection} from '../../lib/transactionEditing'
const labels={userId:'Borrower',description:'Description',amount:'Billed amount',type:'Type',txnDate:'Transaction date',dueDate:'Due date',datePaid:'Date paid',status:'Status'}

export default function TransactionCorrectionReview({request,borrowers,onSave,onClose}) {
 const [reason,setReason]=useState(''),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),inFlight=useRef(false)
 const key=useRef(crypto.randomUUID())
 let preview,validation=''
 try{preview=prepareAdminCorrection(request.current,request.patch,toISODate(new Date()),borrowers)}catch(failure){validation=failure.message}
 const display=(field,value)=>field==='amount'?formatPeso(value):field==='userId'?(borrowers.find(b=>b.id===value)?.name||value):value||'—'
 const save=async()=>{
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('')
  try{const result=await onSave(request.current,request.patch,{key:key.current,reason:reason.trim(),reviewed:true});if(result?.error)setError(result.error);else onClose(result)}catch(failure){setError(failure.message)}finally{inFlight.current=false;setBusy(false)}
 }
 const moved=Object.hasOwn(request.patch,'userId')&&request.patch.userId!==request.current.userId
 return <Modal open title="Review admin correction" onClose={()=>{if(!busy)onClose({error:'Correction cancelled.'})}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>onClose({error:'Correction cancelled.'})}>Cancel</Button><Button disabled={busy||!!validation||reason.trim().length<10||!checked} onClick={save}>{busy?'Saving…':'Confirm correction'}</Button></>}>
  <p className="mb-3 text-sm font-semibold text-slate-900">{request.current.description}</p>
  <dl className="mb-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">{Object.keys(request.patch).map(field=><div key={field}><dt className="text-xs text-slate-500">{labels[field]}</dt><dd className="break-words"><span className="text-slate-500">{display(field,field==='amount'?request.current.originalAmount??request.current.amount:request.current[field])}</span><span aria-label="changes to"> → </span><strong>{display(field,preview?.next[field]??request.patch[field])}</strong></dd></div>)}</dl>
  {preview&&<div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-slate-700">
   <p>Payments kept applied: <strong>{formatPeso(preview.retained)}</strong></p>
   <p>Returned to this borrower’s account credit: <strong>{formatPeso(preview.creditReturned)}</strong></p>
   <p>Remaining payable: <strong>{formatPeso(['unpaid','past_due'].includes(preview.next.status)?Math.max(0,(preview.next.originalAmount??preview.next.amount)-preview.retained):0)}</strong></p>
   <p className="mt-2">Resulting status: {preview.next.status.replaceAll('_',' ')} · Paid date: {preview.next.datePaid||'—'}</p>
   {moved&&<p className="mt-2">Moving a transaction detaches it from its original loan schedule. Reviewed payments must be reversed first.</p>}
   {request.current.feeAssessmentId&&<p className="mt-2">The original fee assessment remains in history with this correction recorded separately.</p>}
   {Object.hasOwn(request.patch,'status')&&<p className="mt-2">A manual status change records a ledger correction. It does not record new cash received. Cancelling or refunding returns any applied funds to account credit.</p>}
  </div>}
  <label className="block text-sm font-medium">Reason for correction<textarea autoFocus aria-label="Reason for correction" maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy} className={inputClass+' mt-1'} placeholder="Explain what needs correcting (at least 10 characters)"/></label>
  <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>I reviewed the changes, payment allocation and account credit.</label>
  {(validation||error)&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{validation||error}</p>}
 </Modal>
}

