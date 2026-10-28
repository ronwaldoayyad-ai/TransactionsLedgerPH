import {test} from 'node:test'
import assert from 'node:assert/strict'
import {postingFigures} from '../../src/lib/paymentCollections.js'
import {buildCreditActivity} from '../../src/lib/paymentReadModel.js'
test('reversal figures separate retained allocations and reclaimed correction credit',()=>{
 const figures=postingFigures({reversal_of:'original',cash_amount:400,allocated_amount:400,credit_used:0,credit_added:0,correction_credit_reclaimed:300})
 assert.deepEqual(figures,{cash:-400,allocated:-100,creditChange:-300})
 assert.equal(figures.cash,figures.allocated+figures.creditChange)
})
test('credit reversal activity reports retained allocation total after corrections',()=>{
 const rows=buildCreditActivity({ownerId:'borrower',postings:[{id:'reversal',user_id:'borrower',reversal_of:'original',cash_amount:0,credit_used:400,credit_added:0,allocated_amount:400,correction_credit_reclaimed:300}]})
 assert.equal(rows[0].totalApplied,100)
})
