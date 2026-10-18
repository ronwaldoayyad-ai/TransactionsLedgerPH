export function collectionEntries(transactions,postings=[]) {
  const legacy=transactions.filter(t=>t.status==='paid'&&!t.paidAmount).map(t=>({id:t.id,amount:t.originalAmount??t.amount,datePaid:t.datePaid}))
  const cash=postings.filter(p=>Number(p.cash_amount)>0).map(p=>({id:p.id,amount:Number(p.cash_amount)*(p.reversal_of?-1:1),datePaid:p.effective_date}))
  return [...legacy,...cash]
}

export function postingFigures(posting) {
  const sign=posting.reversal_of?-1:1
  return {cash:sign*Number(posting.cash_amount)||0,allocated:sign*Number(posting.allocated_amount)||0,creditChange:sign*(Number(posting.credit_added)-Number(posting.credit_used))||0}
}
