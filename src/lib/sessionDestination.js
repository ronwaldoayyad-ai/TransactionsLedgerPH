// Role comes from the authenticated profile, never the entry URL or a form field.
export function sessionDestination(session) {
  if (!session) return '/login'
  if (session.needsPasswordSetup) return '/set-password'
  if (session.user?.role === 'admin') return '/admin'
  if (session.user?.role === 'user') return '/portal'
  return '/login'
}
