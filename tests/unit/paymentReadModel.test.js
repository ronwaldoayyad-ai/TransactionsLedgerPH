import test from 'node:test'
import assert from 'node:assert/strict'
import {transactionAmounts} from '../../src/lib/paymentReadModel.js'
import {outstandingCents,reviewPaymentAllocation} from '../../src/lib/paymentAllocation.js'
test('partial-payment reader preserves original amount and exposes only the open remainder to existing balance screens',()=>{
 const row=transactionAmounts({amount:'1000.00',amount_applied:'400.00',status:'unpaid'})
 assert.deepEqual(row,{originalAmount:1000,paidAmount:400,remainingAmount:600,amount:600})
 const due={...row,id:'a',userId:'u',status:'unpaid'}
 assert.equal(outstandingCents(due),60000)
 assert.equal(reviewPaymentAllocation({borrowerId:'u',cashAmount:'600',availableCredit:'0',creditUsed:'0',dues:[due],allocations:[{id:'a',amount:'600'}]}).allocations[0].expectedBalance,'600.00')
})
test('historical rows without allocations keep their original display and balance',()=>{
 assert.deepEqual(transactionAmounts({amount:1000,status:'unpaid'}),{originalAmount:1000,paidAmount:0,remainingAmount:1000,amount:1000})
 for(const status of ['paid','refunded','cancelled'])assert.deepEqual(transactionAmounts({amount:1000,status}),{originalAmount:1000,paidAmount:0,remainingAmount:0,amount:1000})
})
test('fully paid and past-due rows show consistent original and remaining amounts',()=>{
 assert.deepEqual(transactionAmounts({amount:'1000',amount_applied:'1000',status:'paid'}),{originalAmount:1000,paidAmount:1000,remainingAmount:0,amount:1000})
 assert.equal(transactionAmounts({amount:'1000',amount_applied:'0.01',status:'past_due'}).remainingAmount,999.99)
})
