import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {presentationFeeKind} from '../../src/lib/feePresentation.js'

test('new and legacy fee titles share presentation without changing records',()=>{
  for(const description of ['3% Finance Charge - September 25, 2026 (25,091.64)','3% Finance Charge as of Oct 10, 2026',' Finance Charge for Oct 10, 2026'])assert.equal(presentationFeeKind({description}),'finance')
  for(const description of ['Late Payment Fee - September 25, 2026','LATE PAYMENT FEE as of Oct 10, 2026','Late fee for Nov 10'])assert.equal(presentationFeeKind({description}),'late')
  const original={description:'Renamed entry',feeKind:'late',amount:1500};assert.equal(presentationFeeKind(original),'late');assert.equal(original.amount,1500)
  for(const description of ['Refund of late payment fee','Equipment with finance charge included','Cash Loan','Late payment reminder'])assert.equal(presentationFeeKind({description}),null)
})

test('recent payment sorting uses raw submission timestamps, stable ties and missing dates last',()=>{
  const context=vm.createContext({Date});vm.runInContext(readFileSync('public/v41224-payment-sort.js','utf8'),context)
  const rows=[{id:'a',submittedAt:'2026-10-23T00:00:00Z'},{id:'b',submittedAt:'2026-10-24T01:00:00+08:00'},{id:'c',paidDate:'Sep 10, 2026'},{id:'missing'},{id:'d',submittedAt:'2026-10-24T00:00:00Z'},{id:'e',submittedAt:'invalid',paidDate:'Oct 1, 2026'}]
  const original=JSON.stringify(rows),ids=direction=>Array.from(context.sortRecentPayments(rows,direction),r=>r.id)
  assert.deepEqual(ids(),['d','b','a','e','c','missing']);assert.deepEqual(ids('oldest'),['c','e','a','b','d','missing']);assert.equal(JSON.stringify(rows),original)
  assert.deepEqual(Array.from(context.sortRecentPayments([{id:'z',submittedAt:'2026-10-24'},{id:'a',submittedAt:'2026-10-24'}]),r=>r.id),['a','z'])
})

test('payment list sorts before status filtering and truncation and preserves its raw date',()=>{
  const source=readFileSync('public/borrower-v4.12.24.html','utf8'),adapter=readFileSync('public/v41224-staging-adapter.js','utf8')
  assert.match(source,/list=sortRecentPayments\(list\);const filtered=/);assert.match(source,/id="recentPaymentSort"/)
  assert.ok(source.indexOf('/v41224-payment-sort.js')<source.indexOf('/v41224-payment-experience.js'))
  assert.match(adapter,/submittedAt:p.submittedAt,paidDate:/)
  for(const block of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(block[1])
})

test('borrower preview return controls stay outside the full-screen frame and use real admin state',()=>{
  const source=readFileSync('src/components/VersionedBorrower.jsx','utf8')
  assert.match(source,/app\.isViewingAs && <section aria-label="Borrower preview controls"/)
  assert.match(source,/app\.stopViewAs\(\);navigate\('\/admin\/users'\)/)
  assert.ok(source.indexOf('Return to Admin view')<source.lastIndexOf('<iframe'))
  assert.match(source,/flex:1,minHeight:0,width:'100%'/)
})
