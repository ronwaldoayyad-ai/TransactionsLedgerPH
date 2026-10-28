import test from 'node:test'
import assert from 'node:assert/strict'
import * as fees from '../../src/lib/feeAssessment.js'
const row=(id,amount=1000,patch={})=>({id,userId:'borrower',amount,originalAmount:amount,paidAmount:0,status:'unpaid',dueDate:'2026-10-14',...patch})
test('filter matches owner and exact due date, keeps unpaid prior fees and remaining positive balances',()=>{
 const rows=[row('a',1000,{paidAmount:400,amount:600}),row('fee',1500,{feeKind:'late_fee'}),row('paid',10,{status:'paid'}),row('negative',-20),row('other',100,{userId:'other'}),row('date',50,{dueDate:'2026-10-15'}),row('archived',20,{archivedAt:'2026-10-01'})]
 const found=fees.eligibleFeeTransactions(rows,'borrower','2026-10-14');assert.deepEqual(found.map(r=>r.id),['a','fee']);assert.equal(found[0].remainingCents,60000)
})
test('default fee calculation matches the reference: 30000 at 3% plus 1500',()=>{
 const result=fees.calculateFeeAssessment({rows:[row('a',25000),row('b',5000)]});assert.equal(result.baseCents,3000000);assert.equal(result.financeCents,90000);assert.equal(result.lateCents,150000);assert.equal(result.totalCents,240000)
})
test('switches are independent and disabled fee inputs do not affect totals',()=>{
 assert.equal(fees.calculateFeeAssessment({rows:[row('a')],financeEnabled:false,rate:'',lateAmount:'500'}).totalCents,50000)
 assert.equal(fees.calculateFeeAssessment({rows:[row('a')],lateEnabled:false,lateAmount:''}).totalCents,3000)
 assert.equal(fees.calculateFeeAssessment({rows:[row('a')],financeEnabled:false,lateEnabled:false}).totalCents,0)
})
test('rate precision and half-cent rounding use exact decimal arithmetic',()=>{
 assert.equal(fees.calculateFeeAssessment({rows:[row('a',0.5)],lateEnabled:false,rate:'1'}).financeCents,1)
 assert.equal(fees.calculateFeeAssessment({rows:[row('a',9999999999.99)],lateEnabled:false,rate:'0.01'}).financeCents,100000000)
 for(const rate of ['-1','abc','3.001','101'])assert.throws(()=>fees.calculateFeeAssessment({rows:[row('a')],rate}))
 assert.throws(()=>fees.calculateFeeAssessment({rows:[row('a')],lateAmount:'-1'}))
})
test('preview descriptions use the actual configured rate, source due date and base',()=>{
 const result=fees.calculateFeeAssessment({rows:[row('a',30000)],rate:'3.25'}),descriptions=fees.feeDescriptions(result,'2026-10-14')
 assert.equal(descriptions.finance,'3.25% Finance Charge for Oct 14, 2026 (₱30,000.00)');assert.equal(descriptions.late,'Late Payment fee for Oct 14, 2026')
 assert.throws(()=>fees.feeDescriptions(result,'2026-02-30'));assert.equal(fees.assessmentMonth('2026-10-19'),'2026-10-01')
})
test('empty selection has no charges and duplicate selected rows are rejected',()=>{
 assert.equal(fees.calculateFeeAssessment({rows:[]}).totalCents,0);assert.throws(()=>fees.calculateFeeAssessment({rows:[row('a'),row('a')]}));assert.throws(()=>fees.calculateFeeAssessment({rows:[row('a',9999999999.99),row('b')]}))
})
test('review never reactivates when edited values return to a previously confirmed fingerprint',()=>{
 const initial={fingerprint:'A',confirmed:true};assert.equal(fees.feeReviewTransition(initial,'A'),initial)
 const changed=fees.feeReviewTransition(initial,'B');assert.equal(changed.confirmed,false)
 assert.equal(fees.feeReviewTransition(changed,'A').confirmed,false)
})
