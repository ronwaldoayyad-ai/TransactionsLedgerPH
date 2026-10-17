import { test } from 'node:test'
import assert from 'node:assert/strict'
import { refreshRecords } from '../../src/lib/recordRefresh.js'

test('Explicit refresh waits for all participating providers and retains a failed provider result', async () => {
  const target = new EventTarget()
  const original = globalThis.window
  globalThis.window = target
  let primaryCalls = 0
  let release
  const held = new Promise(resolve => { release = resolve })
  target.addEventListener('loanledger-refresh-records', event => {
    event.detail.waitUntil(held)
    event.detail.waitUntil(Promise.reject(Error('Simulated provider failure')))
  })
  try {
    let finished = false
    const result = refreshRecords(async () => { primaryCalls++ }).then(value => { finished = true; return value })
    await Promise.resolve()
    assert.equal(primaryCalls, 1)
    assert.equal(finished, false)
    release('Loaded provider')
    assert.deepEqual((await result).map(x => x.status), ['fulfilled', 'fulfilled', 'rejected'])
    assert.equal(finished, true)
  } finally { globalThis.window = original }
})

test('No providers is a valid refresh and does not schedule another read', async () => {
  const original = globalThis.window
  globalThis.window = new EventTarget()
  try {
    let calls = 0
    const result = await refreshRecords(async () => { calls++; return 'Loaded' })
    assert.equal(calls, 1)
    assert.deepEqual(result, [{ status: 'fulfilled', value: 'Loaded' }])
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(calls, 1)
  } finally { globalThis.window = original }
})
