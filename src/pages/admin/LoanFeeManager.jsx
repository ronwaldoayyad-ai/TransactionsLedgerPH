import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from '../../context/AppContext'
import {usePersistedState} from '../../hooks/usePersistedState'
import {supabase} from '../../supabaseClient'
import {mobileAction} from '../../lib/mobileLocalFlow'
import {useRecordRefresh} from '../../lib/recordRefresh'
import {eligibleCombinedFeeTransactions,pendingCombinedFeeDates,calculateCombinedFeeAssessment,combinedFeeDescriptions,combinedFeeSelections,assessmentMonth,feeReviewTransition} from '../../lib/feeAssessment'
import {loadPendingFee,listPendingFees,savePendingFee,clearPendingFee} from '../../lib/combinedFeeDraft'
import {formatDate,formatPeso} from '../../lib/amortization'
import {PageHeader} from '../../components/AppShell'
import RefreshButton from '../../components/RefreshButton'
import Icon from '../../components/Icon'
import {Button,Card,CardHeader,EmptyState,Field,Switch,Modal,inputClass} from '../../components/ui'

const fields='id,user_id,actor_id,source_due_date,source_due_dates,assessment_mode,prior_assessment_count,assessment_month,charge_due_date,finance_enabled,finance_rate,late_enabled,base_amount,finance_amount,late_amount,total_amount,source_count,created_at,voided_at,void_reason,entries:transactions!transactions_fee_assessment_id_fkey(id,description,amount,amount_applied,status,due_date)'
const businessToday=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`}

export default function LoanFeeManager(){
 const app=useApp(),actorId=app.realSession?.user.id||app.session?.user.id,borrowers=app.users.filter(u=>u.role==='user'&&u.status==='active'),today=businessToday(),cycle=assessmentMonth(today)
 const [borrowerId,setBorrowerId]=usePersistedState('fee.borrower',''),[asOfDate,setAsOfDate]=usePersistedState('fee.asOfDate',today)
 const [dateChoice,setDateChoice]=usePersistedState('fee.dateChoice',{borrowerId:'',asOfDate:'',excluded:[]})
 const [history,setHistory]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false)
 const [voiding,setVoiding]=useState(null),[reason,setReason]=useState(''),[voidConfirmed,setVoidConfirmed]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0)
 const generation=useRef(0),voidOperation=useRef(null)
 const [pending,setPending]=useState(()=>listPendingFees(actorId))
 const refreshPending=useCallback(()=>setPending(listPendingFees(actorId)),[actorId])
 function resumePending(draft){const p=draft.payload;setBorrowerId(p.borrowerId);setAsOfDate(p.asOfDate);setDateChoice({borrowerId:p.borrowerId,asOfDate:p.asOfDate,excluded:pendingCombinedFeeDates(app.transactions,p.borrowerId,p.asOfDate).filter(d=>!p.sourceDueDates.includes(d))});setRevision(n=>n+1)}
 const dates=useMemo(()=>{try{return pendingCombinedFeeDates(app.transactions,borrowerId,asOfDate)}catch{return []}},[app.transactions,borrowerId,asOfDate])
 const excluded=dateChoice?.borrowerId===borrowerId&&dateChoice?.asOfDate===asOfDate&&Array.isArray(dateChoice.excluded)?dateChoice.excluded:[]
 const selectedDates=dates.filter(date=>!excluded.includes(date)),borrower=borrowers.find(u=>u.id===borrowerId)
 const loadHistory=useCallback(async()=>{
  const request=++generation.current;setLoading(true)
  try{let query=supabase.from('fee_assessments').select(fields).order('created_at',{ascending:false}).order('id').range(page*20,page*20+20);if(borrowerId)query=query.eq('user_id',borrowerId);const {data,error}=await query;if(error)throw error;if(request===generation.current){setHistory(data.slice(0,20));setHasMore(data.length>20);setError('')}}
  catch(e){if(request===generation.current)setError(e.message||'Fee history could not be loaded. Retry the refresh.')}
  finally{if(request===generation.current)setLoading(false)}
 },[borrowerId,page,setLoading,setHistory,setHasMore,setError])
 useEffect(()=>{let active=true;const g=generation;queueMicrotask(()=>{if(active)loadHistory()});return()=>{active=false;++g.current}},[loadHistory])
 useRecordRefresh(loadHistory)
 const refreshAfterPosting=async()=>{await app.refreshData({preservePageState:true});await loadHistory()}
 function chooseBorrower(id){const draft=loadPendingFee(actorId,id);if(draft){resumePending(draft);return}setBorrowerId(id);setPage(0);setNotice('');setDateChoice({borrowerId:id,asOfDate,excluded:[]})}
 function chooseDates(next){setDateChoice({borrowerId,asOfDate,excluded:dates.filter(d=>!next.includes(d))});setNotice('')}
 async function voidAssessment(){
  const fingerprint=JSON.stringify([voiding.id,reason]);if(voidOperation.current?.fingerprint!==fingerprint)voidOperation.current={fingerprint,key:crypto.randomUUID()}
  setSaving(true);setError('')
  try{await mobileAction('fee-void',{id:voiding.id,reason,key:voidOperation.current.key,reviewed:voidConfirmed});setVoiding(null);setNotice('Assessment voided. Its entries and cancellation reason remain in history.');await refreshAfterPosting()}
  catch(e){setError(e.message)}finally{setSaving(false)}
 }
 return <>
  <PageHeader title="Loan Fee Calculator & Billing Manager" subtitle="Combined finance charges and one late fee on a reviewed net balance." action={<RefreshButton/>}/>
  {pending.length>0&&<div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">A submitted assessment still needs its result confirmed.</p><p>Resume its original request before preparing another charge for that borrower.</p>{pending.map(d=><Button key={d.payload.key} variant="secondary" disabled={saving} onClick={()=>resumePending(d)}>Resume {app.users.find(u=>u.id===d.payload.borrowerId)?.name||'borrower'} · {formatDate(d.payload.asOfDate)} · {formatPeso(d.summary.totalCents/100)}</Button>)}</div>}
  {notice&&<p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
  {error&&<div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><Button variant="secondary" onClick={loadHistory}>Retry history</Button></div>}
  <Card className="mb-5"><CardHeader title="Assessment parameters" subtitle="Choose an As of date, then adjust the dates and entries included in the combined balance."/><div className="grid gap-4 px-5 pb-5 md:grid-cols-2">
   <Field label="Select borrower" htmlFor="fee-borrower"><select id="fee-borrower" disabled={saving} className={inputClass} value={borrowerId} onChange={e=>chooseBorrower(e.target.value)}><option value="">Choose a borrower…</option>{borrowers.map(u=><option key={u.id} value={u.id}>{u.name} · {u.accountNumber||u.email}</option>)}</select></Field>
   <Field label="As of date" htmlFor="fee-as-of" hint="Includes current recorded balances due on or before this date; this does not reconstruct historical balances."><input id="fee-as-of" className={inputClass} type="date" value={asOfDate} disabled={saving} onChange={e=>{setAsOfDate(e.target.value);setDateChoice({borrowerId,asOfDate:e.target.value,excluded:[]});setNotice('')}}/></Field>
   <div className="md:col-span-2"><PendingDueDateFilter dates={dates} selectedDates={selectedDates} onChange={chooseDates} disabled={!borrower||saving}/></div>
  </div></Card>
  {borrower&&asOfDate?<CombinedFeeAssessmentForm key={borrowerId+'|'+asOfDate+'|'+revision} actorId={actorId} borrower={borrower} asOfDate={asOfDate} selectedDates={selectedDates} cycle={cycle} today={today} transactions={app.transactions} onBusy={setSaving} onPendingChange={refreshPending} onPrepareAnother={()=>setRevision(n=>n+1)} onPosted={async r=>{setNotice('Charges posted: '+formatPeso(r.total)+'. Reference '+r.id+'.');await refreshAfterPosting()}}/>:<Card className="mb-5"><EmptyState title="Choose an account and As of date" body="Matching entries are selected automatically, including prior unpaid fees and actual negative ledger adjustments."/></Card>}
  <Card className="mt-6"><CardHeader title="Posted assessments & ledger history" subtitle="Original single-date assessments are retained alongside combined assessments."/>
   {loading?<p role="status" className="px-5 pb-5 text-sm text-slate-500">Loading fee history…</p>:!history.length?<EmptyState title="No fee assessments yet" body="Confirmed assessments retain their selection, calculation and fee entries."/>:<div className="divide-y divide-slate-100">{history.map(h=><AssessmentHistory key={h.id} assessment={h} borrowerName={app.users.find(u=>u.id===h.user_id)?.name||'Borrower'} onVoid={()=>{setVoiding(h);setReason('');setVoidConfirmed(false);setError('')}}/>)}</div>}
   <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm"><Button variant="secondary" disabled={page===0||loading||saving} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1}</span><Button variant="secondary" disabled={!hasMore||loading||saving} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
  </Card>
  <Modal open={!!voiding} title="Void unpaid fee assessment" onClose={()=>!saving&&setVoiding(null)} footer={<><Button variant="secondary" disabled={saving} onClick={()=>setVoiding(null)}>Keep assessment</Button><Button variant="danger" disabled={saving||!voidConfirmed||reason.trim().length<10||reason.length>2000} onClick={voidAssessment}>{saving?'Voiding…':'Confirm void'}</Button></>}>
   {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   <p className="mb-4 text-sm text-slate-600">This cancels both unpaid fee entries and retains their history. Allocated payments require reversal first.</p>
   <Field label="Reason for voiding" htmlFor="fee-void-reason"><textarea id="fee-void-reason" value={reason} maxLength={2000} className={inputClass} onChange={e=>setReason(e.target.value)} rows={3}/></Field>
   <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={voidConfirmed} onChange={e=>setVoidConfirmed(e.target.checked)}/>I reviewed this cancellation and its effect on the borrower's balance.</label>
  </Modal>
 </>
}

function PendingDueDateFilter({dates,selectedDates,onChange,disabled}){
 const selected=new Set(selectedDates)
 function toggle(date){const next=new Set(selected);if(next.has(date))next.delete(date);else next.add(date);onChange([...next].sort())}
 return <fieldset className="min-w-0" disabled={disabled}>
  <legend className="mb-1.5 text-sm font-semibold text-slate-700">Filter pending due dates</legend>
  <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
   <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2"><span role="status" className="text-xs text-slate-600">{selectedDates.length} of {dates.length} dates selected</span><div className="flex gap-2"><Button variant="secondary" disabled={disabled||!dates.length||selectedDates.length===dates.length} onClick={()=>onChange([...dates])}>Select all dates</Button><Button variant="secondary" disabled={disabled||!selectedDates.length} onClick={()=>onChange([])}>Clear dates</Button></div></div>
   {!dates.length?<p className="p-3 text-sm text-slate-500">{disabled?'Choose a borrower to see pending dates.':'No outstanding entries through this date.'}</p>:<div className="grid max-h-48 gap-1 overflow-y-auto p-2 sm:grid-cols-2 lg:grid-cols-3">{dates.map(date=><label key={date} className={'flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm '+(selected.has(date)?'bg-blue-50 text-blue-800':'text-slate-700 hover:bg-slate-50')}><input type="checkbox" className="h-4 w-4 shrink-0 accent-blue-600" checked={selected.has(date)} onChange={()=>toggle(date)}/><span>{formatDate(date)}</span></label>)}</div>}
  </div>
  <p className="mt-1.5 text-xs text-slate-500">Select multiple dates. Negative ledger adjustments reduce the base; payment activity already applied to dues is not subtracted again.</p>
 </fieldset>
}

export function CombinedFeeAssessmentForm({actorId,borrower,asOfDate,selectedDates,cycle,today,transactions,onBusy,onPosted,onPrepareAnother,onPendingChange}){
 const rows=useMemo(()=>{try{return eligibleCombinedFeeTransactions(transactions,borrower.id,asOfDate,selectedDates)}catch{return []}},[transactions,borrower.id,asOfDate,selectedDates])
 const [restored]=useState(()=>loadPendingFee(actorId,borrower.id))
 const saved=restored?.payload
 const [pendingSummary,setPendingSummary]=useState(restored?.summary||null)
 const [excluded,setExcluded]=useState(()=>new Set(saved?rows.filter(r=>!saved.selections.some(s=>s.id===r.id)).map(r=>r.id):[])),[rate,setRate]=useState(saved?.rate??'3'),[financeEnabled,setFinanceEnabled]=useState(saved?.financeEnabled??true),[lateEnabled,setLateEnabled]=useState(saved?.lateEnabled??true),[lateAmount,setLateAmount]=useState(saved?.lateAmount??'1500'),[dueDate,setDueDate]=useState(saved?.chargeDueDate??(asOfDate>today?asOfDate:today))
 const [reviewed,setReviewed]=useState({fingerprint:'',confirmed:false}),[repeatReview,setRepeatReview]=useState({fingerprint:'',confirmed:false})
 const [saving,setSaving]=useState(false),[posted,setPosted]=useState(false),[uncertain,setUncertain]=useState(!!restored),[error,setError]=useState(''),[shown,setShown]=useState(25)
 const [context,setContext]=useState(null),[contextError,setContextError]=useState(''),[contextLoading,setContextLoading]=useState(true)
 const operation=useRef(restored),generation=useRef(0),chosen=rows.filter(t=>!excluded.has(t.id))
 const refreshContext=useCallback(async()=>{
  const request=++generation.current;setContextLoading(true)
  try{const {data,error}=await supabase.rpc('combined_fee_context',{p_borrower_id:borrower.id});if(error)throw error;if(request===generation.current){setContext(data);setContextError('')}}
  catch(e){if(request===generation.current)setContextError(e.message||'Unable to review earlier assessments.')}
  finally{if(request===generation.current)setContextLoading(false)}
 },[borrower.id,setContextLoading,setContext,setContextError])
 useEffect(()=>{let active=true;const g=generation;queueMicrotask(()=>{if(active)refreshContext()});return()=>{active=false;++g.current}},[refreshContext,transactions])
 useRecordRefresh(refreshContext)
 useEffect(()=>{if(restored)onBusy(true)},[restored,onBusy])
 let summary,validation=''
 try{
  assessmentMonth(asOfDate);summary=calculateCombinedFeeAssessment({rows:chosen,rate,financeEnabled,lateEnabled,lateAmount})
  if(!selectedDates.length)validation='Select at least one pending due date.'
  else if(summary.baseCents<=0)validation='The selected net balance must be positive.'
  if(dueDate){assessmentMonth(dueDate);if(dueDate<asOfDate)validation='New charges cannot be due before the As of date.'}else validation='Choose a due date for the new charges.'
  if(chosen.length>1000)validation='Select at most 1000 ledger entries for one assessment.'
  if(context&&context.assessmentMonth!==cycle)validation='The assessment month changed. Refresh this page and review again.'
 }catch(e){validation=e.message}
 const titles=summary&&summary.baseCents>=0?combinedFeeDescriptions(summary,asOfDate):null
 const fingerprint=JSON.stringify({borrower:borrower.id,asOfDate,selectedDates,cycle,rate,financeEnabled,lateEnabled,lateAmount,dueDate,selections:combinedFeeSelections(chosen),prior:context?.reviewToken})
 const review=feeReviewTransition(reviewed,fingerprint),repeat=feeReviewTransition(repeatReview,fingerprint)
 if(review!==reviewed)setReviewed(review)
 if(repeat!==repeatReview)setRepeatReview(repeat)
 const disabled=saving||posted||uncertain,total=summary?.totalCents||0,needsRepeat=Number(context?.count)>0
 const ready=review.confirmed&&(!needsRepeat||repeat.confirmed)&&!contextLoading&&!contextError&&!!context&&!validation&&total>0
 async function post(){
  if(saving||posted||(!uncertain&&!ready))return
  if(!uncertain&&operation.current?.fingerprint!==fingerprint)operation.current={fingerprint,key:crypto.randomUUID(),payload:null}
  if(!uncertain)operation.current.payload={key:operation.current.key,borrowerId:borrower.id,assessmentMonth:cycle,asOfDate,sourceDueDates:selectedDates,chargeDueDate:dueDate,financeEnabled,rate,lateEnabled,lateAmount,reviewed:true,repeatConfirmed:needsRepeat?repeat.confirmed:false,priorReviewToken:context.reviewToken,selections:combinedFeeSelections(chosen)}
  setSaving(true);onBusy(true);setError('');let hold=false,result=null
  try{
   if(!uncertain){operation.current=savePendingFee(actorId,{...operation.current,createdAt:new Date().toISOString(),summary});setPendingSummary(summary);onPendingChange?.()}
   const {data,error}=await supabase.rpc('assess_combined_fees',{p_payload:operation.current.payload});if(error)throw error
   result=data;clearPendingFee(actorId,borrower.id);onPendingChange?.();setPosted(true);setUncertain(false)
  }catch(e){
   if(!e.code||(uncertain&&e.code!=='PT409')){hold=true;setUncertain(true);setError('The result could not be confirmed. Keep these details unchanged and retry the same assessment; its request reference prevents duplicate charges. If your sign-in expired, sign in again and resume this request.')}
   else{clearPendingFee(actorId,borrower.id);onPendingChange?.();setUncertain(false);setError(e.message||'Posting failed. Review again.');setReviewed({fingerprint:'',confirmed:false});operation.current=null;await refreshContext()}
  }finally{setSaving(false);onBusy(hold)}
  if(result){try{await onPosted(result)}catch{setError('Charges were posted. Reference '+result.id+'. The record refresh failed; refresh the history before preparing another assessment.')}}
 }
 function toggle(id){setExcluded(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})}
 return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(310px,390px)]">
  <Card>{uncertain&&<p role="status" className="m-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Confirming the original reviewed request. Original net base: {formatPeso((pendingSummary?.baseCents||0)/100)} · Original fees: {formatPeso((pendingSummary?.totalCents||0)/100)}. Retry uses the same reference even if current records have changed.</p>}<CardHeader title="Pending transactions & adjustments" subtitle={rows.length+' matching entries · '+borrower.name} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled||!rows.length} onClick={()=>setExcluded(new Set())}>Select all entries</Button><Button variant="secondary" disabled={disabled||!chosen.length} onClick={()=>setExcluded(new Set(rows.map(r=>r.id)))}>Deselect all entries</Button></div>}/>
   {!rows.length?<EmptyState title="No outstanding entries selected" body="Adjust the As of date or select another pending due date."/>:<div className="divide-y divide-slate-100">{rows.slice(0,shown).map(t=><label key={t.id} className={'flex items-start gap-3 px-5 py-4 '+(t.remainingCents<0?'bg-emerald-50/50':!excluded.has(t.id)?'bg-blue-50/40':'')}><input type="checkbox" aria-label={'Include '+t.description} disabled={disabled} checked={!excluded.has(t.id)} onChange={()=>toggle(t.id)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600"/><span className="min-w-0 flex-1"><strong className={'block break-words text-sm '+(t.remainingCents<0?'text-emerald-800':t.feeKind?'text-red-700':'text-slate-900')}>{t.description}</strong><small className="mt-1 block text-slate-500">Due {formatDate(t.dueDate)}{t.feeKind?' · Prior fee':''}{t.remainingCents<0?' · Reduces assessment base':''}{t.paidAmount>0?' · Already paid '+formatPeso(t.paidAmount):''}</small></span><strong className={'shrink-0 font-mono text-sm '+(t.remainingCents<0?'text-emerald-700':'')}>{formatPeso(t.remainingCents/100)}</strong></label>)}</div>}
   {shown<rows.length&&<Button variant="secondary" className="m-4" onClick={()=>setShown(n=>n+25)}>Show 25 more</Button>}
   <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-sm"><span>Selected entries: <b>{chosen.length}</b></span><span>Net base: <b>{formatPeso((summary?.baseCents||0)/100)}</b></span></div>
  </Card>
  <Card className="xl:sticky xl:top-24"><CardHeader title="Combined fee calculation" subtitle={'As of '+formatDate(asOfDate)}/><div className="space-y-4 px-5 pb-5">
   <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="fee-finance-rate" className="text-sm font-semibold">Finance charge rate</label><Switch stateLabels={{"on":"Finance charge is included","off":"Finance charge is excluded"}} checked={financeEnabled} disabled={disabled} onChange={value=>!disabled&&setFinanceEnabled(value)} label="Apply finance charge"/></div><div className="flex items-center gap-2"><input id="fee-finance-rate" type="number" min="0" max="100" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} disabled={disabled||!financeEnabled} className={inputClass}/><span>%</span></div></div>
   <div><div className="mb-2 flex items-center justify-between gap-2"><label htmlFor="fee-late-amount" className="text-sm font-semibold">One late payment fee</label><Switch stateLabels={{"on":"Late fee is included","off":"Late fee is excluded"}} checked={lateEnabled} disabled={disabled} onChange={value=>!disabled&&setLateEnabled(value)} label="Apply late payment fee"/></div><div className="flex items-center gap-2"><span>₱</span><input id="fee-late-amount" type="number" min="0" step="0.01" value={lateAmount} onChange={e=>setLateAmount(e.target.value)} disabled={disabled||!lateEnabled} className={inputClass}/></div><p className="mt-1 text-xs text-slate-500">Charged once for this combined assessment, regardless of the number of dates.</p></div>
   <Field label="New charges due date" htmlFor="fee-charge-date" hint="Applies to both new fee entries."><input id="fee-charge-date" type="date" min={asOfDate} value={dueDate} disabled={disabled} className={inputClass} onChange={e=>setDueDate(e.target.value)}/></Field>
   <dl className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt>Unpaid charges selected</dt><dd>{formatPeso((summary?.chargeBaseCents||0)/100)}</dd></div><div className="flex flex-wrap justify-between gap-2 text-emerald-800"><dt>Negative adjustments</dt><dd>{formatPeso((summary?.adjustmentCents||0)/100)}</dd></div><div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 font-semibold"><dt>Net assessment base</dt><dd data-testid="fee-net-base">{formatPeso((summary?.baseCents||0)/100)}</dd></div></dl>
   {titles&&summary&&<div aria-label="Fee entries preview" className="space-y-2">{summary.financeCents>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong className="block break-words">{titles.finance}</strong><b className="mt-2 block text-right font-mono">{formatPeso(summary.financeCents/100)}</b></div>}{summary.lateCents>0&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong className="block break-words">{titles.late}</strong><b className="mt-2 block text-right font-mono">{formatPeso(summary.lateCents/100)}</b></div>}</div>}
   <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-3 font-semibold"><span>Total new charges</span><span data-testid="fee-total" className="font-mono text-red-700">{formatPeso(total/100)}</span></div>
   {contextLoading?<p role="status" className="text-sm text-slate-500">Checking previous assessments…</p>:contextError?<div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{contextError}<Button variant="secondary" disabled={disabled} onClick={refreshContext}>Reload assessment review</Button></div>:needsRepeat?<div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p><b>{context.count} active assessment{context.count===1?'':'s'} already posted this calendar month</b>, totaling {formatPeso(context.total)}. Another assessment adds new charges even when dates overlap.</p><ul className="space-y-1 text-xs">{context.assessments.map(h=><li key={h.id}>Posted {formatDate(h.created_at)} · {formatPeso(h.total_amount)}</li>)}</ul><label className="flex items-start gap-2"><input type="checkbox" id="fee-repeat-confirm" disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-700" checked={repeat.confirmed} onChange={e=>setRepeatReview({fingerprint,confirmed:e.target.checked})}/>I explicitly authorize another assessment for this borrower this month, including another late fee if enabled.</label></div>:<p className="text-xs text-slate-500">No active assessments posted for this borrower this calendar month.</p>}
   {(validation||error)&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error||validation}</p>}
   <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" id="fee-confirm" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" disabled={disabled||!!validation||!total||contextLoading||!!contextError||!context} checked={review.confirmed} onChange={e=>setReviewed({fingerprint,confirmed:e.target.checked})}/><span>I reviewed {selectedDates.length} selected dates, the net balance, both fee amounts and the new due date. Post these charges to <b>{borrower.name}</b>.</span></label>
   <Button className="w-full scroll-mb-28 justify-center" variant="danger" disabled={saving||posted||(!uncertain&&!ready)} onClick={post}><Icon name={saving?'refresh':'send'} className={'h-4 w-4 '+(saving?'animate-spin':'')}/>{saving?'Posting charges…':posted?'Charges posted':uncertain?'Retry same assessment':'Confirm & post charges'}</Button>
   {posted&&<Button className="w-full justify-center" variant="secondary" onClick={onPrepareAnother}>Prepare another assessment</Button>}
   <p className="text-xs leading-relaxed text-slate-500">Every assessment requires confirmation. These fees add amounts due; they do not create a payment or account credit.</p>
  </div></Card>
 </div>
}

function AssessmentHistory({assessment:h,borrowerName,onVoid}){
 const [details,setDetails]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const canVoid=!h.voided_at&&h.entries.every(e=>Number(e.amount_applied)===0&&!['paid','refunded'].includes(e.status))
 async function load(open){if(!open||details||loading)return;setLoading(true);try{const {data,error}=await supabase.from('fee_assessments').select('source_rows').eq('id',h.id).single();if(error)throw error;setDetails(data.source_rows);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}}
 return <article className={`px-5 py-4 ${h.voided_at?'bg-slate-50':'bg-red-50/20'}`} data-fee-assessment-id={h.id}>
  <div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="block text-sm">{borrowerName}</strong><p className="mt-1 text-xs text-slate-500">Posted {formatDate(h.created_at)} · {h.assessment_mode==='combined'?'As of':'Source due'} {formatDate(h.source_due_date)} · New due {formatDate(h.charge_due_date)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${h.voided_at?'bg-slate-200 text-slate-700':'bg-red-100 text-red-800'}`}>{h.voided_at?'Voided':'Assessed fees'}</span></div>
  <div className="mt-3 space-y-2">{h.entries.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-red-100 bg-white/70 p-3 text-sm text-red-800"><span className="min-w-0 flex-1 break-words">{e.description}<small className="ml-2 text-slate-500">{e.status==='paid'?'Paid':e.status==='cancelled'?'Cancelled':Number(e.amount_applied)>0?'Partly paid':'Unpaid'}</small></span><b className="font-mono">{formatPeso(e.amount)}</b></div>)}</div>
  {h.assessment_mode==='combined'&&<p className="mt-2 text-xs text-slate-500">Selected due dates: {(h.source_due_dates||[]).map(formatDate).join(' · ')} · Prior assessments this month: {h.prior_assessment_count}</p>}
  <details className="mt-3 text-sm" onToggle={e=>load(e.currentTarget.open)}><summary className="cursor-pointer text-slate-700">Calculation details · {h.source_count} selected · Base {formatPeso(h.base_amount)}</summary><p className="mt-2 text-xs text-slate-500">Assessment {h.id} · {h.finance_enabled?`${Number(h.finance_rate)}% finance charge`:'Finance charge off'} · Late fee {formatPeso(h.late_amount)}</p>{loading&&<p role="status">Loading original selection…</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}{details&&<ul className="mt-2 space-y-1">{details.map(r=><li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2"><span className="min-w-0 flex-1 break-words">{r.description}</span><b>{formatPeso(r.remainingAmount)}</b></li>)}</ul>}</details>
  {h.voided_at?<p className="mt-3 text-sm text-slate-600">Voided {formatDate(h.voided_at)} · {h.void_reason}</p>:canVoid&&<div className="mt-3 flex justify-end"><Button variant="secondary" onClick={onVoid}>Void unpaid assessment</Button></div>}
 </article>
}
