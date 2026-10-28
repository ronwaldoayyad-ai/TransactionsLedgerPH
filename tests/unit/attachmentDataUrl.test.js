import test from 'node:test'
import assert from 'node:assert/strict'
import { attachmentDataUrlBlob } from '../../src/lib/attachmentDataUrl.js'

test('decodes file bytes and MIME locally with network access unavailable', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = () => { throw Error('CSP prohibits data: requests') }
  try {
    const blob = attachmentDataUrlBlob('data:application/pdf;base64,JVBERi0xLjcKAP8=')
    assert.equal(blob.type, 'application/pdf')
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [37,80,68,70,45,49,46,55,10,0,255])
  } finally { globalThis.fetch = previous }
})

test('rejects invalid encodings, remote URLs, empty files and oversized input', () => {
  for (const value of ['https://example.com/file', 'data:text/plain,hello', 'data:image/png;base64,', 'data:image/png;base64,!!!!', 'data:image/png;base64,YQ=', 'data:image/png;base64,Y===']) assert.throws(() => attachmentDataUrlBlob(value))
  assert.throws(() => attachmentDataUrlBlob('data:image/png;base64,YWJjZA==', 3))
  assert.equal(attachmentDataUrlBlob('data:image/png;base64,YWJj', 3).size, 3)
  assert.throws(() => attachmentDataUrlBlob('data:image/png;base64,YQ==', 0))
})
