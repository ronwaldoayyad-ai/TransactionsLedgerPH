import test from 'node:test'
import assert from 'node:assert/strict'
import * as activity from '../../src/lib/paymentReadModel.js'

const ownerId='borrower',due={id:'due',userId:ownerId,description:'Purchased Item',dueDate:'2026-11-19',amount:47790.04,originalAmount:50000,paidAmount:2209.96}
const posting={id:'credit-1',user_id:ownerId,cash_amount:'0',credit_used:'2209.96',allocated_amount:'2209.96',effective_date:'2026-10-18',created_at:'2026-10-18T15:15:51Z',note:'Reviewed',allocation_rows:[{transaction_id:'due',user_id:ownerId,amount:'2209.96',before_balance:'50000'}]}
const build=patch=>activity.buildCreditActivity({ownerId,postings:[posting],transactions:[due],logs:[{sourcePostingId:'credit-1',userId:ownerId,reference:'CREDIT-1'}],...patch})

test('credit applications expose exact saved allocation and remaining balance without changing dues',()=>{
 const before=JSON.stringify(due),[row]=build()
 assert.equal(row.creditUsed,2209.96);assert.equal(row.cashIncluded,0);assert.equal(row.reference,'CREDIT-1');assert.equal(row.status,'applied')
 assert.deepEqual(row.allocations,[{description:'Purchased Item',dueDate:'2026-11-19',amount:2209.96,beforeBalance:50000,afterBalance:47790.04}])
 assert.equal(JSON.stringify(due),before)
})

test('later changes to a due do not rewrite the historical credit application balance',()=>{
 assert.equal(build({transactions:[{...due,amount:1,paidAmount:49999}]})[0].allocations[0].afterBalance,47790.04)
})

test('foreign postings, allocation details and duplicate posting ids never leak into borrower activity',()=>{
 const rows=build({postings:[posting,posting,{...posting,id:'foreign',user_id:'other'}]});assert.equal(rows.length,1)
 const row=build({transactions:[{...due,userId:'other'}],postings:[{...posting,allocation_rows:[...posting.allocation_rows,{transaction_id:'foreign',user_id:'other',amount:'1',before_balance:'5'}]}]})[0]
 assert.equal(row.allocations.length,1);assert.equal(row.allocations[0].description,'Previously recorded due')
 assert.deepEqual(build({ownerId:null}),[])
})

test('cash payments creating credit are not mislabelled as an application of prior credit',()=>{
 assert.deepEqual(build({postings:[{...posting,cash_amount:'3209.96',credit_used:'0',credit_added:'2209.96'}]}),[])
 const row=build({postings:[{...posting,cash_amount:'500',allocated_amount:'2709.96'}]})[0]
 assert.equal(row.creditUsed,2209.96);assert.equal(row.cashIncluded,500);assert.equal(row.totalApplied,2709.96)
})

test('reversed applications and their reversal retain distinct statuses and correct restored balances',()=>{
 const reverse={...posting,id:'reversal',reversal_of:posting.id,created_at:'2026-10-19T01:00:00Z',effective_date:'2026-10-19'}
 const rows=build({postings:[posting,reverse]})
 assert.equal(rows[0].status,'reversal');assert.equal(rows[0].allocations[0].beforeBalance,47790.04);assert.equal(rows[0].allocations[0].afterBalance,50000)
 assert.equal(rows[1].status,'reversed')
})

test('allocation details remain available when a due leaves the active transaction list',()=>{
 const row=build({transactions:[]})[0];assert.equal(row.allocations[0].description,'Previously recorded due');assert.equal(row.allocations[0].afterBalance,47790.04)
})
