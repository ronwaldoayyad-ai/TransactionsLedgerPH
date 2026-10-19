import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {signedTransactionAmount,prepareManualTransaction,prepareTransactionEdit,persistTransactionEdit} from '../../src/lib/transactionEditing.js'

const today='2026-10-19',current={id:'qa-entry',userId:'qa',loanId:null,n:1,description:'QA ledger entry',amount:100,originalAmount:100,paidAmount:0,type:'Straight',txnDate:today,dueDate:today,status:'unpaid',datePaid:null}
const entry={...current,id:'manual-12345678-1234-4234-8234-123456789abc'},borrowers=[{id:'qa',role:'user'},{id:'admin',role:'admin'}]

test('signed ledger amounts preserve centavos and reject zero, overflow and malformed values',()=>{
  for(const [input,expected] of [['100.25',100.25],['-1250.99',-1250.99],['+0.01',0.01],[-0.01,-0.01]])assert.equal(signedTransactionAmount(input),expected)
  for(const input of [0,'-0.00','',null,'1.001','1e4','10000000000','NaN',Infinity,'12abc'])assert.throws(()=>signedTransactionAmount(input))
})
test('manual transactions support both signs and a borrower-owned loan link with the next available sequence',()=>{
  assert.equal(prepareManualTransaction(entry,borrowers,today).loanId,null)
  assert.equal(prepareManualTransaction({...entry,amount:'-25.10'},borrowers,today).amount,-25.1)
  const loan={id:'loan',userId:'qa'},result=prepareManualTransaction({...entry,loanId:'loan',type:'Installment'},borrowers,today,[loan],[{loanId:'loan',n:12},{loanId:'loan',n:14,archivedAt:today}])
  assert.equal(result.loanId,'loan');assert.equal(result.n,15);assert.equal(result.type,'Installment')
  assert.throws(()=>prepareManualTransaction({...entry,loanId:'other'},borrowers,today,[{id:'other',userId:'someone-else'}]),/belonging/)
  assert.throws(()=>prepareManualTransaction({...entry,userId:'admin'},borrowers,today),/borrower/)
})
test('edits persist only requested columns and preserve paid-date rules',()=>{
  assert.deepEqual(prepareTransactionEdit(current,{type:'Installment'},today).dbPatch,{type:'Installment'})
  assert.deepEqual(prepareTransactionEdit(current,{amount:'-12.34'},today).dbPatch,{amount:-12.34})
  assert.deepEqual(prepareTransactionEdit(current,{status:'paid'},today).dbPatch,{status:'paid',date_paid:today})
  assert.deepEqual(prepareTransactionEdit({...current,status:'paid',datePaid:today},{status:'unpaid'},today).dbPatch,{status:'unpaid',date_paid:null})
  assert.equal(prepareTransactionEdit(current,{datePaid:today},today).next.status,'paid')
  assert.throws(()=>prepareTransactionEdit(current,{type:'unknown'},today))
  assert.throws(()=>prepareTransactionEdit(current,{dueDate:'2026-02-30'},today))
  assert.throws(()=>prepareTransactionEdit(current,{userId:'someone-else'},today))
})
test('fee assessments and reviewed payment allocations retain their edit protections',()=>{
  for(const patch of [{amount:-25},{type:'Installment'},{status:'unpaid'},{datePaid:null}])assert.throws(()=>prepareTransactionEdit({...current,paidAmount:50},patch,today),/reviewed payment/)
  assert.throws(()=>prepareTransactionEdit({...current,feeAssessmentId:'assessment'},{description:'changed'},today),/assessed fees/)
  assert.equal(prepareTransactionEdit({...current,paidAmount:50},{description:'Updated note'},today).next.description,'Updated note')
})
function mockClient(result){const calls=[],query={};for(const method of ['update','eq','is','select'])query[method]=(...args)=>{calls.push([method,...args]);return query};query.single=async()=>result;return {client:{from:table=>{calls.push(['from',table]);return query}},calls}}
test('confirmed edits check stale fields and allocated funds, and return the saved server record',async()=>{
  const expected={id:current.id,amount:-50},db=mockClient({data:expected,error:null})
  assert.deepEqual(await persistTransactionEdit(db.client,current,{amount:-50},today),expected)
  assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]==='amount'&&c[2]===100));assert.ok(db.calls.some(c=>c[0]==='eq'&&c[1]==='amount_applied'&&c[2]===0))
  assert.deepEqual(db.calls.find(c=>c[0]==='update')[1],{amount:-50})
  await assert.rejects(()=>persistTransactionEdit(mockClient({error:{code:'PGRST116'}}).client,current,{type:'Installment'},today),/changed/)
  await assert.rejects(()=>persistTransactionEdit(mockClient({error:{message:'denied'}}).client,current,{amount:50},today),/denied/)
})
test('admin add flow reports persistence failures without creating optimistic entries; borrower writes fail closed',async()=>{
  const source=readFileSync('src/context/AppContext.jsx','utf8'),start=source.indexOf('  const createTransaction = useCallback('),end=source.indexOf('  // Commit only the changed columns',start)
  let state=[],logs=0
  const run=async(role,result)=>{
    const query={insert(){return this},select(){return this},single:async()=>result}
    const context={useCallback:fn=>fn,session:{user:{role}},users:borrowers,loans:[],transactions:[],archivedTransactions:[],isLive:true,toISODate:()=>today,prepareManualTransaction,toDbTransaction:row=>row,mapTransaction:row=>row,supabase:{from:()=>query},setTransactions:fn=>{state=fn(state)},log:()=>logs++,actor:'QA'}
    vm.runInNewContext(source.slice(start,end)+'\nglobalThis.run=createTransaction;',context)
    return context.run(entry)
  }
  assert.match((await run('user',{})).error,/Only the lender/);assert.equal(state.length,0)
  assert.equal((await run('admin',{error:{message:'connection failed'}})).error,'connection failed');assert.equal(state.length,0);assert.equal(logs,0)
  assert.equal((await run('admin',{data:entry,error:null})).error,null);assert.equal(state.length,1);assert.equal(logs,1)
})
test('desktop table retains one Status dropdown column and removes the duplicate Action column',()=>{
  const source=readFileSync('src/pages/admin/Transactions.jsx','utf8')
  assert.doesNotMatch(source,/>Action<\/th>/);assert.match(source,/<TransactionStatusCell transaction=\{t\}/)
  assert.match(source,/<TransactionAmountCell transaction=\{t\}/);assert.match(source,/<TransactionTypeCell transaction=\{t\}/)
})
