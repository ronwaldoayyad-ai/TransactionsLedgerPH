import test from 'node:test'
import assert from 'node:assert/strict'
import {paymentTimestamp} from '../../src/lib/paymentTimestamp.js'
test('new receipts use the server timestamp rather than midnight of the legacy date',()=>{
 assert.equal(paymentTimestamp({submitted_at:'2026-10-17',submitted_at_exact:'2026-10-17T14:00:00Z'}),'2026-10-17T14:00:00Z')
})
test('historical dates stay unchanged when an exact time was never recorded',()=>{
 assert.equal(paymentTimestamp({submitted_at:'2026-10-16',submitted_at_exact:null}),'2026-10-16')
})
