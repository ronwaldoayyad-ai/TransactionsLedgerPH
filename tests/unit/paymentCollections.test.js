import test from 'node:test'
import assert from 'node:assert/strict'
import {collectionEntries} from '../../src/lib/paymentCollections.js'
test('partial payments count as collected cash before an installment is fully paid',()=>{
 const rows=collectionEntries([{id:'due',amount:600,originalAmount:1000,paidAmount:400,status:'unpaid'}],[{id:'post',cash_amount:'400',effective_date:'2026-10-18',reversal_of:null}])
 assert.deepEqual(rows,[{id:'post',amount:400,datePaid:'2026-10-18'}])
})
test('credit-only application does not count as additional cash and reversals subtract the original cash',()=>{
 const rows=collectionEntries([{id:'due',amount:1000,originalAmount:1000,paidAmount:1000,status:'paid',datePaid:'2026-10-18'}],[{id:'cash',cash_amount:'1200',effective_date:'2026-10-18'},{id:'credit',cash_amount:'0',credit_used:'200',effective_date:'2026-10-18'},{id:'reverse',cash_amount:'1200',reversal_of:'cash',effective_date:'2026-10-19'}])
 assert.equal(rows.reduce((sum,r)=>sum+r.amount,0),0);assert.equal(rows.length,2);assert.equal(rows[1].amount,-1200)
})
test('legacy settled transactions are retained without inferring cash from older approved proofs',()=>{
 assert.deepEqual(collectionEntries([{id:'old',amount:2000,status:'paid',datePaid:'2026-09-10'}],[]),[{id:'old',amount:2000,datePaid:'2026-09-10'}])
})
