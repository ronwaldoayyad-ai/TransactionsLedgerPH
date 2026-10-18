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
