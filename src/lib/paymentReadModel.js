import {moneyCents} from './paymentAllocation.js'

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
