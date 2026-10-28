import {useState} from 'react'
import {loanFeeHelp} from '../lib/loanFeeHelp'
import {formatPeso} from '../lib/amortization'
import {Button,Modal} from './ui'
export default function LoanFeeInfo({label,group}){
 const [open,setOpen]=useState(false),description=loanFeeHelp(label,group,formatPeso(1500));if(!description)return null
 return <><button type="button" aria-label={'About '+label} aria-haspopup="dialog" onClick={()=>setOpen(true)} className="ml-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-300 text-[11px] font-semibold text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">i</button><Modal open={open} title={label} onClose={()=>setOpen(false)} footer={<Button variant="secondary" onClick={()=>setOpen(false)}>Close</Button>}><p className="text-sm leading-7 text-slate-600">{description}</p></Modal></>
}
