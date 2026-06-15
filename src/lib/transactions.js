// Shared transaction-status logic for the Overall Transactions ledger and the
// borrower views that read from the same store.

export const STATUS_LABELS = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
  past_due: 'Past Due',
}

// A stored "unpaid" row automatically becomes Past Due one day after its due
// date. Explicitly stored statuses (paid/refunded/cancelled/past_due) win.
export const effectiveStatus = (t, today) =>
  t.status === 'unpaid' && t.dueDate < today ? 'past_due' : t.status

// Borrower-facing variant: future unpaid rows read as Upcoming/Due rather
// than the bare "Unpaid".
export const borrowerStatus = (t, today) => {
  const s = effectiveStatus(t, today)
  if (s !== 'unpaid') return s
  return t.dueDate === today ? 'due' : 'upcoming'
}

export const BORROWER_STATUS_LABELS = {
  ...STATUS_LABELS,
  due: 'Due',
  upcoming: 'Upcoming',
}

// Receivables = money still expected to come in.
export const isReceivable = (t, today) =>
  ['unpaid', 'past_due'].includes(effectiveStatus(t, today))
