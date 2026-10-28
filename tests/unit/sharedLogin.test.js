import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAuthentication } from '../../src/lib/authRequest.js'
import { sessionDestination } from '../../src/lib/sessionDestination.js'

test('Only the trusted profile role chooses the destination', () => {
  assert.equal(sessionDestination(null), '/login')
  assert.equal(sessionDestination({ user: { role: 'admin' } }), '/admin')
  assert.equal(sessionDestination({ user: { role: 'user' } }), '/portal')
  assert.equal(sessionDestination({ user: { role: 'user' }, needsPasswordSetup: true }), '/set-password')
  assert.equal(sessionDestination({ user: { role: 'unrecognized' } }), '/login')
})
test('A stalled authentication request aborts and rejects with retry feedback', async () => {
  let aborted = false
  const hold = (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(init.signal.reason) })
  })
  await assert.rejects(fetchAuthentication('http://localhost/auth/v1/token', { method: 'POST' }, hold, 15), error => error.name === 'AbortError' && /timed out.*try again/.test(error.message))
  assert.equal(aborted, true)
})
test('Successful requests retain options and upstream cancellation still works', async () => {
  const headers = { 'Content-Type': 'application/json' }
  const response = await fetchAuthentication('http://localhost/auth/v1/token', { method: 'POST', headers }, async (_url, init) => {
    assert.equal(init.method, 'POST'); assert.equal(init.headers, headers); return 'authenticated'
  }, 100)
  assert.equal(response, 'authenticated')
  const caller = new AbortController()
  const request = fetchAuthentication('http://localhost/auth/v1/token', { signal: caller.signal }, (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))), 100)
  caller.abort(new Error('Caller cancelled'))
  await assert.rejects(request, /Caller cancelled/)
})
test('The deadline also covers a stalled response body and a non-cooperating fetch', async () => {
  await assert.rejects(fetchAuthentication('http://localhost/auth/v1/token', {}, () => new Promise(() => {}), 15), /timed out/)
  await assert.rejects(fetchAuthentication('http://localhost/auth/v1/token', {}, async (_url, init) => new Response(new ReadableStream({
    start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason)) },
  })), 15), /timed out/)
})
