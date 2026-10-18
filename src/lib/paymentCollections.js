export function collectionEntries(transactions,postings=[]) {
  const legacy=transactions.filter(t=>t.status==='paid'&&!t.paidAmount).map(t=>({id:t.id,amount:t.originalAmount??t.amount,datePaid:t.datePaid}))
  const cash=postings.filter(p=>Number(p.cash_amount)>0).map(p=>({id:p.id,amount:Number(p.cash_amount)*(p.reversal_of?-1:1),datePaid:p.effective_date}))
  return [...legacy,...cash]
}

export function postingFigures() { throw Error('Posting history figures are not implemented.') }
