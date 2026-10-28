import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {fetchLedgerSnapshot} from '../../src/lib/ledgerRealtime.js'

function fixture(failure){
 const calls=[]
 const client={from(table){
  const call={table,order:[]};calls.push(call)
  return {select(fields){call.fields=fields;return this},order(field){call.order.push(field);return this},async range(){return table===failure?{error:{message:'Offline'}}:{data:[{table}]}}}
 }}
 return {client,calls,readAll:build=>build().range(0,999)}
}
test('background ledger refresh reads all financial views with stable paging and no storage calls',async()=>{
 const f=fixture(),rows=await fetchLedgerSnapshot(f.client,f.readAll)
 assert.deepEqual(Object.keys(rows),['profiles','loans','transactions','payments','payment_logs','payment_postings','payment_breakdown_visibility'])
 assert.ok(f.calls.every(call=>call.order.length===2||call.table==='payment_breakdown_visibility'))
 assert.match(f.calls.find(call=>call.table==='payment_postings').fields,/allocation_rows:payment_allocations/)
 assert.deepEqual(rows.transactions,[{table:'transactions'}])
})
test('a failed financial read rejects the whole background snapshot',async()=>{
 const f=fixture('transactions');await assert.rejects(fetchLedgerSnapshot(f.client,f.readAll),/Live transactions.*Offline/)
})
test('live ledger refresh preserves page state and auth ownership and propagates hidden breakdowns',()=>{
 const app=fs.readFileSync('src/context/AppContext.jsx','utf8'),frame=fs.readFileSync('src/components/VersionedBorrower.jsx','utf8')
 assert.match(app,/table:'ledger_change_signals'/);assert.match(app,/owner!==authenticatedOwner.current\|\|generation!==ledgerGeneration.current/)
 const refresh=app.slice(app.indexOf('const refreshLedger='),app.indexOf('// Manual re-sync'))
 assert.doesNotMatch(refresh,/clearPageStore|setRefreshing|createSignedUrls/)
 assert.match(frame,/app.hiddenPaymentBreakdowns.map/)
})
