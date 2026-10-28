import {supabase} from '../supabaseClient'
import {serviceEndpoint} from './serviceEndpoint'
export async function telegramRequest(action,payload={},signal){
 const {data,error}=await supabase.auth.getSession()
 if(error||!data.session)throw Error('Sign in again to manage Telegram alerts.')
 const response=await fetch(serviceEndpoint('telegram/'+action),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})
 const result=await response.json()
 if(!response.ok)throw Error(result.error||'Telegram settings are unavailable. Please retry.')
 return result
}
