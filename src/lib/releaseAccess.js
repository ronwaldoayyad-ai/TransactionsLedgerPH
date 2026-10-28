import { supabase } from '../supabaseClient'
import { serviceEndpoint } from './serviceEndpoint'

export const releaseAccessEnabled = import.meta.env.VITE_RELEASE_ACCESS_ENABLED === 'true' || (import.meta.env.VITE_APP_ENV === 'local' && import.meta.env.VITE_RELEASE_ACCESS_ENABLED !== 'false')

export async function releaseAccessRequest(action, payload = {}, signal) {
  if (!releaseAccessEnabled) throw Error('Release access is not connected in this environment yet.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw Error('Sign in again to manage release access.')
  // A same-origin endpoint keeps session credentials out of external destinations.
  const response = await fetch(serviceEndpoint('release-access/' + action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token },
    body: JSON.stringify(payload),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'Unable to save release access. Please retry.')
  return result
}
