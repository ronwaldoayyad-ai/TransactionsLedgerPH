export function loanFeeHelp(label,group='cash_loan',processingAmount='₱ 1,500.00'){
 if(group==='retail_installment')return ({
  'Documentary Stamp Tax':'Documentary Stamp Tax (DST) is not applicable to Retail Installment transactions.',
  'Processing Fee':'The processing fee varies with the transaction amount and how the purchase was processed as an installment. Store purchases arranged as installments at checkout usually have no processing fee. A processing fee may apply when a straight purchase is later converted to installments. Refer to the fee shown for this transaction.',
  'Notarial Fee':'Notarial Fee is not applicable to Retail Installment transactions.'
 })[label]||''
 return ({
  'Documentary Stamp Tax':'Documentary Stamp Tax (DST) is auto-calculated at ₱1.50 per ₱200 of the loan amount, applied when the amount is ₱500,000 or more.',
  'Processing Fee':'A fixed processing fee of '+processingAmount+' is billed one-time on the first monthly amortization.',
  'Notarial Fee':'A notarial fee of 0.35% of the loan amount is charged one-time on the first monthly amortization, applied when the amount is ₱500,000 or more.'
 })[label]||''
}
