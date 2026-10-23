import test from 'node:test'
import assert from 'node:assert/strict'
import {exampleRows,exampleDates,exampleAsOf} from '../fixtures/combinedFeeExample.js'
import {eligibleCombinedFeeTransactions,pendingCombinedFeeDates,calculateCombinedFeeAssessment,combinedFeeDescriptions,combinedFeeSelections,feeLedgerBalanceCents,signedFeeCents} from '../../src/lib/feeAssessment.js'
test('screenshot net base includes all 13 actual entries, one late fee and finance on net total',()=>{
 const selected=eligibleCombinedFeeTransactions(exampleRows,'example-borrower',exampleAsOf)
 const s=calculateCombinedFeeAssessment({rows:selected})
 assert.equal(selected.length,13);assert.equal(s.baseCents,7127003);assert.equal(s.adjustmentCents,-8000000)
 assert.equal(s.financeCents,213810);assert.equal(s.lateCents,150000);assert.equal(s.totalCents,363810)
 assert.deepEqual(pendingCombinedFeeDates(exampleRows,'example-borrower',exampleAsOf),exampleDates)
 assert.deepEqual(combinedFeeDescriptions(s,exampleAsOf),{finance:'3% Finance Charge as of Nov 10, 2026 (₱71,270.03)',late:'Late Payment Fee as of Nov 10, 2026'})
})
test('cutoff, selected dates, owner, archive and status exclusions apply to adjustments as well',()=>{
 const rows=[...exampleRows,...['paid','refunded','cancelled'].map(status=>({...exampleRows[0],id:status,status})),{...exampleRows[0],id:'future',dueDate:'2026-12-10'},{...exampleRows[3],id:'archived',archivedAt:'2026-10-01'},{...exampleRows[0],id:'other',userId:'other'}]
 const selected=eligibleCombinedFeeTransactions(rows,'example-borrower',exampleAsOf,['2026-07-10'])
 assert.equal(selected.length,4);assert.equal(calculateCombinedFeeAssessment({rows:selected}).baseCents,6216296)
 assert.equal(eligibleCombinedFeeTransactions(rows,'example-borrower',exampleAsOf,[]).length,0)
 assert.throws(()=>eligibleCombinedFeeTransactions(rows,'example-borrower','2026-02-30'))
})
test('remaining positive balances use allocations exactly once; negative ledger amounts remain signed',()=>{
 const partial={...exampleRows[0],originalAmount:'1000',paidAmount:'400',amount:'600'}
 assert.equal(feeLedgerBalanceCents(partial),60000);assert.equal(signedFeeCents('-0.01'),-1)
 const rows=[partial,{...exampleRows[3],amount:'-100',originalAmount:'-100'}]
 assert.equal(calculateCombinedFeeAssessment({rows}).baseCents,50000)
 assert.equal(combinedFeeSelections(rows)[1].expectedBalance,'-100.00')
 assert.equal(combinedFeeSelections(rows)[0].expectedAmount,'1000.00')
 assert.equal(combinedFeeSelections(rows)[0].expectedAppliedAmount,'400.00')
 assert.throws(()=>feeLedgerBalanceCents({...rows[1],paidAmount:1}))
})
test('empty or nonpositive net selections cannot create fees, duplicate rows and invalid inputs reject',()=>{
 for(const rows of [[],[exampleRows[3]]]){const s=calculateCombinedFeeAssessment({rows});assert.equal(s.totalCents,0)}
 assert.throws(()=>calculateCombinedFeeAssessment({rows:[exampleRows[0],exampleRows[0]]}))
 assert.throws(()=>calculateCombinedFeeAssessment({rows:exampleRows,rate:'3.001'}))
 assert.throws(()=>calculateCombinedFeeAssessment({rows:exampleRows,lateAmount:'-1'}))
 assert.equal(calculateCombinedFeeAssessment({rows:exampleRows,lateEnabled:false}).totalCents,213810)
 assert.equal(calculateCombinedFeeAssessment({rows:exampleRows,financeEnabled:false}).totalCents,150000)
})
