// Hosted New and Classic use Supabase's original per-project storage contract.
// No token is put into a URL, cookie, event payload or an external destination.
export function sessionStorageKey(endpoint, environment) {
  return environment === 'local' ? 'loanledger-local-auth' : `sb-${new URL(endpoint).hostname.split('.')[0]}-auth-token`
}

export function migrateSessionStorage({local, session, endpoint, environment, key}) {
  if (environment === 'local' || local.getItem(key) || session.getItem(key)) return false
  const legacy = `loanledger-${environment || 'configured'}-auth`
  // Preserve the Remember me choice; do not resurrect a session from the other store.
  const destination = local.getItem(legacy+'-remember') === 'false' ? session : local
  const stored = destination.getItem(legacy)
  if (!stored) return false
  try {
    const value = JSON.parse(stored)
    const claims = JSON.parse(atob(value.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
    if (!value.refresh_token || claims.iss !== new URL('/auth/v1', endpoint).href) return false
    destination.setItem(key, stored)
    local.setItem(key+'-remember', String(destination === local))
    destination.removeItem(legacy)
    return true
  } catch { return false }
}
