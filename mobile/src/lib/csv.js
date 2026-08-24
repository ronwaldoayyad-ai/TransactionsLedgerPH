// Minimal CSV utilities for the Overall Transactions import feature.

// Parses CSV text (handles quoted fields, embedded commas/quotes, CRLF).
// Returns { headers: string[], rows: string[][] }.
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  if (rows.length === 0) return { headers: [], rows: [] }
  return { headers: rows[0].map((h) => h.trim()), rows: rows.slice(1) }
}

// Normalizes a date cell to YYYY-MM-DD; returns null when empty/unparseable.
export function parseCSVDate(value) {
  const v = String(value ?? '').trim()
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Normalizes an amount cell ("₱1,234.56" → 1234.56); null when invalid.
export function parseCSVAmount(value) {
  const cleaned = String(value ?? '').replace(/[₱,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isNaN(n) ? null : n
}
