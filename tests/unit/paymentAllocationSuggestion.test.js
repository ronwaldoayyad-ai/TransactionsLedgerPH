import test from 'node:test'
import assert from 'node:assert/strict'
import * as allocation from '../../src/lib/paymentAllocation.js'

const due={id:'due-a',userId:'borrower',amount:'50000.00',status:'unpaid'}
const suggest=patch=>allocation.suggestAllocationAmount({due,amounts:{},cashAmount:'0',availableCredit:'2209.96',useCredit:true,...patch})

test('selecting a large due suggests only the available credit, preserving centavos',()=>{
 assert.equal(suggest(),'2209.96')
 const review=allocation.reviewPaymentAllocation({borrowerId:'borrower',cashAmount:'0',availableCredit:'2209.96',creditUsed:suggest(),dues:[due],allocations:[{id:due.id,amount:suggest()}]})
 assert.equal(review.creditAfterCents,0)
 assert.equal(review.allocations[0].remainingCents,4779004)
})

test('existing selections reduce the funds available for the next due',()=>{
 assert.equal(suggest({amounts:{other:'1500.00'}}),'709.96')
 assert.equal(suggest({amounts:{other:'2209.96'}}),'0.00')
 assert.equal(suggest({amounts:{other:'3000.00'}}),'0.00')
})

test('selecting a due does not silently use prior credit without opting in',()=>{
 assert.equal(suggest({cashAmount:'500',useCredit:false}),'500.00')
 assert.equal(suggest({cashAmount:'500',useCredit:true}),'2709.96')
 assert.equal(suggest({cashAmount:'0',useCredit:false}),'0.00')
})

test('the suggestion never exceeds the remaining amount of a partially paid due',()=>{
 assert.equal(suggest({due:{...due,originalAmount:'50000',paidAmount:'49500',amount:'500'}}),'500.00')
 assert.equal(suggest({due:{...due,status:'paid'}}),'0.00')
 assert.equal(suggest({amounts:{[due.id]:'1000',other:'1000'}}),'1209.96')
})

test('multiple small amounts consume funds exactly without floating-point drift',()=>{
 assert.equal(suggest({cashAmount:'0.30',availableCredit:'0',amounts:{one:'0.10',two:'0.10'}}),'0.10')
})

test('invalid existing amounts are corrected before suggesting another allocation',()=>{
 for(const value of ['', '1.001', '-1', 'NaN'])assert.throws(()=>suggest({amounts:{other:value}}),/amount|cent|money/i)
})
