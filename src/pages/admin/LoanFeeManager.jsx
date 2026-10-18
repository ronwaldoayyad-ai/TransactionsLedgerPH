import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from '../../context/AppContext'
import {usePersistedState} from '../../hooks/usePersistedState'
import {supabase} from '../../supabaseClient'
import {mobileAction} from '../../lib/mobileLocalFlow'
import {useRecordRefresh} from '../../lib/recordRefresh'
import {eligibleFeeTransactions,calculateFeeAssessment,feeDescriptions,assessmentMonth} from '../../lib/feeAssessment'
import {centsAmount} from '../../lib/paymentAllocation'
import {formatDate,formatPeso} from '../../lib/amortization'
import {PageHeader} from '../../components/AppShell'
import RefreshButton from '../../components/RefreshButton'
import Icon from '../../components/Icon'
import {Button,Card,CardHeader,EmptyState,Field,Switch,Modal,inputClass} from '../../components/ui'

const fields='id,user_id,actor_id,source_due_date,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_count,created_at,voided_at,void_reason,entries:transactions!transactions_fee_assessment_id_fkey(id,description,amount,amount_applied,status,due_date)'
const businessToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`}

export default function LoanFeeManager(){
 const app=useApp(),borrowers=app.users.filter(u=>u.role==='user'&&u.status==='active')
 const [borrowerId,setBorrowerId]=usePersistedState('fee.borrower',''),[sourceDate,setSourceDate]=usePersistedState('fee.sourceDate','')
 const [history,setHistory]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false)
 const [voiding,setVoiding]=useState(null),[reason,setReason]=useState(''),[voidConfirmed,setVoidConfirmed]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState('')
 const generation=useRef(0),voidOperation=useRef(null)
 const today=businessToday(),cycle=assessmentMonth(today)
 const dates=useMemo(()=>[...new Set(app.transactions.filter(t=>t.userId===borrowerId&&!t.archivedAt&&['unpaid','past_due'].includes(t.status)&&Number(t.amount)>0).map(t=>t.dueDate))].sort(),[app.transactions,borrowerId])
 const borrower=borrowers.find(u=>u.id===borrowerId)
 const loadHistory=useCallback(async()=>{
  const request=++generation.current;setLoading(true)
  try{let query=supabase.from('fee_assessments').select(fields).order('created_at',{ascending:false}).order('id').range(page*20,page*20+20);if(borrowerId)query=query.eq('user_id',borrowerId);const {data,error}=await query;if(error)throw error;if(request===generation.current){setHistory(data.slice(0,20));setHasMore(data.length>20);setError('')}}
  catch(e){if(request===generation.current)setError(e.message||'Fee history could not be loaded. Retry the refresh.')}
  finally{if(request===generation.current)setLoading(false)}
 },[borrowerId,page,setLoading,setHistory,setHasMore,setError])
 useEffect(()=>{let active=true;const requestGeneration=generation;queueMicrotask(()=>{if(active)loadHistory()});return()=>{active=false;++requestGeneration.current}},[loadHistory])
 useRecordRefresh(loadHistory)
 const duplicate=history.find(h=>h.user_id===borrowerId&&h.source_due_date===sourceDate&&h.assessment_month===cycle&&!h.voided_at)
 const refreshAfterPosting=async()=>{await app.refreshData({preservePageState:true});await loadHistory()}
 function chooseBorrower(id){setBorrowerId(id);setPage(0);setNotice('');const options=[...new Set(app.transactions.filter(t=>t.userId===id&&!t.archivedAt&&['unpaid','past_due'].includes(t.status)&&Number(t.amount)>0).map(t=>t.dueDate))].sort();setSourceDate(options[0]||'')}
 async function voidAssessment(){
  const fingerprint=JSON.stringify([voiding.id,reason]);if(voidOperation.current?.fingerprint!==fingerprint)voidOperation.current={fingerprint,key:crypto.randomUUID()}
  setSaving(true);setError('')
  try{await mobileAction('fee-void',{id:voiding.id,reason,key:voidOperation.current.key,reviewed:voidConfirmed});setVoiding(null);setNotice('Assessment voided. The entries and cancellation reason remain in history.');await refreshAfterPosting()}
  catch(e){setError(e.message)}finally{setSaving(false)}
 }
 return <>
  <PageHeader title="Loan Fee Calculator & Billing Manager" subtitle="Monthly finance charge and late fee assessments, reviewed before posting." action={<RefreshButton/>}/>
  {notice&&<p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
  {error&&<div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><Button variant="secondary" onClick={loadHistory}>Retry history</Button></div>}
  <Card className="mb-5"><CardHeader title="Assessment parameters" subtitle="Select a borrower and the original due date. Unpaid prior fees on that date are included."/><div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
   <Field label="Select borrower" htmlFor="fee-borrower"><select id="fee-borrower" disabled={saving} className={inputClass} value={borrowerId} onChange={e=>chooseBorrower(e.target.value)}><option value="">Choose a borrower…</option>{borrowers.map(u=><option key={u.id} value={u.id}>{u.name} · {u.accountNumber||u.email}</option>)}</select></Field>
   <Field label="Filter pending due date" htmlFor="fee-source-date" hint="Only positive, remaining unpaid balances on this date are selectable."><input id="fee-source-date" className={inputClass} type="date" value={sourceDate} disabled={!borrower||saving} list="fee-pending-dates" onChange={e=>{setSourceDate(e.target.value);setNotice('')}}/><datalist id="fee-pending-dates">{dates.map(d=><option key={d} value={d}>{formatDate(d)}</option>)}</datalist></Field>
  </div></Card>
  {borrower&&sourceDate?<FeeAssessmentForm key={borrowerId+'|'+sourceDate} borrower={borrower} sourceDate={sourceDate} cycle={cycle} today={today} transactions={app.transactions} duplicate={duplicate} onBusy={setSaving} onPosted={async r=>{setNotice(`Charges posted: ${formatPeso(r.total)}. Reference ${r.id}.`);await refreshAfterPosting()}}/>:<Card className="mb-5"><EmptyState title="Choose an account and due date" body="The matching unpaid transactions will be selected automatically. You can change the selection before confirming."/></Card>}
  <Card className="mt-6"><CardHeader title="Posted assessments & ledger history" subtitle="Newest first. Finance charges and late fees remain identifiable in the borrower ledger."/>
   {loading?<p role="status" className="px-5 pb-5 text-sm text-slate-500">Loading fee history…</p>:!history.length?<EmptyState title="No fee assessments yet" body="Confirmed assessments will appear here, including the original base, new due date and fee entries."/>:<div className="divide-y divide-slate-100">{history.map(h=><AssessmentHistory key={h.id} assessment={h} borrowerName={app.users.find(u=>u.id===h.user_id)?.name||'Borrower'} onVoid={()=>{setVoiding(h);setReason('');setVoidConfirmed(false);setError('')}}/>)}</div>}
   <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm"><Button variant="secondary" disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1}</span><Button variant="secondary" disabled={!hasMore||loading} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
  </Card>
  <Modal open={!!voiding} title="Void unpaid fee assessment" onClose={()=>!saving&&setVoiding(null)} footer={<><Button variant="secondary" disabled={saving} onClick={()=>setVoiding(null)}>Keep assessment</Button><Button variant="danger" disabled={saving||!voidConfirmed||reason.trim().length<10||reason.length>2000} onClick={voidAssessment}>{saving?'Voiding…':'Confirm void'}</Button></>}>
   {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   <p className="mb-4 text-sm text-slate-600">This cancels both unpaid fee entries and retains their history. An assessment with an allocated payment requires a payment reversal first.</p>
   <Field label="Reason for voiding" htmlFor="fee-void-reason"><textarea id="fee-void-reason" value={reason} maxLength={2000} className={inputClass} onChange={e=>setReason(e.target.value)} rows={3}/><p className="mt-1 text-xs text-slate-500">{reason.trim().length} / 2000 characters · minimum 10</p></Field>
   <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={voidConfirmed} onChange={e=>setVoidConfirmed(e.target.checked)}/>I reviewed this cancellation and its effect on the borrower's balance.</label>
  </Modal>
 </>
}

function FeeAssessmentForm({borrower,sourceDate,cycle,today,transactions,duplicate,onBusy,onPosted}){
 const rows=useMemo(()=>eligibleFeeTransactions(transactions,borrower.id,sourceDate),[transactions,borrower.id,sourceDate])
 const [selected,setSelected]=useState(()=>new Set(rows.map(t=>t.id))),[rate,setRate]=useState('3'),[financeEnabled,setFinanceEnabled]=useState(true),[lateEnabled,setLateEnabled]=useState(true),[lateAmount,setLateAmount]=useState('1500'),[dueDate,setDueDate]=useState(sourceDate>today?sourceDate:today)
 const [reviewed,setReviewed]=useState(''),[saving,setSaving]=useState(false),[posted,setPosted]=useState(false),[error,setError]=useState(''),[shown,setShown]=useState(25)
 const operation=useRef(null),chosen=rows.filter(t=>selected.has(t.id))
 let summary,validation='';try{summary=calculateFeeAssessment({rows:chosen,rate,financeEnabled,lateEnabled,lateAmount});if(dueDate){assessmentMonth(dueDate);if(dueDate<sourceDate)validation='New charges cannot be due before the selected original due date.'}else validation='Choose a due date for the new charges.'}catch(e){validation=e.message}
 const titles=summary?feeDescriptions(summary,sourceDate):null
 const fingerprint=JSON.stringify({borrower:borrower.id,sourceDate,cycle,rate,financeEnabled,lateEnabled,lateAmount,dueDate,rows:chosen.map(r=>[r.id,r.remainingCents])})
 const confirmed=reviewed===fingerprint,disabled=saving||posted||!!duplicate
 const total=summary?.totalCents||0
 async function post(){
  if(!confirmed||validation||!total||disabled)return
  if(operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID()}
  setSaving(true);onBusy(true);setError('')
  try{const result=await mobileAction('fee-assess',{key:operation.current.key,borrowerId:borrower.id,assessmentMonth:cycle,sourceDueDate:sourceDate,chargeDueDate:dueDate,financeEnabled,rate,lateEnabled,lateAmount,reviewed:true,selections:chosen.map(r=>({id:r.id,expectedBalance:centsAmount(r.remainingCents)}))});setPosted(true);await onPosted(result)}
  catch(e){setError(e.message||'Posting could not be confirmed. Retry without changing the reviewed details.')}finally{setSaving(false);onBusy(false)}
 }
 function toggle(id){setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
 return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(310px,390px)]">
  <Card><CardHeader title="Pending transactions" subtitle={`${rows.length} matching transactions · ${borrower.name}`} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled||!rows.length} onClick={()=>setSelected(new Set(rows.map(r=>r.id)))}>Select all</Button><Button variant="secondary" disabled={disabled||!chosen.length} onClick={()=>setSelected(new Set())}>Deselect all</Button></div>}/>
   {!rows.length?<EmptyState title="No unpaid balances for this date" body="Choose another pending due date. Paid, refunded, cancelled and archived entries are excluded."/>:<div className="divide-y divide-slate-100">{rows.slice(0,shown).map(t=><label key={t.id} className={`flex cursor-pointer items-start gap-3 px-5 py-4 ${selected.has(t.id)?'bg-blue-50/40':''}`}><input type="checkbox" aria-label={`Include ${t.description}`} disabled={disabled} checked={selected.has(t.id)} onChange={()=>toggle(t.id)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600"/><span className="min-w-0 flex-1"><strong className={`block break-words text-sm ${t.feeKind?'text-red-700':'text-slate-900'}`}>{t.description}</strong><small className="mt-1 block break-words text-slate-500">Due {formatDate(t.dueDate)}{t.feeKind?' · Prior fee':''}{t.paidAmount>0?` · Already paid ${formatPeso(t.paidAmount)}`:''}</small></span><strong className="shrink-0 font-mono text-sm">{formatPeso(t.remainingCents/100)}</strong></label>)}</div>}
   {shown<rows.length&&<Button variant="secondary" className="m-4" onClick={()=>setShown(n=>n+25)}>Show 25 more</Button>}
   <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm"><span>Selected items: <b>{chosen.length}</b></span><span>Selected base: <b>{formatPeso((summary?.baseCents||0)/100)}</b></span></div>
  </Card>
  <Card className="xl:sticky xl:top-24"><CardHeader title="Fee calculation summary" subtitle={`Assessment cycle · ${new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(new Date(cycle+'T00:00:00'))}`}/><div className="space-y-4 px-5 pb-5">
   <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="fee-finance-rate" className="text-sm font-semibold">Finance charge rate</label><Switch checked={financeEnabled} disabled={disabled} onChange={value=>!disabled&&setFinanceEnabled(value)} label="Apply finance charge"/></div><div className="flex items-center gap-2"><input id="fee-finance-rate" type="number" min="0" max="100" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} disabled={disabled||!financeEnabled} className={inputClass}/><span>%</span></div></div>
   <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="fee-late-amount" className="text-sm font-semibold">Late payment fee</label><Switch checked={lateEnabled} disabled={disabled} onChange={value=>!disabled&&setLateEnabled(value)} label="Apply late payment fee"/></div><div className="flex items-center gap-2"><span>₱</span><input id="fee-late-amount" type="number" min="0" step="0.01" value={lateAmount} onChange={e=>setLateAmount(e.target.value)} disabled={disabled||!lateEnabled} className={inputClass}/></div></div>
   <Field label="New charges due date" htmlFor="fee-charge-date" hint="Applies to both fee entries."><input id="fee-charge-date" type="date" min={sourceDate} value={dueDate} disabled={disabled} className={inputClass} onChange={e=>setDueDate(e.target.value)}/></Field>
   <div className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><span>Selected unpaid base</span><b>{formatPeso((summary?.baseCents||0)/100)}</b></div><p className="mt-2 text-xs text-slate-500">Includes selected unpaid prior fees. Paid portions are excluded.</p></div>
   {summary&&<div aria-label="Fee entries preview" className="space-y-2">{summary.financeCents>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong className="block break-words">{titles.finance}</strong><b className="mt-2 block text-right font-mono">{formatPeso(summary.financeCents/100)}</b></div>}{summary.lateCents>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong className="block break-words">{titles.late}</strong><b className="mt-2 block text-right font-mono">{formatPeso(summary.lateCents/100)}</b></div>}</div>}
   <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 font-semibold"><span>Total new charges</span><span className="font-mono text-red-700">{formatPeso(total/100)}</span></div>
   {duplicate&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Already assessed for this due date this month. View the record below. A new monthly assessment becomes available next month.</p>}
   {(validation||error)&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{validation||error}</p>}
   <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" id="fee-confirm" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" disabled={disabled||!!validation||!total||chosen.length>1000} checked={confirmed} onChange={e=>setReviewed(e.target.checked?fingerprint:'')}/><span>I reviewed the selected balances, fee amounts and new due date. Post these charges to <b>{borrower.name}</b>.</span></label>
   <Button className="w-full justify-center" variant="danger" disabled={disabled||!confirmed||!!validation||!total||chosen.length>1000} onClick={post}><Icon name={saving?'refresh':'send'} className={`h-4 w-4 ${saving?'animate-spin':''}`}/>{saving?'Posting charges…':posted?'Charges posted':'Confirm & post charges'}</Button>
   <p className="text-xs leading-relaxed text-slate-500">One confirmed assessment per borrower and original due date each calendar month. Charges create new amounts due, not a received payment.</p>
  </div></Card>
 </div>
}

function AssessmentHistory({assessment:h,borrowerName,onVoid}){
 const [details,setDetails]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const canVoid=!h.voided_at&&h.entries.every(e=>Number(e.amount_applied)===0&&!['paid','refunded'].includes(e.status))
 async function load(open){if(!open||details||loading)return;setLoading(true);try{const {data,error}=await supabase.from('fee_assessments').select('source_rows').eq('id',h.id).single();if(error)throw error;setDetails(data.source_rows);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 return <article className={`px-5 py-4 ${h.voided_at?'bg-slate-50':'bg-red-50/20'}`} data-fee-assessment-id={h.id}>
  <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="block text-sm">{borrowerName}</strong><p className="mt-1 text-xs text-slate-500">Posted {formatDate(h.created_at)} · Source due {formatDate(h.source_due_date)} · New due {formatDate(h.charge_due_date)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${h.voided_at?'bg-slate-200 text-slate-700':'bg-red-100 text-red-800'}`}>{h.voided_at?'Voided':'Assessed fees'}</span></div>
  <div className="mt-3 space-y-2">{h.entries.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-red-100 bg-white/70 p-3 text-sm text-red-800"><span className="min-w-0 flex-1 break-words">{e.description}<small className="ml-2 text-slate-500">{e.status==='paid'?'Paid':e.status==='cancelled'?'Cancelled':Number(e.amount_applied)>0?'Partly paid':'Unpaid'}</small></span><b className="font-mono">{formatPeso(e.amount)}</b></div>)}</div>
  <details className="mt-3 text-sm" onToggle={e=>load(e.currentTarget.open)}><summary className="cursor-pointer text-slate-700">Calculation details · {h.source_count} selected · Base {formatPeso(h.base_amount)}</summary><p className="mt-2 text-xs text-slate-500">Assessment {h.id} · {h.finance_enabled?`${Number(h.finance_rate)}% finance charge`:'Finance charge off'} · Late fee {formatPeso(h.late_amount)}</p>{loading&&<p role="status">Loading original selection…</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}{details&&<ul className="mt-2 space-y-1">{details.map(r=><li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2"><span className="min-w-0 flex-1 break-words">{r.description}</span><b>{formatPeso(r.remainingAmount)}</b></li>)}</ul>}</details>
  {h.voided_at?<p className="mt-3 text-sm text-slate-600">Voided {formatDate(h.voided_at)} · {h.void_reason}</p>:canVoid&&<div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onVoid}>Void unpaid assessment</Button></div>}
 </article>
}
