import { serviceEndpoint, companionEnabled } from './serviceEndpoint'
import { supabase } from '../supabaseClient'

export async function notificationRuleRequest(action,payload={},guest=false){
 if(!companionEnabled)throw Error('Notification rule management is not connected in this environment yet.')
 const headers={'Content-Type':'application/json'}
 if(!guest){const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in again to manage notifications.');headers.Authorization='Bearer '+data.session.access_token}
 const response=await fetch(serviceEndpoint('notification-rules/' + action),{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)})
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to manage notifications.');return result
}

export function publishNotificationEvent(eventType,notification,payload={}){
 return notificationRuleRequest('emit',{key:crypto.randomUUID(),eventType,notification,payload})
}
