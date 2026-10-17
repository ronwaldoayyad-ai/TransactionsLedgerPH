// A missing switch or unresolved assignment must never enroll a borrower.
export function borrowerRelease(enabled, userId, assignment) {
  if (!enabled || !userId) return { interface: 'classic', ready: true }
  if (assignment?.ownerId !== userId || !assignment.ready) return { interface: 'classic', ready: false }
  return { ...assignment, interface: assignment.interface === 'new' ? 'new' : 'classic' }
}
