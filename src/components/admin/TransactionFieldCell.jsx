import {useRef,useState} from 'react'
import {inputClass} from '../ui'
// Save once on blur/Enter, restore after cancellation/failure, never on each key.
export default function TransactionFieldCell({transaction,field,label,onSave,options}) {
 const initial=transaction[field]??'',[value,setValue]=useState(initial),[last,setLast]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),cancel=useRef(false),inFlight=useRef(false)
 if(last!==initial){setLast(initial);if(!editing)setValue(initial)}
 const commit=async(raw=value)=>{
  setEditing(false);if(cancel.current){cancel.current=false;return}if(inFlight.current||raw===initial)return
  const next=field==='description'?raw.trim():raw||null
  if(field==='description'&&!next){setValue(initial);setError('Enter a description.');return}
  inFlight.current=true;setBusy(true);setError('')
  try{const result=await onSave({[field]:next});if(result?.error){setValue(initial);if(result.error!=='Correction cancelled.')setError(result.error)}}catch(failure){setValue(initial);setError(failure.message)}finally{inFlight.current=false;setBusy(false)}
 }
 const common={'aria-label':label+' for '+transaction.description,'aria-invalid':!!error,disabled:busy,value,onFocus:()=>setEditing(true),className:inputClass+' !min-h-8 !px-1.5 !py-1 !text-xs'}
 return <div className={!options&&field!=='description'?'tg-date-field':undefined} data-empty={!value}>
  {options?<select {...common} onChange={e=>{setValue(e.target.value);commit(e.target.value)}}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<input {...common} type={field==='description'?'text':'date'} onChange={e=>setValue(e.target.value)} onBlur={()=>commit()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur()}if(e.key==='Escape'){cancel.current=true;setValue(initial);setError('');e.currentTarget.blur()}}}/>}
  {!options&&field!=='description'&&!value&&<span aria-hidden="true">—</span>}
  {busy&&<small role="status">Reviewing…</small>}{error&&<small role="alert" className="block whitespace-normal text-red-700">{error}</small>}
 </div>
}
