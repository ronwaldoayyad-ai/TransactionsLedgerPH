import { createClient } from '@supabase/supabase-js'
import { fetchAuthentication } from './lib/authRequest'
import { sessionStorageKey, migrateSessionStorage } from './lib/sessionStorage'

export const mobileEnabled = import.meta.env.VITE_MOBILE_BORROWER === 'true'
export const stagingReadOnly = import.meta.env.VITE_STAGING_READ_ONLY === 'true' && import.meta.env.VITE_APP_ENV !== 'local'
const configuredUrl = import.meta.env.VITE_SUPABASE_URL
const url = configuredUrl?.startsWith('/') ? new URL(configuredUrl, window.location.origin).href : configuredUrl
const key = import.meta.env.VITE_SUPABASE_PUBLIC_KEY
if (!url || !key) throw new Error('Configure the Supabase environment before starting LoanLedger.')
const endpoint = new URL(url)
const localProxy = import.meta.env.VITE_APP_ENV === 'local' && endpoint.origin === window.location.origin && /^\/local-supabase\/?$/.test(endpoint.pathname)
if (import.meta.env.VITE_APP_ENV === 'local' &&
    !localProxy && (endpoint.origin !== 'http://127.0.0.1:54321' || endpoint.pathname !== '/')) {
  throw new Error('Local staging must use the local API or its same-origin proxy.')
}
if (key.startsWith('sb_secret_')) throw new Error('A server secret cannot be used in the browser.')
if (key.startsWith('eyJ')) {
  const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  if (payload.role !== 'anon') throw new Error('Use the public anon key, never a service-role key.')
}
const authStorageKey=sessionStorageKey(url, import.meta.env.VITE_APP_ENV)
try { migrateSessionStorage({local:localStorage,session:sessionStorage,endpoint:url,environment:import.meta.env.VITE_APP_ENV,key:authStorageKey}) } catch { /* Storage may be unavailable. Auth can still show the sign-in screen. */ }
const rememberKey=authStorageKey+'-remember'
function remembered(){try{return localStorage.getItem(rememberKey)!=='false'}catch{return false}}
const authStorage={
  getItem(name){try{return (remembered()?localStorage:sessionStorage).getItem(name)}catch{return null}},
  setItem(name,value){(remembered()?localStorage:sessionStorage).setItem(name,value)},
  removeItem(name){localStorage.removeItem(name);sessionStorage.removeItem(name)},
}
export function setLoginPersistence(remember){
  localStorage.setItem(rememberKey,String(remember!==false))
  // A new sign-in must not retain an older session in the other storage.
  ;(remember===false?localStorage:sessionStorage).removeItem(authStorageKey)
}
export const supabase = createClient(url, key, {
  auth: { storageKey: authStorageKey, storage: authStorage, persistSession:true },
  global: {
    fetch: (input, init) => {
      const target = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url)
      if (target.origin !== endpoint.origin) throw new Error('Unexpected Supabase endpoint.')
      if (localProxy && !target.pathname.startsWith('/local-supabase/')) throw new Error('Unexpected local API route.')
      const pathname = localProxy ? target.pathname.slice('/local-supabase'.length) : target.pathname
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      const authOperation = pathname.startsWith('/auth/v1/')
      const signedFileRead = method === 'POST' && pathname.startsWith('/storage/v1/object/sign/')
      const activation = method === 'POST' && pathname === '/rest/v1/rpc/activate_my_account'
      const isLocal = localProxy || endpoint.origin === 'http://127.0.0.1:54321'
      const localPreference = isLocal && ['/rest/v1/borrower_preferences','/rest/v1/notification_reads'].includes(pathname)
      const localFlow = isLocal && (pathname==='/rest/v1/rpc/mobile_action'||['payment-proofs','avatars','mobile-attachments'].some(bucket=>pathname.startsWith('/storage/v1/object/'+bucket+'/')||pathname==='/storage/v1/object/'+bucket))
      if (stagingReadOnly && !['GET', 'HEAD'].includes(method) && !authOperation && !signedFileRead && !activation && !localPreference && !localFlow) {
        throw new Error('This staging review allows viewing only. Submissions are not enabled yet.')
      }
      return authOperation || (method === 'GET' && pathname === '/rest/v1/profiles')
        ? fetchAuthentication(input, init)
        : fetch(input, init)
    },
  },
})
