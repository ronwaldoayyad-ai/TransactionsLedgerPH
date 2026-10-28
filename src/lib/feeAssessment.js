import {moneyCents,outstandingCents,centsAmount} from './paymentAllocation.js'

export function feeReviewTransition(review,fingerprint){return review.fingerprint===fingerprint?review:{fingerprint,confirmed:false}}

export function eligibleFeeTransactions(transactions,borrowerId,dueDate){
 return transactions.filter(t=>t.userId===borrowerId&&t.dueDate===dueDate&&!t.archivedAt&&['unpaid','past_due'].includes(t.status)&&Number(t.originalAmount??t.amount)>0)
  .map(t=>({...t,remainingCents:outstandingCents(t)})).filter(t=>t.remainingCents>0)
}
export function calculateFeeAssessment({rows,rate='3',financeEnabled=true,lateEnabled=true,lateAmount='1500'}){
 const ids=new Set();let baseCents=0
 for(const row of rows){if(ids.has(row.id))throw Error('A transaction can only be selected once.');ids.add(row.id);baseCents+=outstandingCents(row)}
 centsAmount(baseCents)
 let rateBasisPoints=0
 if(financeEnabled){if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(String(rate))||Number(rate)>100)throw Error('Enter a finance charge rate from 0 to 100%, with at most two decimal places.');rateBasisPoints=moneyCents(rate)}
 const financeCents=baseCents?Number((BigInt(baseCents)*BigInt(rateBasisPoints)+5000n)/10000n):0
 const lateCents=baseCents&&lateEnabled?moneyCents(lateAmount):0,totalCents=financeCents+lateCents
 centsAmount(totalCents)
 return {baseCents,financeCents,lateCents,totalCents,rate:rateBasisPoints/100}
}
export function assessmentMonth(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Choose a valid date.')
 return value.slice(0,7)+'-01'
}
export function feeDescriptions(summary,sourceDueDate){
 assessmentMonth(sourceDueDate)
 const date=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(sourceDueDate+'T00:00:00Z'))
 const base=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(summary.baseCents/100)
 return {finance:`${summary.rate}% Finance Charge for ${date} (₱${base})`,late:`Late Payment fee for ${date}`}
}


// Actual ledger adjustments can reduce the base. Display-only posting activity
// is never passed here: its value is already reflected in amount_applied.
export function signedFeeCents(value){
 const text=String(value),negative=text.startsWith('-')
 return (negative?-1:1)*moneyCents(negative?text.slice(1):text)
}
export function signedFeeAmount(cents){
 return (cents<0?'-':'')+centsAmount(Math.abs(cents))
}
export function feeLedgerBalanceCents(row){
 if(['paid','cancelled','refunded'].includes(row.status))return 0
 const original=signedFeeCents(row.originalAmount??row.amount),paid=moneyCents(row.paidAmount??0)
 if(original<0){if(paid)throw Error('A negative adjustment cannot have an applied payment. Review this record.');return original}
 if(paid>original)throw Error('Paid amount exceeds the original due.')
 return original-paid
}
export function eligibleCombinedFeeTransactions(transactions,borrowerId,asOfDate,selectedDates){
 assessmentMonth(asOfDate)
 const dates=selectedDates==null?null:new Set(selectedDates)
 return transactions.filter(t=>t.userId===borrowerId&&t.dueDate&&t.dueDate<=asOfDate&&(!dates||dates.has(t.dueDate))&&!t.archivedAt&&['unpaid','past_due'].includes(t.status))
  .map(t=>({...t,remainingCents:feeLedgerBalanceCents(t)})).filter(t=>t.remainingCents!==0)
  .sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id))
}
export function pendingCombinedFeeDates(transactions,borrowerId,asOfDate){
 return [...new Set(eligibleCombinedFeeTransactions(transactions,borrowerId,asOfDate).map(t=>t.dueDate))]
}
export function calculateCombinedFeeAssessment({rows,...options}){
 const ids=new Set();let baseCents=0,chargeBaseCents=0,adjustmentCents=0
 for(const row of rows){
  if(ids.has(row.id))throw Error('A transaction can only be selected once.')
  ids.add(row.id)
  const balance=feeLedgerBalanceCents(row);baseCents+=balance
  if(balance>0)chargeBaseCents+=balance;else adjustmentCents+=balance
  if(!Number.isSafeInteger(baseCents))throw Error('The selected balance exceeds the supported limit.')
 }
 centsAmount(Math.abs(baseCents))
 const summary=calculateFeeAssessment({...options,rows:baseCents>0?[{id:'combined-base',amount:centsAmount(baseCents),status:'unpaid'}]:[]})
 return {...summary,baseCents,chargeBaseCents,adjustmentCents}
}
export function combinedFeeDescriptions(summary,asOfDate){
 const original=feeDescriptions(summary,asOfDate)
 return {finance:original.finance.replace('Finance Charge for ','Finance Charge as of '),late:original.late.replace('Late Payment fee for ','Late Payment Fee as of ')}
}
export function combinedFeeSelections(rows){
 return rows.map(row=>({
  id:row.id,expectedBalance:signedFeeAmount(feeLedgerBalanceCents(row)),
  expectedAmount:signedFeeAmount(signedFeeCents(row.originalAmount??row.amount)),
  expectedAppliedAmount:centsAmount(moneyCents(row.paidAmount??0)),
  expectedDueDate:row.dueDate,expectedDescription:row.description,expectedStatus:row.status,
 }))
}
