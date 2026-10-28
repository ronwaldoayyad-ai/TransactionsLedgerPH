import {useRef,useState} from 'react'
import {useApp} from '../../context/AppContext'
import {transactionGroup,groupOptions,TRANSACTION_GROUPS} from '../../lib/transactionGroups'
import {Button,Field,Modal,inputClass} from '../ui'
export default function TransactionGroupCell({transaction,loan}){
 const {changeTransactionGroup,transactions}=useApp(),current=transactionGroup(transaction,loan),wholeLoan=transaction.type==='Installment'&&!!transaction.loanId;
 const [target,setTarget]=useState(''),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),key=useRef(null),inFlight=useRef(false);
 const reset=()=>{key.current=null;setError('')};
 async function save(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{
  if(!key.current)key.current=crypto.randomUUID();
  const payload={id:transaction.id,group:target,expectedGroup:current,expectedType:transaction.type,expectedLoanId:transaction.loanId??null,expectedUserId:transaction.userId,reason:reason.trim(),reviewed,key:key.current};
  const result=await changeTransactionGroup(payload);if(result.error)throw Error(result.error);
  setTarget('');setReason('');setReviewed(false);key.current=null;
 }catch(e){setError(e.message||'Unable to save this group. Please retry.');}finally{setBusy(false);inFlight.current=false;}}
 return <><select className="tg-inline-select" style={{minHeight:32,width:'100%',border:'1px solid #dce5f1',borderRadius:6,padding:'5px',fontSize:11,background:'transparent'}} aria-label={'Group for '+transaction.description} value={current} onChange={e=>{if(e.target.value!==current){setTarget(e.target.value);setReason('');setReviewed(false);reset();}}}>{groupOptions(transaction.type).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>
 {target&&<Modal open title="Change transaction group" onClose={()=>{if(!busy)setTarget('')}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setTarget('')}>Cancel</Button><Button disabled={busy||reason.trim().length<10||!reviewed} onClick={save}>{busy?'Saving…':'Save group'}</Button></>}>
 <div className="space-y-4"><p><strong>{transaction.description}</strong></p><p>{TRANSACTION_GROUPS[current]} → <strong>{TRANSACTION_GROUPS[target]}</strong></p><p className="rounded-xl bg-blue-50 p-3 text-sm">{wholeLoan?'This changes the whole linked installment loan ('+transactions.filter(t=>t.loanId===transaction.loanId).length+' transactions).':'This changes only this transaction.'} Amounts, payment status and balances are unchanged.</p>
 <Field label="Reason for change"><textarea className={inputClass} rows={2} maxLength={2000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);reset();}}/></Field>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e=>{setReviewed(e.target.checked);reset();}}/>I reviewed this group change and its scope.</label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</div></Modal>}</>;
}
