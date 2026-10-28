// Capture the error dialog only. Credentials and the surrounding login form are excluded.
let loginLockSupportSnapshot=null,loginLockSupportBusy=false,loginLockScreenshotLibrary=null;
function rememberLoginLockIssue(method=loginMode==='token'?'code':'password'){
 if(!loginAccessBlocked())return null;
 const dialog=loginAccessDialog,old=loginLockSupportSnapshot;
 if(!dialog&&old&&old.reference===(loginAccessLock.reference||'')&&old.scope===loginAccessLock.scope)return old;
 loginLockSupportSnapshot={
  method,scope:loginAccessLock.scope||'account',remaining:Math.max(0,Number(loginAccessLock.remaining)||0),reference:loginAccessLock.reference||'',
  title:dialog?.querySelector('#loginAccessTitle')?.textContent||'Sign-in Locked',
  message:dialog?.querySelector('.login-access-message')?.textContent||'You have reached the maximum of 5 failed attempts.',
  description:dialog?.querySelector('#loginAccessDescription')?.textContent||'Your lender must unlock sign-in access.',
  email:method==='password'?($('#email')?.value.trim()||loginAccessEmail||''):'',
  capturedAt:new Date().toISOString(),element:dialog?.cloneNode(true)||old?.element||null,
 };
 return loginLockSupportSnapshot;
}
function loginLockSupportDescription(issue){
 const fil=preferredLanguage==='Filipino',method=issue.method==='code'?'Login Code':fil?'Email at password':'Email and password';
 return [fil?'Hindi ako makapag-sign in dahil naka-lock ang access ko.':'I cannot sign in because my access is locked.',
  (fil?'Paraan ng pag-sign in: ':'Sign-in method: ')+method,
  (fil?'Saklaw ng lock: ':'Lock scope: ')+(issue.scope==='device'?(fil?'Device na ito':'This device'):(fil?'Account':'Account')),
  (fil?'Mensahe: ':'Error: ')+String(issue.message).slice(0,400),
  (fil?'Detalye: ':'Details: ')+String(issue.description).slice(0,900),
  (fil?'Natitirang pagtatangka: ':'Attempts remaining: ')+issue.remaining+' / 5',
  issue.reference?'Unlock reference: '+issue.reference:'',
  (fil?'Nangyari noong: ':'Encountered at: ')+issue.capturedAt,
  fil?'Pakisuri ang lock at tulungan akong maibalik ang access.':'Please review the lock and help me restore access.',
 ].filter(Boolean).join('\n').slice(0,2000);
}
function loadLoginLockScreenshotLibrary(){
 if(window.html2canvas)return Promise.resolve(window.html2canvas);
 if(loginLockScreenshotLibrary)return loginLockScreenshotLibrary;
 loginLockScreenshotLibrary=new Promise((resolve,reject)=>{
  const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(Error('Screenshot preparation timed out.'));},12000);
  script.src='/vendor/html2canvas.min.js';script.onload=()=>{clearTimeout(timer);window.html2canvas?resolve(window.html2canvas):reject(Error('Screenshot preparation is unavailable.'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Screenshot preparation is unavailable.'));};document.head.append(script);
 }).catch(error=>{loginLockScreenshotLibrary=null;throw error;});
 return loginLockScreenshotLibrary;
}
async function captureLoginLockDialog(issue){
 if(!issue.element)throw Error('The error dialog is unavailable.');
 const capture=await loadLoginLockScreenshotLibrary(),element=issue.element.cloneNode(true);
 element.id='loginLockCapture';element.removeAttribute('aria-labelledby');element.removeAttribute('aria-describedby');element.setAttribute('open','');
 element.style.cssText='display:block;position:fixed;left:-10000px;top:0;margin:0;width:'+Math.min(360,innerWidth-24)+'px;max-height:none;height:auto;overflow:visible;animation:none;transform:none;pointer-events:none';
 element.setAttribute('aria-hidden','true');element.querySelectorAll('[onclick]').forEach(node=>node.removeAttribute('onclick'));document.body.append(element);
 let timer;
 try{
  const canvas=await Promise.race([capture(element,{backgroundColor:null,scale:2,logging:false,allowTaint:false,useCORS:false,removeContainer:true,
   onclone:doc=>{const target=doc.getElementById('loginLockCapture');target.style.left='0';target.style.top='0';target.style.margin='0';target.style.animation='none';target.style.transform='none';doc.body.replaceChildren(target);doc.body.style.cssText='margin:0;background:transparent';},
  }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Screenshot preparation timed out.')),15000);})]);
  const data=canvas.toDataURL('image/png'),size=Math.floor((data.split(',')[1]?.length||0)*3/4);
  if(!size||size>5*1024*1024)throw Error('The screenshot could not be attached.');
  return {name:'Sign-in-locked-'+issue.capturedAt.replace(/[:.]/g,'-')+'.png',type:'image/png',size,sizeLabel:(size/1024).toFixed(1)+' KB',data};
 }finally{clearTimeout(timer);element.remove();}
}
const showBeforeLockSupport=showLoginAccessError;
showLoginAccessError=(detail,method=loginMode==='token'?'code':'password')=>{const result=showBeforeLockSupport(detail,method);if(loginAccessBlocked())rememberLoginLockIssue(method);return result;};
const closeBeforeLockSupport=closeLoginAccessDialog;
closeLoginAccessDialog=(...args)=>{if(loginAccessDialog&&loginAccessBlocked())rememberLoginLockIssue();return closeBeforeLockSupport(...args);};
loginAccessSupport=()=>go('support');
const goBeforeLockSupport=go;
go=destination=>{
 if(destination!=='support'||page!=='login'||!loginAccessBlocked())return goBeforeLockSupport(destination);
 if(loginLockSupportBusy)return;
 return prepareLockedLoginSupport();
};
async function prepareLockedLoginSupport(){
 loginLockSupportBusy=true;
 if(!loginAccessDialog&&!loginLockSupportSnapshot)showLoginAccessError({login:loginAccessLock});
 const issue=rememberLoginLockIssue(),dialog=loginAccessDialog;
 const task=beginTaskLoading('Preparing support request','Capturing the sign-in error','support');
 dialog?.querySelectorAll('button').forEach(button=>{button.disabled=true;});let attachment=null;
 try{attachment=await captureLoginLockDialog(issue);}catch{/* The error details remain available even if image capture fails. */}
 finally{cancelTaskLoading(task);dialog?.querySelectorAll('button').forEach(button=>{button.disabled=false;});loginLockSupportBusy=false;}
 if(page!=='login'||!loginAccessBlocked())return;
 syncSupportFormOwner();
 supportDraft={email:issue.email||supportDraft.email||'',topic:'Unable to log in',description:loginLockSupportDescription(issue)};
 supportAttachment=attachment;supportTouched.clear();
 supportNotice=preferredLanguage==='Filipino'?(attachment?'Awtomatikong nailagay ang detalye at screenshot ng error. Maaari mo itong baguhin bago isumite.':'Nailagay ang detalye ng error. Hindi nakunan ang screenshot; maaari kang magdagdag ng larawan.'):(attachment?'Error details and a screenshot were added automatically. You can review and edit before submitting.':'Error details were added. The screenshot could not be captured; you can add a picture.');
 closeLoginAccessDialog();goBeforeLockSupport('support');
}
const renderBeforeLockSupport=render;
render=()=>{renderBeforeLockSupport();if((page==='login'&&!loginAccessBlocked())||stagingData?.user)loginLockSupportSnapshot=null;};
