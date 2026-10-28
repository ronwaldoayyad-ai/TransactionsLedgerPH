// Decode local attachments without making a request to a data: URL. This keeps
// uploads compatible with the production connect-src policy.
export function attachmentDataUrlBlob(value, maxBytes = 5 * 1024 * 1024) {
  if (typeof value !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error('Invalid attachment.')
  const comma = value.indexOf(',')
  const header = value.slice(0, comma)
  if (comma < 0 || !/^data:[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+;base64$/i.test(header)) throw Error('Invalid attachment.')
  const encodedLength = value.length - comma - 1
  if (!encodedLength || encodedLength > 4 * Math.ceil(maxBytes / 3) || encodedLength % 4) throw Error('Attachment exceeds the size limit or is invalid.')
  const encoded = value.slice(comma + 1)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw Error('Invalid attachment encoding.')
  let decoded
  try { decoded = atob(encoded) } catch { throw Error('Invalid attachment encoding.') }
  if (!decoded.length || decoded.length > maxBytes) throw Error('Attachment exceeds the size limit.')
  return new Blob([Uint8Array.from(decoded, character => character.charCodeAt(0))], { type: header.slice(5, -7).toLowerCase() })
}
