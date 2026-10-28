import { serviceEndpoint } from './serviceEndpoint'
import { supabase } from '../supabaseClient'

export async function authenticatePassword(email, password) {
  const response = await fetch(serviceEndpoint('login-password'), {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  if (!response.ok) return { error: { message: result.error || 'Unable to sign in.' }, login: result.login }
  return supabase.auth.setSession(result.session)
}
