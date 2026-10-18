import { useEffect, useRef, useState } from 'react'
import { getBorrowerAccess, overrideBorrowerAccess } from '../../lib/borrowerAdministration'
import { Button, Field, inputClass } from '../ui'

export default function BorrowerAccessOverrides({ borrower, onBusyChange, onSaved }) {
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [status,setStatus]=useState(borrower.status),[confirmEmail,setConfirmEmail]=useState(false),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false)
 const operation=useRef(null)
 useEffect(()=>{let active=true;getBorrowerAccess(borrower.id).then(r=>{if(active){setData(r);setStatus(r.status)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[borrower.id])
 const resetReview=()=>{setReviewed(false);setNotice('');operation.current=null}
 async function reload(){setLoading(true);setError('');try{const r=await getBorrowerAccess(borrower.id);setData(r);setStatus(r.status);setConfirmEmail(false);resetReview()}catch(e){setError(e.message)}finally{setLoading(false)}}
 async function save(action){
  if(busy||!data||!reviewed)return
  setBusy(true);onBusyChange?.(true);setError('');setNotice('')
  const payload={userId:borrower.id,action,status,expectedStatus:data.status,expectedEmail:data.email,reason:reason.trim(),reviewed:true}
  const fingerprint=JSON.stringify(payload)
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()}
  try{const r=await overrideBorrowerAccess({...payload,key:operation.current.key});setData(r);setStatus(r.status);setConfirmEmail(false);setReviewed(false);setReason('');operation.current=null;setNotice(action==='status'?'Account status updated.':'Email manually confirmed. Account status is unchanged.');await onSaved?.()}
  catch(e){setError(e.message+' Reload access details before retrying if the result is uncertain.')}
  finally{setBusy(false);onBusyChange?.(false)}
 }
 const ready=!!data&&!busy&&!loading&&reviewed&&reason.trim().length>=10&&reason.length<=2000
 return <section className="space-y-4 border-t border-slate-200 pt-5" aria-labelledby="borrower-overrides-title">
  <div><h3 id="borrower-overrides-title" className="text-sm font-semibold">Account status & email confirmation</h3><p className="mt-1 text-xs text-slate-500">Admin overrides apply to this borrower only. A reason and review are required. Sign-in attempt locks are managed separately below.</p></div>
  {loading?<p role="status" className="text-sm text-slate-500">Loading account access…</p>:data&&<>
   <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="break-all">{data.email}</p><p className="mt-1 text-xs text-slate-500">Email: {data.emailConfirmedAt?'Confirmed':'Awaiting confirmation'}{data.pendingEmail?' · Pending email change':''}</p></div>
   <Field label="Account status" htmlFor="borrower-access-status"><select id="borrower-access-status" className={inputClass} disabled={busy} value={status} onChange={e=>{setStatus(e.target.value);resetReview()}}><option value="active">Active</option><option value="invited">Invited</option><option value="disabled">Disabled</option></select><p className="mt-1 text-xs text-slate-500">Active enables account access once sign-in requirements are met. Disabled blocks account access. Invited retains the onboarding state.</p></Field>
   {!data.emailConfirmedAt&&<label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={confirmEmail} disabled={busy||data.pendingEmail} onChange={e=>{setConfirmEmail(e.target.checked);resetReview()}}/><span>Manually confirm this email address<p className="mt-1 text-xs text-amber-900">Use after verifying the borrower through another channel. This bypasses the email confirmation link for the current address and cannot be undone here. No email will be sent.</p></span></label>}
   <Field label="Reason for override" htmlFor="borrower-access-reason"><textarea id="borrower-access-reason" className={inputClass} rows={3} maxLength={2000} disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);resetReview()}}/><p className="mt-1 text-xs text-slate-500">{reason.trim().length} / 2000 · minimum 10 characters</p></Field>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/><span>I verified the borrower and reviewed the selected access change.</span></label>
   <div className="flex flex-wrap gap-2"><Button disabled={!ready||status===data.status} onClick={()=>save('status')}>{busy?'Saving…':'Override account status'}</Button>{!data.emailConfirmedAt&&<Button variant="secondary" disabled={!ready||!confirmEmail||data.pendingEmail} onClick={()=>save('confirm-email')}>Confirm email manually</Button>}</div>
   {!!data.history.length&&<details className="rounded-xl border border-slate-200 p-3 text-xs"><summary className="cursor-pointer font-semibold">Recent access overrides</summary><ul className="mt-3 space-y-3">{data.history.map(h=><li key={h.id} className="break-words border-t border-slate-100 pt-2"><strong>{h.action==='status'?`Status: ${h.details.before} → ${h.details.after}`:'Manual email confirmation'}</strong><p>{h.reason}</p><p className="mt-1 text-slate-500">{new Date(h.created_at).toLocaleString()} · {h.state==='completed'?'Completed':'Pending — reload to verify'}</p></li>)}</ul></details>}
  </>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">{notice}</p>}
  <Button variant="secondary" disabled={busy||loading} onClick={reload}>Reload access details</Button>
 </section>
}
