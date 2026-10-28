// No storage URL renewal or page-state reset during background ledger updates.
export async function fetchLedgerSnapshot(client,readAll){
 const entries=await Promise.all([
  ['profiles','created_at'],['loans','created_at'],['transactions','due_date'],
  ['payments','submitted_at'],['payment_logs','created_at'],['payment_postings','created_at'],
  ['payment_breakdown_visibility','posting_id'],
 ].map(async([table,order])=>{
  const fields=table==='payment_postings'?'*, allocation_rows:payment_allocations(transaction_id,user_id,amount,before_balance)':'*'
  const result=await readAll(()=>{let query=client.from(table).select(fields).order(order);if(table!=='payment_breakdown_visibility')query=query.order('id');return query})
  if(result.error)throw Error(`Live ${table.replaceAll('_',' ')} could not be refreshed: ${result.error.message}`)
  return [table,result.data??[]]
 }))
 return Object.fromEntries(entries)
}
