import {moneyCents} from './paymentAllocation.js'

// Presentation only: these rows are never added to transactions or balance totals.
export function buildPaymentAdjustments({ownerId,postings=[],transactions=[],logs=[]}) {
  if(!ownerId)return []
  const own=new Map(postings.filter(p=>p.user_id===ownerId).map(p=>[p.id,p]))
  const reversed=new Set([...own.values()].filter(p=>p.reversal_of).map(p=>p.reversal_of))
  const dues=new Map(transactions.filter(t=>t.userId===ownerId).map(t=>[t.id,t]))
  const references=new Map(logs.filter(l=>l.userId===ownerId).map(l=>[l.sourcePostingId,l.reference]))
  return [...own.values()].filter(p=>!p.reversal_of&&moneyCents(p.cash_amount??0)>0).flatMap(p=>{
    const allocations=(p.allocation_rows||[]).filter(a=>a.user_id===ownerId).map(a=>{
      const t=dues.get(a.transaction_id),amount=moneyCents(a.amount),before=moneyCents(a.before_balance)
      return {description:t?.description||'Previously recorded due',dueDate:t?.dueDate||null,amount:amount/100,beforeBalance:before/100,afterBalance:(before-amount)/100}
    })
    const excess=moneyCents(p.credit_added??0),partial=allocations.some(a=>a.afterBalance>0)
    if(!excess&&!partial)return []
    return [{id:p.id,kind:excess?'overpayment':'partial',amount:-(excess||moneyCents(p.cash_amount))/100,
      date:p.effective_date,recordedAt:p.created_at,reference:references.get(p.id)||'',note:p.note||'',
      status:reversed.has(p.id)?'reversed':'applied',cashReceived:moneyCents(p.cash_amount)/100,
      creditUsed:moneyCents(p.credit_used??0)/100,totalApplied:moneyCents(p.allocated_amount??0)/100,
      dueDates:[...new Set(allocations.map(a=>a.dueDate).filter(Boolean))].sort(),allocations}]
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.recordedAt).localeCompare(String(a.recordedAt))||String(a.id).localeCompare(String(b.id)))
}

export function transactionAmounts(row) {
  const text=String(row.amount), appliedCents=moneyCents(row.amount_applied ?? 0)
  const originalCents=text.startsWith('-')?-moneyCents(text.slice(1)):moneyCents(row.amount)
  const open=['unpaid','past_due'].includes(row.status)
  if(originalCents<0 && !appliedCents)return {originalAmount:originalCents/100,paidAmount:0,remainingAmount:open?originalCents/100:0,amount:originalCents/100}
  if(appliedCents>originalCents)throw Error('Applied payment exceeds its original due.')
  const remainingAmount=open ? (originalCents-appliedCents)/100 : 0
  // Existing balance screens consume amount. Keep the scheduled amount separately;
  // persistence must always retain the original, never write this remainder back.
  return {originalAmount:originalCents/100,paidAmount:appliedCents/100,remainingAmount,amount:open?remainingAmount:originalCents/100}
}

// Read immutable allocation snapshots. Never reconstruct activity from current
// dues or notification text, which can change independently of a posting.
export function buildCreditActivity({ownerId,postings=[],transactions=[],logs=[]}) {
  if(!ownerId)return []
  const own=new Map(postings.filter(p=>p.user_id===ownerId).map(p=>[p.id,p]))
  const reversed=new Set([...own.values()].filter(p=>p.reversal_of).map(p=>p.reversal_of))
  const dues=new Map(transactions.filter(t=>t.userId===ownerId).map(t=>[t.id,t]))
  const references=new Map(logs.filter(l=>l.userId===ownerId).map(l=>[l.sourcePostingId,l.reference]))
  return [...own.values()].filter(p=>moneyCents(p.credit_used??0)>0).map(p=>({
    id:p.id,date:p.effective_date,recordedAt:p.created_at,
    reference:references.get(p.id)||'',note:p.note||'',
    creditUsed:moneyCents(p.credit_used)/100,cashIncluded:moneyCents(p.cash_amount)/100,totalApplied:(moneyCents(p.allocated_amount)-moneyCents(p.correction_credit_reclaimed??0))/100,
    status:p.reversal_of?'reversal':reversed.has(p.id)?'reversed':'applied',
    allocations:(p.allocation_rows||[]).filter(a=>a.user_id===ownerId).map(a=>{
      const t=dues.get(a.transaction_id),amount=moneyCents(a.amount),balance=moneyCents(a.before_balance)
      return {description:t?.description||'Previously recorded due',dueDate:t?.dueDate||null,amount:amount/100,
        beforeBalance:(p.reversal_of?balance-amount:balance)/100,afterBalance:(p.reversal_of?balance:balance-amount)/100}
    }),
  })).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.recordedAt).localeCompare(String(a.recordedAt))||String(a.id).localeCompare(String(b.id)))
}
