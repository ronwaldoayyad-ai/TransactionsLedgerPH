// Legacy imported fees predate assessment metadata. This classification only
// controls presentation; it must never create fees or change ledger accounting.
export function presentationFeeKind(transaction) {
  if (transaction.feeKind) return transaction.feeKind
  if (transaction.transactionGroup==='fees') return 'fee'
  const description = String(transaction.description || '').trim()
  if (/^(?:\d+(?:\.\d+)?\s*%\s*)?finance\s+charge\b/i.test(description)) return 'finance'
  if (/^late\s+(?:payment\s+)?fee\b/i.test(description)) return 'late'
  return null
}
