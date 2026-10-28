import test from 'node:test'
import assert from 'node:assert/strict'
import {paymentTimestamp} from '../../src/lib/paymentTimestamp.js'
import {formatDate} from '../../src/lib/amortization.js'
test('new receipts use the server timestamp rather than midnight of the legacy date',()=>{
 assert.equal(paymentTimestamp({submitted_at:'2026-10-17',submitted_at_exact:'2026-10-17T14:00:00Z'}),'2026-10-17T14:00:00Z')
})
test('historical dates stay unchanged when an exact time was never recorded',()=>{
 assert.equal(paymentTimestamp({submitted_at:'2026-10-16',submitted_at_exact:null}),'2026-10-16')
})

test('admin payment dates accept exact timestamps and retain Philippine calendar dates',()=>{
 assert.equal(formatDate('2026-10-18T01:59:28.916033+00:00'),'Oct 18, 2026')
 assert.equal(formatDate('2026-10-17T23:59:00Z'),'Oct 18, 2026')
 assert.equal(formatDate('2026-10-16'),'Oct 16, 2026')
 assert.equal(formatDate('not-a-date'),'—')
})
