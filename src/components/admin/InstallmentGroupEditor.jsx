import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { changeInstallmentCategory } from '../../lib/borrowerAdministration'
import { Button, Field, Modal, inputClass } from '../ui'

const label=value=>value==='cash_loan'?'Cash Loan':value==='retail_installment'?'Retail Installment':'Unclassified'
export default function InstallmentGroupEditor(){
 const {loans,users,transactions,refreshData}=useApp()
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[loanId,setLoanId]=useState(''),[category,setCategory]=useState('cash_loan'),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const operation=useRef(null)
 const groups=useMemo(()=>{const ids=new Set(transactions.map(t=>t.loanId));return loans.filter(l=>l.txnType!=='straight'&&ids.has(l.id))},[loans,transactions])
 const borrowerName=id=>users.find(u=>u.id===id)?.name||'Borrower'
 const visible=groups.filter(l=>[l.label,borrowerName(l.userId),label(l.loanCategory)].join(' ').toLowerCase().includes(query.toLowerCase()))
 const loan=groups.find(l=>l.id===loanId)
 function reset(){setReviewed(false);operation.current=null;setError('');setNotice('')}
 async function save(){
  if(!loan||busy||!reviewed)return
  setBusy(true);setError('');setNotice('')
  const payload={loanId:loan.id,category,expectedCategory:loan.loanCategory??null,reason:reason.trim(),reviewed:true},fingerprint=JSON.stringify(payload)
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()}
  try{await changeInstallmentCategory({...payload,key:operation.current.key});await refreshData({preservePageState:true});setReviewed(false);setReason('');operation.current=null;setNotice('Installment group updated. The borrower will see it under '+label(category)+'.')}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <><Button variant="secondary" onClick={()=>setOpen(true)}>Edit installment groups</Button><Modal open={open} title="Edit installment group" onClose={()=>!busy&&setOpen(false)} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>Close</Button><Button disabled={busy||!loan||category===loan.loanCategory||!reviewed||reason.trim().length<10} onClick={save}>{busy?'Saving…':'Save group category'}</Button></>}>
  <div className="space-y-4"><p className="text-sm text-slate-600">Move an existing installment group into Cash Loan or Retail Installment. This changes its grouping only; payment amounts, schedules and paid status stay unchanged.</p>
   <Field label="Find borrower or installment group" htmlFor="group-query"><input id="group-query" className={inputClass} value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);setLoanId('');reset()}} placeholder="Search a name, title or Unclassified"/></Field>
   <Field label="Installment group" htmlFor="group-loan"><select id="group-loan" className={inputClass} disabled={busy} value={loanId} onChange={e=>{setLoanId(e.target.value);setCategory(groups.find(l=>l.id===e.target.value)?.loanCategory||'cash_loan');reset()}}><option value="">Choose an installment group…</option>{visible.map(l=><option key={l.id} value={l.id}>{borrowerName(l.userId)} · {l.label} · {label(l.loanCategory)}</option>)}</select></Field>
   {loan&&<><p className="rounded-xl bg-slate-50 p-3 text-sm">Current group: <strong>{label(loan.loanCategory)}</strong></p><Field label="Move to" htmlFor="group-category"><select id="group-category" className={inputClass} value={category} disabled={busy} onChange={e=>{setCategory(e.target.value);reset()}}><option value="cash_loan">Cash Loan</option><option value="retail_installment">Retail Installment</option></select></Field><Field label="Reason for category change" htmlFor="group-reason"><textarea id="group-reason" rows={2} maxLength={2000} className={inputClass} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);reset()}}/><p className="mt-1 text-xs text-slate-500">{reason.trim().length} / 2000 · minimum 10 characters</p></Field><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed the borrower, installment group and new category.</span></label></>}
   {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{notice}</p>}
  </div>
 </Modal></>
}
