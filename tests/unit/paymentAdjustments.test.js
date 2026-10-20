import test from 'node:test'
import assert from 'node:assert/strict'
import * as model from '../../src/lib/paymentReadModel.js'
const due={id:'d',userId:'u',dueDate:'2026-11-19',description:'Item'}
const posting={id:'p',user_id:'u',cash_amount:'100',credit_added:'0',credit_used:'0',allocated_amount:'100',effective_date:'2026-10-19',allocation_rows:[{user_id:'u',transaction_id:'d',amount:'100',before_balance:'500'}]}
const build=(postings=[posting],transactions=[due],ownerId='u')=>model.buildPaymentAdjustments({ownerId,postings,transactions})
test('partial payment is one negative display entry and never mutates the ledger',()=>{
 const before=JSON.stringify(posting),[r]=build()
 assert.equal(r.amount,-100);assert.equal(r.kind,'partial');assert.deepEqual(r.dueDates,['2026-11-19']);assert.equal(r.allocations[0].afterBalance,400)
 assert.equal(JSON.stringify(posting),before)
})
test('overpayment displays only excess, exact settlements and credit-only applications add no adjustment',()=>{
 assert.equal(build([{...posting,cash_amount:'600',credit_added:'100',allocated_amount:'500'}])[0].amount,-100)
 assert.deepEqual(build([{...posting,allocation_rows:[{...posting.allocation_rows[0],before_balance:'100'}]}]),[])
 assert.deepEqual(build([{...posting,cash_amount:'0',credit_used:'100'}]),[])
})
test('several due dates stay combined, owner boundaries and duplicate ids are respected',()=>{
 const p={...posting,allocation_rows:[...posting.allocation_rows,{user_id:'u',transaction_id:'d2',amount:'1',before_balance:'5'},{user_id:'other',transaction_id:'foreign',amount:'1',before_balance:'5'}]}
 const rows=build([p,p,{...p,id:'foreign',user_id:'other'}],[due,{...due,id:'d2',dueDate:'2026-12-19'}])
 assert.equal(rows.length,1);assert.equal(rows[0].allocations.length,2);assert.deepEqual(rows[0].dueDates,['2026-11-19','2026-12-19']);assert.deepEqual(build([],[],null),[])
})
test('reversed payments remain auditable and reversals do not create new negative payments',()=>{
 const rows=build([posting,{...posting,id:'undo',reversal_of:'p'}])
 assert.equal(rows.length,1);assert.equal(rows[0].status,'reversed')
 assert.equal(build([posting],[])[0].dueDates.length,0)
})

test('deleted breakdowns are filtered without changing postings, credits or allocations',()=>{
 const original=JSON.stringify(posting)
 assert.deepEqual(model.buildPaymentAdjustments({ownerId:'u',postings:[posting],transactions:[due],hiddenPostingIds:['p']}),[])
 assert.equal(build().length,1);assert.equal(JSON.stringify(posting),original)
 const credit={...posting,credit_used:'10'}
 assert.equal(model.buildCreditActivity({ownerId:'u',postings:[credit],transactions:[due],hiddenPostingIds:['p']}).length,1)
})
