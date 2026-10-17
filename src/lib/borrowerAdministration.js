import { serviceEndpoint, companionEnabled } from './serviceEndpoint'
import { supabase } from '../supabaseClient'
import { mapProfile } from './dbMappers'

async function request(action, payload) {
  if (!companionEnabled) throw Error('Account management is unavailable in this environment.')
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw Error('Sign in again to manage account access.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(serviceEndpoint('' + action), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.session.access_token }, body: JSON.stringify(payload), signal: controller.signal })
    const result = await response.json()
    if (!response.ok) throw Error(result.error || 'Unable to save. Please retry.')
    return result
  } catch (error) {
    if (error.name === 'AbortError') throw Error('The request timed out. Check your connection and retry.', { cause: error })
    throw error
  } finally { clearTimeout(timer) }
}
export async function getBorrowerDetails(userId) { return mapProfile((await request('borrower-details', { userId })).profile) }
export async function saveBorrowerDetails(userId, profile) { return mapProfile((await request('borrower-profile', { userId, profile })).profile) }
export async function changeBorrowerPassword(userId, password) { return request('borrower-password', { userId, password }) }
export async function getLoginLocks() { return request('login-locks', {}) }
export async function unlockLoginAccess(reference) { return request('login-unlock', { reference }) }
