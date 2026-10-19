export const TRANSACTION_TYPES = ['Straight', 'Installment']
export const TRANSACTION_STATUSES = ['paid', 'unpaid', 'refunded', 'cancelled', 'past_due']

export function signedTransactionAmount(value) {
  const text=String(value??'').trim()
  if(!/^[+-]?\d{1,10}(\.\d{1,2})?$/.test(text))throw Error('Enter an amount with no more than two decimal places.')
  const amount=Number(text)
  if(!Number.isFinite(amount)||amount===0||Math.abs(amount)>9999999999.99)throw Error('Enter a positive or negative amount other than zero.')
  return amount
}
function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Choose a valid calendar date.')
  return value
}
export function transactionEditLock(transaction) {
  if(transaction.feeAssessmentId)return 'Manage assessed fees in Loan fees & billing.'
  if(transaction.paidAmount>0)return 'Reverse the reviewed payment before changing its amount, type or status.'
  return ''
}
const columns={description:'description',amount:'amount',type:'type',txnDate:'txn_date',dueDate:'due_date',datePaid:'date_paid',status:'status'}
export function prepareTransactionEdit(current,patch,today) {
  if(!current)throw Error('This transaction is no longer available. Refresh and retry.')
  if(!patch||!Object.keys(patch).length||Object.keys(patch).some(key=>!Object.hasOwn(columns,key)))throw Error('Unsupported transaction change.')
  if(current.feeAssessmentId)throw Error(transactionEditLock(current))
  if(current.paidAmount>0&&['amount','type','status','datePaid'].some(key=>Object.hasOwn(patch,key)))throw Error(transactionEditLock(current))
  const next={...current,...patch}
  if(Object.hasOwn(patch,'amount')){next.amount=signedTransactionAmount(patch.amount);next.originalAmount=next.amount;next.remainingAmount=['unpaid','past_due'].includes(next.status)?next.amount:0}
  if(Object.hasOwn(patch,'type')&&!TRANSACTION_TYPES.includes(next.type))throw Error('Choose Straight or Installment.')
  if(Object.hasOwn(patch,'description')){next.description=String(next.description??'').trim();if(!next.description||next.description.length>2000)throw Error('Enter a description of 1 to 2,000 characters.')}
  for(const key of ['txnDate','dueDate'])if(Object.hasOwn(patch,key))validDate(next[key])
  if(Object.hasOwn(patch,'status')&&!TRANSACTION_STATUSES.includes(next.status))throw Error('Choose a valid transaction status.')
  if(Object.hasOwn(patch,'datePaid')){
    if(next.datePaid)validDate(next.datePaid)
    if(next.datePaid&&['unpaid','past_due'].includes(next.status))next.status='paid'
    if(!next.datePaid&&next.status==='paid')next.status='unpaid'
  }
  if(next.status==='paid'&&!next.datePaid)next.datePaid=validDate(today)
  if(['unpaid','past_due','cancelled'].includes(next.status))next.datePaid=null
  if(Object.hasOwn(next,'originalAmount'))next.remainingAmount=['unpaid','past_due'].includes(next.status)?next.originalAmount-(next.paidAmount||0):0
  const keys=new Set(Object.keys(patch));if(next.status!==current.status)keys.add('status');if(next.datePaid!==current.datePaid)keys.add('datePaid')
  const dbPatch=Object.fromEntries([...keys].map(key=>[columns[key],key==='amount'?next.originalAmount:next[key]]))
  const expected=Object.fromEntries([...keys].map(key=>[columns[key],key==='amount'?(current.originalAmount??current.amount):current[key]]))
  return {next,dbPatch,expected}
}
export function prepareManualTransaction(input,borrowers,today,loans=[],transactions=[]) {
  if(!/^manual-[0-9a-f-]{36}$/i.test(input.id||''))throw Error('Reopen Add transaction and retry.')
  if(!borrowers.some(user=>user.id===input.userId&&user.role==='user'))throw Error('Choose a borrower account.')
  const loanId=input.loanId||null
  if(loanId&&!loans.some(loan=>loan.id===loanId&&loan.userId===input.userId))throw Error('Choose a loan belonging to this borrower.')
  const n=loanId?transactions.reduce((max,t)=>t.loanId===loanId?Math.max(max,Number(t.n)||0):max,0)+1:1
  const status=input.status||'unpaid',datePaid=['paid','refunded'].includes(status)?(input.datePaid||null):null
  const {next}=prepareTransactionEdit({id:input.id,userId:input.userId,loanId,n,paidAmount:0,status:'unpaid',datePaid:null},{description:input.description,amount:input.amount,type:input.type,txnDate:input.txnDate,dueDate:input.dueDate,status,datePaid:status==='paid'?(datePaid||today):datePaid},today)
  return next
}

export async function persistTransactionEdit(client,current,patch,today) {
  const prepared=prepareTransactionEdit(current,patch,today)
  let query=client.from('transactions').update(prepared.dbPatch).eq('id',current.id).eq('amount_applied',current.paidAmount||0).is('archived_at',null)
  for(const [key,value] of Object.entries(prepared.expected))query=value==null?query.is(key,null):query.eq(key,value)
  const {data,error}=await query.select().single()
  if(error)throw Error(error.code==='PGRST116'?'This transaction changed. Refresh and review before saving again.':error.message)
  if(!data?.id)throw Error('The saved transaction could not be confirmed. Refresh and retry.')
  return data
}

// Admin corrections use a separate reviewed RPC; ordinary writes keep their guards.
export function transactionCorrectionSnapshot(t) {
  return {user_id:t.userId,loan_id:t.loanId??null,n:t.n,description:t.description,amount:t.originalAmount??t.amount,amount_applied:t.paidAmount||0,type:t.type,txn_date:t.txnDate,due_date:t.dueDate,date_paid:t.datePaid??null,status:t.status,fee_assessment_id:t.feeAssessmentId??null,archived_at:t.archivedAt??null}
}
export function prepareAdminCorrection(current,patch,today,borrowers) {
  if(!current)throw Error('This transaction is no longer available. Refresh and retry.')
  if(Object.hasOwn(patch,'userId')&&!borrowers.some(u=>u.id===patch.userId&&u.role==='user'))throw Error('Choose a borrower account.')
  // Reuse field validation without the ordinary edit locks.
  const {userId,...fields}=patch
  const base={...current,feeAssessmentId:null,paidAmount:0}
  const next=Object.keys(fields).length?prepareTransactionEdit(base,fields,today).next:{...base}
  next.userId=userId??current.userId
  if(Object.hasOwn(patch,'amount')&&!Object.hasOwn(patch,'status')&&current.paidAmount>0&&next.originalAmount>current.paidAmount&&next.status==='paid'){next.status='unpaid';next.datePaid=null}
  const retained=['cancelled','refunded'].includes(next.status)?0:Math.min(current.paidAmount||0,Math.max(next.originalAmount??next.amount,0))
  return {next,creditReturned:(Math.round((current.paidAmount||0)*100)-Math.round(retained*100))/100,retained,expected:transactionCorrectionSnapshot(current)}
}
