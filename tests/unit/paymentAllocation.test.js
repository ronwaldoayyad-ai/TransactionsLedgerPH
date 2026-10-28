import test from 'node:test'
import assert from 'node:assert/strict'
import {reviewPaymentAllocation,outstandingCents} from '../../src/lib/paymentAllocation.js'

const due=(id,amount='1000.00',paidAmount='0.00')=>({id,userId:'borrower',amount,paidAmount,status:'unpaid',archivedAt:null})
const review=patch=>reviewPaymentAllocation({borrowerId:'borrower',cashAmount:'1000.00',availableCredit:'0',creditUsed:'0',dues:[due('a')],allocations:[{id:'a',amount:'1000.00'}],...patch})

test('exact payment settles the reviewed due with no new credit',()=>{
 const r=review()
 assert.equal(r.allocatedCents,100000)
 assert.equal(r.creditAddedCents,0)
 assert.equal(r.creditAfterCents,0)
 assert.equal(r.allocations[0].remainingCents,0)
})
test('partial payment preserves the original due and its outstanding remainder',()=>{
 const d=due('a','1000','250')
 assert.equal(outstandingCents(d),75000)
 const r=review({cashAmount:'400',dues:[d],allocations:[{id:'a',amount:'400'}]})
 assert.equal(r.allocations[0].remainingCents,35000)
 assert.equal(d.amount,'1000')
 assert.equal(d.paidAmount,'250')
})
test('excess funds are retained as credit separately from outstanding dues',()=>{
 const r=review({cashAmount:'1200',availableCredit:'50'})
 assert.equal(r.creditAddedCents,20000)
 assert.equal(r.creditAfterCents,25000)
})
test('prior credit is used only by explicit allocation and supports credit-only posting',()=>{
 const r=review({cashAmount:'700',availableCredit:'500',creditUsed:'300'})
 assert.equal(r.creditAfterCents,20000)
 const c=review({cashAmount:'0',availableCredit:'1500',creditUsed:'1000'})
 assert.equal(c.creditAfterCents,50000)
 assert.equal(c.cashCents,0)
})
test('allocation spans multiple dues and preserves every centavo',()=>{
 const r=review({cashAmount:'0.30',dues:[due('a','0.10'),due('b','0.20')],allocations:[{id:'a',amount:'0.10'},{id:'b',amount:'0.20'}]})
 assert.equal(r.allocatedCents,30)
 assert.equal(r.cashCents+r.creditUsedCents,r.allocatedCents+r.creditAddedCents)
 assert.deepEqual(r.allocations.map(x=>x.remainingCents),[0,0])
})
test('unallocated cash may be explicitly retained entirely as credit',()=>{
 const r=review({allocations:[]})
 assert.equal(r.creditAddedCents,100000)
 assert.equal(r.allocatedCents,0)
})
test('duplicate, foreign, unavailable and overpaid dues are rejected',()=>{
 for(const patch of [
  {allocations:[{id:'a',amount:'500'},{id:'a',amount:'500'}]},
  {dues:[{...due('a'),userId:'other'}]},
  {dues:[{...due('a'),archivedAt:'2026-10-18'}]},
  {dues:[{...due('a'),status:'paid'}]},
  {dues:[{...due('a'),status:'cancelled'}]},
  {dues:[{...due('a'),status:'refunded'}]},
  {allocations:[{id:'missing',amount:'1000'}]},
  {dues:[due('a','1000','1')]},
 ])assert.throws(()=>review(patch),/due|allocation|borrower|available/i)
})
test('negative, nonfinite, sub-cent and oversized money is rejected',()=>{
 for(const value of ['-1','1.001',NaN,Infinity,'1e4','10000000000.00','',null])assert.throws(()=>review({cashAmount:value}),/amount|money|cent|limit/i)
 assert.throws(()=>review({allocations:[{id:'a',amount:'0'}]}),/positive|allocation|amount/i)
})
test('credit cannot be overspent, silently used or recycled into new credit',()=>{
 assert.throws(()=>review({cashAmount:'700',creditUsed:'300',availableCredit:'299.99'}),/credit/i)
 assert.throws(()=>review({cashAmount:'700',creditUsed:'0',availableCredit:'500'}),/credit|fund/i)
 assert.throws(()=>review({cashAmount:'1200',creditUsed:'50',availableCredit:'500'}),/credit/i)
 assert.throws(()=>review({cashAmount:'0',allocations:[]}),/positive|fund|amount/i)
})
test('historical paid rows remain settled and paid amount cannot exceed original amount',()=>{
 assert.equal(outstandingCents({...due('a'),status:'paid'}),0)
 assert.equal(outstandingCents({...due('a'),status:'cancelled'}),0)
 assert.throws(()=>outstandingCents(due('a','1000','1000.01')),/paid|amount|due/i)
})
