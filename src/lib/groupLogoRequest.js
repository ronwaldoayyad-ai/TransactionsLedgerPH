import {supabase} from '../supabaseClient'
import {serviceEndpoint} from './serviceEndpoint'
async function artworkRequest(scope,action,payload){
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('Sign in again to manage group logos.')
 const response=await fetch(serviceEndpoint(scope+'/'+action),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)})
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to save this group logo. Please retry.');return result
}
export const groupLogoRequest=(action,payload)=>artworkRequest('group-logos',action,payload)
export const retailLogoRequest=(action,payload)=>artworkRequest('retail-logos',action,payload)
