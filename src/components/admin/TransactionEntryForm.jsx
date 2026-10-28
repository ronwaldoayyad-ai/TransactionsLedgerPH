import { useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { formatPeso, toISODate } from '../../lib/amortization'
import { prepareManualTransaction, TRANSACTION_TYPES } from '../../lib/transactionEditing'
import {groupOptions,defaultInstallmentGroup,TRANSACTION_GROUPS} from '../../lib/transactionGroups'
import { STATUS_LABELS } from '../../lib/transactions'
import { Button, Field, Modal, inputClass } from '../ui'

export default function TransactionEntryForm({onClose,onSaved}) {
  const {users,loans,transactions,archivedTransactions,createTransaction}=useApp()
  const today=toISODate(new Date()),inFlight=useRef(false)
  const [entry,setEntry]=useState(()=>({id:'manual-'+crypto.randomUUID(),userId:'',loanId:'',description:'',amount:'',transactionGroup:'',type:'Straight',txnDate:today,dueDate:today,status:'unpaid',datePaid:''}))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const borrowers=users.filter(user=>user.role==='user'),availableLoans=loans.filter(loan=>loan.userId===entry.userId)
  const field=(key,value)=>{setEntry(previous=>({...previous,[key]:value,...(key==='userId'?{loanId:''}:{}),...(key==='type'?{transactionGroup:''}:{})}));setError('')}
  const submit=async event=>{
    event.preventDefault();if(inFlight.current)return
    try{prepareManualTransaction(entry,borrowers,today,loans,[...transactions,...archivedTransactions])}catch(failure){setError(failure.message);return}
    inFlight.current=true;setBusy(true);setError('')
    try{const result=await createTransaction(entry);if(result.error){setError(result.error);return}onSaved(result.transaction)}catch(failure){setError(failure.message||'Unable to save this entry. Retry with this form.')}finally{inFlight.current=false;setBusy(false)}
  }
  return <Modal open title="Add transaction" onClose={()=>{if(!inFlight.current)onClose()}} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" form="manualTransactionForm" disabled={busy}>{busy?'Saving…':'Add transaction'}</Button></>}>
    <form id="manualTransactionForm" className="space-y-4" onSubmit={submit}>
      <Field label="Borrower" htmlFor="entry-borrower"><select id="entry-borrower" className={inputClass} required value={entry.userId} disabled={busy} onChange={event=>field('userId',event.target.value)}><option value="">Select borrower…</option>{borrowers.map(user=><option key={user.id} value={user.id}>{user.name} · {user.borrowerAccountNumber||user.email}</option>)}</select></Field>
      <Field label="Link to loan" htmlFor="entry-loan" hint={entry.loanId?'Appends an entry to this loan’s ledger schedule. Its original disclosure terms are retained.':'Creates an independent ledger entry without an amortization schedule.'}><select id="entry-loan" className={inputClass} disabled={busy||!entry.userId} value={entry.loanId} onChange={event=>field('loanId',event.target.value)}><option value="">Standalone entry</option>{availableLoans.map(loan=><option key={loan.id} value={loan.id}>{loan.label}</option>)}</select></Field>
      <Field label="Description" htmlFor="entry-description"><input id="entry-description" className={inputClass} required maxLength={2000} value={entry.description} disabled={busy} onChange={event=>field('description',event.target.value)}/></Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount (₱)" htmlFor="entry-amount"><input id="entry-amount" type="number" step="0.01" required className={inputClass} value={entry.amount} disabled={busy} placeholder="Positive or negative" onChange={event=>field('amount',event.target.value)}/></Field>
        <Field label="Type" htmlFor="entry-type"><select id="entry-type" className={inputClass} value={entry.type} disabled={busy} onChange={event=>field('type',event.target.value)}>{TRANSACTION_TYPES.map(type=><option key={type}>{type}</option>)}</select></Field>
        <Field label="Transaction date" htmlFor="entry-date"><input id="entry-date" type="date" className={inputClass} required value={entry.txnDate} disabled={busy} onChange={event=>field('txnDate',event.target.value)}/></Field>
        <Field label="Due date" htmlFor="entry-due"><input id="entry-due" type="date" className={inputClass} required value={entry.dueDate} disabled={busy} onChange={event=>field('dueDate',event.target.value)}/></Field>
        <Field label="Status" htmlFor="entry-status"><select id="entry-status" className={inputClass} value={entry.status} disabled={busy} onChange={event=>field('status',event.target.value)}>{Object.entries(STATUS_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
        {['paid','refunded'].includes(entry.status)&&<Field label="Date paid" htmlFor="entry-paid"><input id="entry-paid" type="date" className={inputClass} required={entry.status==='paid'} value={entry.datePaid|| (entry.status==='paid'?today:'')} disabled={busy} onChange={event=>field('datePaid',event.target.value)}/></Field>}
      </div>
      <Field label="Group"><select className={inputClass} disabled={busy||(entry.type==='Installment'&&!!entry.loanId)} value={entry.type==='Installment'&&entry.loanId?defaultInstallmentGroup(availableLoans.find(l=>l.id===entry.loanId)):entry.transactionGroup} onChange={e=>field('transactionGroup',e.target.value)}><option value="">Automatic from transaction details</option>{groupOptions(entry.type).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>{entry.type==='Installment'&&entry.loanId&&<p className="text-xs text-slate-500">Inherits {TRANSACTION_GROUPS[defaultInstallmentGroup(availableLoans.find(l=>l.id===entry.loanId))]} from this loan.</p>}</Field>
      <div className={`rounded-xl p-3 text-sm ${Number(entry.amount)<0?'bg-emerald-50 text-emerald-900':'bg-blue-50 text-blue-900'}`}><strong>{Number.isFinite(Number(entry.amount))?formatPeso(Number(entry.amount)):'—'}</strong><p className="mt-1 text-xs">Positive entries add to ledger dues. Negative entries reduce ledger dues and do not add to the separate account credit balance.</p></div>
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </form>
  </Modal>
}
