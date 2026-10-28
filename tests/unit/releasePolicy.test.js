import test from 'node:test'
import assert from 'node:assert/strict'
import { borrowerRelease } from '../../src/lib/releasePolicy.js'

test('flag off always resolves Classic, even with a cached New assignment', () => {
  assert.deepEqual(borrowerRelease(false, 'a', {ownerId:'a',interface:'new',ready:true}), {interface:'classic',ready:true})
})
test('only a resolved assignment for the current account permits New', () => {
  assert.deepEqual(borrowerRelease(true, 'b', {ownerId:'a',interface:'new',ready:true}), {interface:'classic',ready:false})
  assert.equal(borrowerRelease(true, 'b', {ownerId:'b',interface:'new',ready:true}).interface, 'new')
})
test('missing or malformed assignments fail closed', () => {
  assert.equal(borrowerRelease(true, 'b', null).interface, 'classic')
  assert.equal(borrowerRelease(true, 'b', {ownerId:'b',interface:'other',ready:true}).interface, 'classic')
})
