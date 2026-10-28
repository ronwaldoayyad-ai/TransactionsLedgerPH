let recentPaymentSort = 'newest';
function recentPaymentTimestamp(payment) {
  for (const value of [payment.submittedAt, payment.paidDate]) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time)) return time;
  }
  return null;
}
function sortRecentPayments(payments, direction = recentPaymentSort) {
  return payments.slice().sort((a, b) => {
    const first = recentPaymentTimestamp(a), second = recentPaymentTimestamp(b);
    if (first === null || second === null) {
      if (first !== second) return first === null ? 1 : -1;
    }
    return ((first - second) * (direction === 'oldest' ? 1 : -1)) || String(a.id).localeCompare(String(b.id));
  });
}
function setRecentPaymentSort(value) {
  recentPaymentSort = value === 'oldest' ? 'oldest' : 'newest';
  renderRecentPayments();
  document.querySelector('#recentPaymentSort')?.focus();
}
