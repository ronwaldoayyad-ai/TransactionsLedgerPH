export const companionEnabled = import.meta.env.VITE_APP_ENV === 'local' || import.meta.env.VITE_HOSTED_SERVICES_ENABLED === 'true'

export function serviceEndpoint(action) {
  if (!companionEnabled) throw Error('This service has not been connected yet. Please contact your lender.')
  if (!/^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)*$/.test(action)) throw Error('Unsupported service request.')
  return (import.meta.env.VITE_APP_ENV === 'local' ? '/local-flow/' : '/api/') + action
}
