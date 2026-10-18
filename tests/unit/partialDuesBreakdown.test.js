import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDuesBreakdown} from '../../src/lib/duesBreakdown.js'
const row={id:'due',loanId:'loan',type:'Installment',amount:500,originalAmount:1000,paidAmount:500,status:'unpaid',dueDate:'2026-10-18'}
test('peso progress includes the paid portion of an installment while counts require full settlement',()=>{
 const result=buildDuesBreakdown([row],'2026-10-18')
 assert.equal(result.totalAmount,1000);assert.equal(result.paidAmount,500);assert.equal(result.remainingAmount,500);assert.equal(result.paidPctAmount,50)
 assert.equal(result.totalCount,1);assert.equal(result.paidCount,0);assert.equal(result.paidPctCount,0);assert.equal(result.nextPayment.amount,500)
})
test('reversal, legacy settlement and cancelled items keep their existing accounting meaning',()=>{
 assert.equal(buildDuesBreakdown([{...row,amount:1000,paidAmount:0}],'2026-10-18').paidPctAmount,0)
 assert.equal(buildDuesBreakdown([{...row,amount:1000,paidAmount:0,status:'paid',datePaid:'2026-10-18'}],'2026-10-18').paidPctAmount,100)
 assert.equal(buildDuesBreakdown([{...row,status:'cancelled'}],'2026-10-18').totalAmount,0)
})
