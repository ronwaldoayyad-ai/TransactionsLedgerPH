// Review contract shared by lender posting forms and accounting displays.
// The database independently validates and commits every posting.
const MAX_CENTS = 999999999999

export function moneyCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') throw Error('Enter a valid money amount.')
  const text = String(value)
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw Error('Use a non-negative amount with at most two decimal centavo places.')
  const [whole, fraction = ''] = text.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) throw Error('The amount exceeds the supported limit.')
  return cents
}

export function centsAmount(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) throw Error('Invalid money amount.')
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function outstandingCents(due) {
  const original = moneyCents(due.amount), paid = moneyCents(due.paidAmount ?? '0')
  if (paid > original) throw Error('Paid amount exceeds the original due.')
  return ['paid', 'cancelled', 'refunded'].includes(due.status) ? 0 : original - paid
}

export function reviewPaymentAllocation({borrowerId, cashAmount, availableCredit, creditUsed, dues, allocations}) {
  const cashCents = moneyCents(cashAmount), availableCreditCents = moneyCents(availableCredit), creditUsedCents = moneyCents(creditUsed)
  if (!borrowerId || !Array.isArray(dues) || !Array.isArray(allocations) || allocations.length > 100) throw Error('Choose available borrower dues and allocations.')
  if (creditUsedCents > availableCreditCents) throw Error('The available credit is insufficient.')
  const byId = new Map(dues.map(due => [due.id, due])), seen = new Set()
  let allocatedCents = 0, selectedDueCents = 0
  const reviewed = allocations.map(item => {
    const due = byId.get(item.id)
    if (!due || seen.has(item.id) || due.userId !== borrowerId || due.archivedAt || !['unpaid', 'past_due'].includes(due.status)) throw Error('An allocation refers to a duplicate or unavailable borrower due.')
    seen.add(item.id)
    const amountCents = moneyCents(item.amount), expectedCents = outstandingCents(due)
    if (amountCents <= 0 || amountCents > expectedCents) throw Error('Each allocation must be positive and within its outstanding due.')
    allocatedCents += amountCents; selectedDueCents += expectedCents
    return {id: item.id, amount: centsAmount(amountCents), amountCents, expectedCents, expectedBalance: centsAmount(expectedCents), remainingCents: expectedCents - amountCents}
  })
  if (!cashCents && !creditUsedCents) throw Error('A posting needs a positive amount of funds.')
  if (creditUsedCents !== Math.max(0, allocatedCents - cashCents)) throw Error('Explicitly choose only the prior credit needed to fund these allocations.')
  const creditAddedCents = Math.max(0, cashCents - allocatedCents)
  const creditAfterCents = availableCreditCents - creditUsedCents + creditAddedCents
  if (!Number.isSafeInteger(allocatedCents) || creditAfterCents > MAX_CENTS) throw Error('The money amount exceeds the supported limit.')
  return {cashCents, availableCreditCents, creditUsedCents, allocatedCents, selectedDueCents, creditAddedCents, creditAfterCents, allocations: reviewed}
}
