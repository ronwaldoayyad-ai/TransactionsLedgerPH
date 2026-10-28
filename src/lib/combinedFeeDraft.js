const prefix='loanledger-combined-fee-pending:v1:'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const key=(actorId,borrowerId)=>prefix+actorId+':'+borrowerId
export function loadPendingFee(actorId,borrowerId,storage){
 if(!uuid.test(actorId||'')||!uuid.test(borrowerId||''))return null
 try{
  const draft=JSON.parse((storage??globalThis.sessionStorage).getItem(key(actorId,borrowerId))||'null'),p=draft?.payload
  if(draft?.version!==1||draft.actorId!==actorId||p?.borrowerId!==borrowerId||!uuid.test(p.key||'')||p.reviewed!==true||!Array.isArray(p.selections)||p.selections.length<1||p.selections.length>1000||!Array.isArray(p.sourceDueDates)||!/^\d{4}-\d{2}-\d{2}$/.test(p.asOfDate||'')||!draft.summary||!Number.isSafeInteger(draft.summary.totalCents))return null
  return draft
 }catch{return null}
}
export function listPendingFees(actorId,storage){
 if(!uuid.test(actorId||''))return []
 try{
  const target=storage??globalThis.sessionStorage,result=[]
  for(let i=0;i<target.length;i++){const name=target.key(i);if(name?.startsWith(prefix+actorId+':')){const draft=loadPendingFee(actorId,name.slice((prefix+actorId+':').length),target);if(draft)result.push(draft)}}
  return result.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))
 }catch{return []}
}
export function savePendingFee(actorId,draft,storage){
 const record={...draft,version:1,actorId},name=key(actorId,draft.payload.borrowerId)
 try{
  const target=storage??globalThis.sessionStorage,text=JSON.stringify(record)
  target.setItem(name,text)
  if(target.getItem(name)!==text||!loadPendingFee(actorId,draft.payload.borrowerId,target))throw Error()
  return record
 }catch{
  const error=Error('Browser storage could not preserve the reviewed request. Allow session storage before posting; no request was sent.')
  error.code='DRAFT_STORAGE_UNAVAILABLE';throw error
 }
}
export function clearPendingFee(actorId,borrowerId,storage){
 try{(storage??globalThis.sessionStorage).removeItem(key(actorId,borrowerId));return true}catch{return false}
}
