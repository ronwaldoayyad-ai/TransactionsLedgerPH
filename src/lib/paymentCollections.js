export function collectionEntries(transactions) { return transactions.filter(t=>t.status==='paid').map(t=>({amount:t.amount,datePaid:t.datePaid})) }
