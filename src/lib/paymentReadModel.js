import {moneyCents} from './paymentAllocation.js'

export function transactionAmounts(row) {
  const originalCents=moneyCents(row.amount), appliedCents=moneyCents(row.amount_applied ?? 0)
  if(appliedCents>originalCents)throw Error('Applied payment exceeds its original due.')
  const open=['unpaid','past_due'].includes(row.status)
  const remainingAmount=open ? (originalCents-appliedCents)/100 : 0
  // Existing balance screens consume amount. Keep the scheduled amount separately;
  // persistence must always retain the original, never write this remainder back.
  return {originalAmount:originalCents/100,paidAmount:appliedCents/100,remainingAmount,amount:open?remainingAmount:originalCents/100}
}
