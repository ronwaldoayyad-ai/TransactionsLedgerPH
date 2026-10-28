const crypto=require('node:crypto'),net=require('node:net');
function addressKey(value){
 const raw=String(value||'').trim();if(net.isIP(raw)===4)return raw;if(raw.includes('%')||net.isIP(raw)!==6)return 'unknown';
 const normalized=new URL('http://['+raw+']/').hostname.slice(1,-1),parts=normalized.split('::'),left=parts[0]?parts[0].split(':'):[],right=parts[1]?parts[1].split(':'):[];
 const words=(parts.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left).map(v=>parseInt(v,16));
 if(words.length!==8)return 'unknown';if(words.slice(0,5).every(n=>n===0)&&words[5]===65535)return [words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');
 return words.slice(0,4).map(n=>n.toString(16).padStart(4,'0')).join(':')+'::/64';
}
const blocked=retryAfter=>Object.assign(Error('Too many requests. Please wait and try again.'),{status:429,retryAfter});
function createRequestSecurity({db,secret}){
 if(!db?.query||typeof secret!=='string'||secret.length<32)throw Error('Request protection is not configured.');
 const denied=new Map();
 async function consume(scope,subject,limit,seconds){
  const key=crypto.createHmac('sha256',secret).update('request-security:v1:'+scope+':'+subject).digest('hex');let row;
  const until=denied.get(key);if(until>Date.now())throw blocked(Math.max(1,Math.ceil((until-Date.now())/1000)));if(until)denied.delete(key);
  try{row=(await db.query(`insert into mobile_private.service_rate_limits(subject,window_start,attempts)
   values($1,to_timestamp(floor(extract(epoch from now())/$2)*$2),1)
   on conflict(subject) do update set
   attempts=case when service_rate_limits.window_start<excluded.window_start then 1 else service_rate_limits.attempts+1 end,
   window_start=excluded.window_start
   returning attempts,greatest(1,ceil(extract(epoch from (window_start+($2*interval '1 second')-now()))))::int as retry_after`,[key,seconds])).rows[0];}
  catch{throw Object.assign(Error('Request protection is temporarily unavailable. Please retry.'),{status:503});}
  if(!row||!Number.isInteger(Number(row.attempts))||Number(row.attempts)<1)throw Object.assign(Error('Request protection is temporarily unavailable. Please retry.'),{status:503});
  if(Number(row.attempts)>limit){const retry=Math.min(seconds,Math.max(1,Number(row.retry_after)||seconds));if(denied.size>=2000)denied.delete(denied.keys().next().value);denied.set(key,Date.now()+retry*1000);throw blocked(retry);}
 }
 async function request({route,address}){
  const subject=addressKey(address);
  if(route==='/login-password'||route==='/redeem'){await consume('sign-in-minute',subject,15,60);await consume('sign-in-hour',subject,120,3600);return;}
  if(route==='/login-status'){await consume('access-status',subject,120,60);return;}
  if(route==='/guest-support'){await consume('guest-minute',subject,5,60);await consume('guest-hour',subject,20,3600);return;}
  if(route==='/support-tracking/request'||route==='/support-tracking/verify'){await consume('tracking-minute',subject,15,60);return;}
  if(route==='/pawcheebels/ask'){await consume('assistant-ip',subject,30,60);return;}
  if(route==='/validate-upload'||/^\/(?:group-logos|retail-logos)\//.test(route)){await consume('upload-ip',subject,40,60);return;}
  if(route==='/health'){await consume('health',subject,60,60);return;}
  await consume('api-general',subject,240,60);
 }
 async function assistant(user){await consume('assistant-user-minute',user.id,12,60);await consume('assistant-user-day',user.id,200,86400);}
 return {request,assistant,consume};
}
module.exports={createRequestSecurity,addressKey};
