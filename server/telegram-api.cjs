// Server-only Telegram transport. Never log raw provider errors or URLs (the token is part of the URL).
const crypto=require('node:crypto');
class TelegramFailure extends Error {
 constructor(message,{retryable=false,uncertain=false,retryAfter=60}={}){super(message);this.retryable=retryable;this.uncertain=uncertain;this.retryAfter=retryAfter}
}
function transport({token,fetchImpl=fetch}){
 return async(method,body={})=>{
  if(!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token||''))throw new TelegramFailure('The Telegram bot credential is not configured.');
  if(!['getMe','getWebhookInfo','getUpdates','sendMessage'].includes(method))throw new TelegramFailure('Unsupported Telegram operation.');
  let response,data;
  try{
   response=await fetchImpl('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(6000),redirect:'error'});
   data=await response.json();
  }catch(error){
   const notSent=['ENOTFOUND','EAI_AGAIN','ECONNREFUSED'].includes(error.cause?.code||error.code);
   throw new TelegramFailure(notSent?'Telegram could not be reached.':method==='sendMessage'?'Delivery outcome is unknown. Check Telegram before retrying.':'Telegram could not be reached.',{retryable:notSent,uncertain:method==='sendMessage'&&!notSent});
  }
  if(!response.ok||data.ok!==true){
   const code=data.error_code||response.status;
   if(code===429)throw new TelegramFailure('Telegram is rate limiting alerts. Delivery will be retried.',{retryable:true,retryAfter:Math.max(1,Math.min(Number(data.parameters?.retry_after)||60,86400))});
   if(code===401)throw new TelegramFailure('The bot credential was rejected. Update its server configuration.');
   if(code===403)throw new TelegramFailure('Telegram blocked delivery. Open the bot and check that it is not blocked.');
   if(code>=500&&data.ok===false)throw new TelegramFailure('Telegram is unavailable. Delivery will be retried.',{retryable:true});
   throw new TelegramFailure('Telegram rejected this request. Check the bot and private chat connection.');
  }
  return data.result;
 };
}
const nonceHash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
function message(job,origin){
 const text=job.kind==='test'?'LoanLedger PH · Telegram test\nYour private chat is connected. This is a test alert; no payment was submitted.':
  'LoanLedger PH · Proof submitted\nBorrower: '+String(job.payload.borrower||'Borrower').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120)+
  '\nAmount: '+new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(job.payload.amount))+
  '\nProof: '+String(job.payload.reference||job.payment_id).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,160)+
  '\nSubmitted: '+new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(job.payload.submittedAt))+' (Philippine time)\nAwaiting lender review.';
 const base=new URL(origin);if(base.protocol!=='https:'||base.origin!==origin)throw Error('Use the canonical HTTPS app origin.');
 const review=origin+'/admin/queue'+(job.kind==='proof'?'?proof='+encodeURIComponent(job.payment_id):'');
 return {chat_id:job.destination,text,link_preview_options:{is_disabled:true},protect_content:true,reply_markup:{inline_keyboard:[[{text:job.kind==='test'?'Open LoanLedger':'Review proof',url:review}]]}};
}
module.exports={transport,message,nonceHash,TelegramFailure};
