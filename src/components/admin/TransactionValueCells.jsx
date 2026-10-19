import { useRef, useState } from 'react'
import { signedTransactionAmount, transactionEditLock, TRANSACTION_TYPES } from '../../lib/transactionEditing'
import { effectiveStatus, STATUS_LABELS } from '../../lib/transactions'
import { formatPeso, toISODate } from '../../lib/amortization'
import { inputClass } from '../ui'

export function TransactionAmountCell({transaction,onSave,wide=false,formatted=false}) {
  const [text,setText]=useState(String(transaction.amount)),[last,setLast]=useState(transaction.amount),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const cancel=useRef(false),inFlight=useRef(false),lock=transactionEditLock(transaction)
  if(last!==transaction.amount){setLast(transaction.amount);if(!editing)setText(String(transaction.amount))}
  const commit=async()=>{
    setEditing(false);if(cancel.current){cancel.current=false;return}if(inFlight.current)return
    try{
      const amount=signedTransactionAmount(text);if(amount===transaction.amount){setError('');return}
      inFlight.current=true;setBusy(true);setError('');const result=await onSave({amount})
      if(result?.error){setText(String(transaction.amount));setError(result.error)}
    }catch(failure){setError(failure.message);setText(String(transaction.amount))}finally{inFlight.current=false;setBusy(false)}
  }
  return <div className={(formatted?'tg-money-field ':'')+(wide?'w-full':'w-[8.2rem]')} data-editing={editing} data-formatted={formatted?formatPeso(transaction.amount):undefined}><input type="number" step="0.01" aria-label={`Amount for ${transaction.description}`} aria-invalid={!!error} title={lock||'Save on Enter or leaving this field; Escape cancels.'} disabled={!!lock||busy} value={text} onFocus={()=>setEditing(true)} onChange={event=>setText(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur()}if(event.key==='Escape'){cancel.current=true;setText(String(transaction.amount));setError('');setEditing(false);event.currentTarget.blur()}}} className={`${inputClass} !min-h-8 !px-1.5 !py-1 !text-xs font-mono text-right`}/>{busy&&<small role="status">Saving…</small>}{error&&<small role="alert" className="block whitespace-normal text-red-700">{error}</small>}</div>
}

function SavedSelect({transaction,onSave,kind,options,value,lock,wide}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),inFlight=useRef(false)
  const save=async event=>{
    const next=event.target.value;if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('')
    try{const result=await onSave({[kind]:next});if(result?.error)setError(result.error)}catch(failure){setError(failure.message)}finally{inFlight.current=false;setBusy(false)}
  }
  const color=kind==='status'?(value==='paid'?'!bg-emerald-50 !text-emerald-800':value==='past_due'?'!bg-red-50 !text-red-800':''):''
  return <div className={wide?'w-full':'w-[7.5rem]'}><select value={value} disabled={!!lock||busy} title={lock||undefined} aria-label={`${kind==='status'?'Status':'Type'} for ${transaction.description}`} aria-invalid={!!error} onChange={save} className={`${inputClass} !min-h-8 !px-1.5 !py-1 !text-xs ${color}`}>{options.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{busy&&<small role="status">Saving…</small>}{error&&<small role="alert" className="block whitespace-normal text-red-700">{error}</small>}</div>
}
export function TransactionTypeCell({transaction,onSave,wide=false}) {
  return <SavedSelect transaction={transaction} onSave={onSave} kind="type" options={TRANSACTION_TYPES.map(type=>[type,type])} value={transaction.type} lock={transactionEditLock(transaction)} wide={wide}/>
}
export function TransactionStatusCell({transaction,onSave,wide=false}) {
  return <SavedSelect transaction={transaction} onSave={onSave} kind="status" options={Object.entries(STATUS_LABELS)} value={effectiveStatus(transaction,toISODate(new Date()))} lock={transactionEditLock(transaction)} wide={wide}/>
}
