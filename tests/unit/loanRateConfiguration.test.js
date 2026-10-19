import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {parseLoanRateDraft,LOAN_RATE_TERMS} from '../../src/lib/loanRateConfiguration.js'
test('rate configuration saves all terms with exact percent-to-decimal conversion',()=>{
 const rows=parseLoanRateDraft({3:'1.2000',6:'1.4500',12:'1.7000',24:'1.9500',36:'2.2000'})
 assert.deepEqual(rows.map(r=>r.term_months),LOAN_RATE_TERMS);assert.deepEqual(rows.map(r=>r.monthly_rate),[0.012,0.0145,0.017,0.0195,0.022])
})
test('missing, negative and invalid rates never become zero-interest defaults',()=>{
 const all=Object.fromEntries(LOAN_RATE_TERMS.map(t=>[t,'1']))
 for(const value of ['',undefined,'-1','NaN','101','1.12345'])assert.throws(()=>parseLoanRateDraft({...all,3:value}),/3 months/)
 assert.equal(parseLoanRateDraft({...all,3:'0'})[0].monthly_rate,0)
})
test('empty-rate UI provides an editor and uses one atomic batch save',()=>{
 const ui=fs.readFileSync('src/pages/admin/LoanRequests.jsx','utf8'),context=fs.readFileSync('src/context/LoanRequestsContext.jsx','utf8')
 assert.doesNotMatch(ui,/rates.length > 0|Rate configuration loads once/);assert.match(ui,/No rates have been configured yet/);assert.match(ui,/result=await onSaveRates\(draft\)/);assert.match(context,/upsert\(rows,\{onConflict:'term_months'\}\)/)
})
