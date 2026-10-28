import { serviceEndpoint } from './serviceEndpoint'
import { supabase } from '../supabaseClient'
import { attachmentDataUrlBlob } from './attachmentDataUrl'

const fileKinds = { 'payment-submit':['image/jpeg','image/png','image/webp','application/pdf'], 'support-submit':['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/avif'], 'avatar-upload':['image/jpeg','image/png','image/webp'], 'message-send':['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }
export async function validateMobileFile(file, action) {
  const limit = action==='avatar-upload'?2*1024*1024:5*1024*1024
  if (!fileKinds[action]?.includes(file.type) || !file.size || file.size>limit) throw Error('Choose a supported file within the size limit.')
  const bytes=new Uint8Array(await file.arrayBuffer()),text=new TextDecoder('latin1').decode(bytes)
  const magic=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':text.startsWith('RIFF')&&text.slice(8,12)==='WEBP'?'image/webp':text.startsWith('GIF8')?'image/gif':text.startsWith('BM')?'image/bmp':text.slice(4,12).includes('ftypavif')?'image/avif':text.startsWith('%PDF-')&&text.includes('%%EOF')?'application/pdf':bytes.slice(0,8).join(',')==='208,207,17,224,161,177,26,225'?'application/msword':text.startsWith('PK')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':null
  if(magic!==file.type)throw Error('The file contents do not match its declared format.')
  if(magic.startsWith('image/')){let bitmap;try{bitmap=await createImageBitmap(file)}catch{throw Error('The image is corrupt or unsupported.')}finally{bitmap?.close()}}
  return file
}
export async function mobileAction(action,payload){
 const {data,error}=await supabase.rpc('mobile_action',{p_action:action,p_payload:payload})
 if(error)throw Error(error.message)
 return data
}
export async function executeMobileCall(action,original,user){
 const payload={...original};let uploaded=null
 if(action==='support-submit'&&(typeof payload.description!=='string'||payload.description.trim().length<10||payload.description.length>2000))throw Error('Describe the issue in 10 to 2,000 characters.')
 if(payload.file){
  const f=payload.file;delete payload.file
  if(!/^data:(image\/(jpeg|png|webp|gif|bmp|avif)|application\/(pdf|msword|vnd.openxmlformats-officedocument.wordprocessingml.document));base64,/.test(f.data||''))throw Error('Choose a supported attachment.')
  const blob=attachmentDataUrlBlob(f.data,action==='avatar-upload'?2*1024*1024:5*1024*1024);const file=new File([blob],String(f.name||'attachment'),{type:blob.type})
  await validateMobileFile(file,action)
  const bucket=action==='payment-submit'?'payment-proofs':action==='avatar-upload'?'avatars':'mobile-attachments'
  const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/avif':'avif','application/pdf':'pdf','application/msword':'doc','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx'})[file.type]
  const path=user.id+'/'+payload.key+'.'+ext
  const {error}=await supabase.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false})
  if(error && String(error.statusCode)!=='409')throw Error(error.message)
  uploaded=error?null:{bucket,path};Object.assign(payload,{path,fileName:file.name,mime:file.type,size:file.size})
 }
 try{
  if(payload.path){const {data}=await supabase.auth.getSession();const r=await fetch(serviceEndpoint('validate-upload'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({bucket:action==='payment-submit'?'payment-proofs':action==='avatar-upload'?'avatars':'mobile-attachments',path:payload.path})});const result=await r.json();if(!r.ok)throw Error(result.error||'File validation failed.')}
  return await mobileAction(action,payload)
 }catch(error){
  // A lost response may follow a committed transaction: retain the upload for
  // an idempotent retry. Definite validation errors can be safely compensated.
  if(uploaded&&!/fetch|network|timeout|Failed to fetch/i.test(error.message))await supabase.storage.from(uploaded.bucket).remove([uploaded.path])
  throw error
 }
}
const mobileAttachmentCache=new Map()
let mobileAttachmentGeneration=0
export const clearMobileAttachmentCache=()=>{mobileAttachmentGeneration++;mobileAttachmentCache.clear()}
async function supportAttachmentUrl(userId,path){
 const key=userId+':'+path,cached=mobileAttachmentCache.get(key)
 if(cached&&cached.until>Date.now())return cached.url
 const generation=mobileAttachmentGeneration
 const {data}=await supabase.storage.from('mobile-attachments').createSignedUrl(path,900)
 if(data?.signedUrl&&generation===mobileAttachmentGeneration)mobileAttachmentCache.set(key,{url:data.signedUrl,until:Date.now()+840000})
 return data?.signedUrl||null
}
export async function loadMobileExtras(userId){
 const results=await Promise.all([
  supabase.from('borrower_preferences').select('*').eq('user_id',userId).maybeSingle(),
  supabase.from('support_tickets').select('*').eq('user_id',userId).order('created_at',{ascending:false}),
  supabase.from('message_hidden').select('message_id').eq('user_id',userId),
  supabase.from('support_ticket_events').select('*').order('created_at'),
  supabase.from('borrower_statements').select('*').eq('user_id',userId).is('deleted_at',null).order('created_at',{ascending:false}),
  supabase.from('notification_reactions').select('*').eq('user_id',userId),
 ])
 for(const result of results)if(result.error)throw Error(result.error.message)
 const tickets=await Promise.all(results[1].data.map(async t=>({...t,attachment_url:t.attachment_path?await supportAttachmentUrl(userId,t.attachment_path):null})))
 return {userId,preference:{user_id:userId,avatar_id:null,use_profile_photo:true,...results[0].data},tickets,hiddenMessages:results[2].data.map(m=>m.message_id),ticketEvents:results[3].data,statements:results[4].data,notificationReactions:results[5].data}
}
