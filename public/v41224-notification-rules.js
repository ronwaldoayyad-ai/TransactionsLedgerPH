// Presentation rules contain text and data conditions, never executable content.
let managedNotificationCore=null,managedNotificationRules=[],managedRulesReady=false,managedRulesOwner=null,managedRulesGeneration=0,managedRulesLoading=false,managedRulesLoadedAt=0,managedPresentationIds=new Set(),managedPresentationQueue=[],managedPresentationTimer=0;
const managedCorePromise=import('/notification-rule-core.js').then(core=>{managedNotificationCore=core;return core;});
function managedSpacingKey(action){return 'loanledger-rule-spacing:'+(stagingData?.user?.id||'guest')+':'+action.ruleId+':'+action.nodeId;}
function managedActionAvailable(action){try{return !action.cooldown||Date.now()-Number(sessionStorage.getItem(managedSpacingKey(action))||0)>=action.cooldown*1000;}catch{return true;}}
function rememberManagedAction(action){if(!action?.ruleId)return;try{sessionStorage.setItem(managedSpacingKey(action),String(Date.now()));}catch{}}
function managedNotificationContext(extra={}){const user=stagingData?.user;return {language:preferredLanguage,name:user?.nickname||user?.firstName||user?.name||'',email:user?.email||'',account_number:user?.accountNumber||'',...extra};}
function managedNotificationResult(event,context={}){
 if(!managedNotificationCore||!managedRulesReady)return {configured:false,actions:[]};
 const candidates=managedNotificationRules.filter(rule=>rule.graph.nodes.some(node=>node.type==='when'&&node.data.event===event));
 const payload=managedNotificationContext(context),actions=candidates.filter(rule=>rule.enabled).flatMap(rule=>managedNotificationCore.evaluateGraph(rule.graph,event,payload).filter(action=>!action.hidden&&(action.language==='all'||action.language===preferredLanguage)).map(action=>({...action,ruleId:rule.id,version:rule.version,...managedNotificationCore.messageFor(action,payload,preferredLanguage)}))).filter(managedActionAvailable);
 return {configured:candidates.length>0,actions};
}
async function loadManagedNotificationRules(force=false){
 const owner=stagingData?.user?.id||'guest';if(managedRulesLoading&&!force)return;if(!force&&owner===managedRulesOwner&&Date.now()-managedRulesLoadedAt<30000)return;
 const generation=++managedRulesGeneration;managedRulesLoading=true;
 try{await managedCorePromise;const result=await mobileCall('notification-presentation',{}, {timeoutMs:15000});if(generation!==managedRulesGeneration)return;managedNotificationRules=result.rules||[];managedRulesOwner=owner;managedRulesLoadedAt=Date.now();}
 catch{/* Existing app feedback remains available when the rule service is temporarily unavailable. */}
 finally{if(generation===managedRulesGeneration){managedRulesLoading=false;managedRulesReady=true;queuePawProactive();}}
}
function managedConfirmationCopy(model,event,title,body){const result=managedNotificationResult(event,{amount:model.paid??model.amount??'',reference:model.receipt||model.number||'',topic:model.topic||'',status:model.status||'submitted',original_title:title,original_body:body});const action=result.actions[0];return {title:action?.title||title,body:action?.body||body,visible:!result.configured||!!action,delay:action?.delay||0,channel:action?.channel||'popup',action};}
function managedPawTiming(stage){const result=managedNotificationResult('paw.'+stage,{phase:stage});return result.configured&&result.actions.length?Math.min(...result.actions.map(action=>action.delay))*1000:stage==='welcome'?2000:120000;}
let managedPawChosen=null;
function managedPawDuration(){return (managedPawChosen?.duration||10)*1000;}
const originalManagedPawChoice=choosePawProactiveMessage;
choosePawProactiveMessage=stage=>{const result=managedNotificationResult('paw.'+stage,{phase:stage});if(!result.configured){managedPawChosen=null;return originalManagedPawChoice(stage);}const delay=Math.min(...result.actions.map(action=>action.delay)),options=result.actions.filter(action=>action.delay===delay);let previous='';try{previous=sessionStorage.getItem('loanledger-paw-last-'+stage)||'';}catch{}const filtered=options.filter(action=>action.ruleId+':'+action.nodeId!==previous),pool=filtered.length?filtered:options;managedPawChosen=pool[Math.floor(Math.random()*pool.length)];const id=managedPawChosen.ruleId+':'+managedPawChosen.nodeId;try{sessionStorage.setItem('loanledger-paw-last-'+stage,id);}catch{}return [id,managedPawChosen.body];};
const originalManagedPawShow=showPawProactiveBubble;
showPawProactiveBubble=stage=>{
 if(!managedRulesReady||!pawProactiveEligible()||pawProactiveState?.stopped)return false;
 const result=managedNotificationResult('paw.'+stage,{phase:stage});
 if(result.configured&&!result.actions.length){pawProactiveState[stage==='welcome'?'welcomeShown':'reminderShown']=true;persistPawProactive();return false;}
 if(result.configured&&result.actions.every(action=>action.channel!=='paw')){
  choosePawProactiveMessage(stage);pawProactiveState[stage==='welcome'?'welcomeShown':'reminderShown']=true;if(stage==='welcome')pawProactiveLastActivity=Date.now();persistPawProactive();showManagedNotification(managedPawChosen);return true;
 }
 const shown=originalManagedPawShow(stage);if(shown)rememberManagedAction(managedPawChosen);return shown;
};
const originalManagedPaymentModel=paymentConfirmationModel;
paymentConfirmationModel=record=>{const model=originalManagedPaymentModel(record);return Object.freeze({...model,managedCopy:model.status==='Submitted for review'?managedConfirmationCopy(model,'popup.payment_submitted',model.title,model.subtitle):{title:model.title,body:model.subtitle,visible:true,channel:'popup',delay:0}});};
const originalManagedPaymentHTML=paymentConfirmationHTML;
paymentConfirmationHTML=model=>{const host=document.createElement('template');host.innerHTML=originalManagedPaymentHTML(model);const copy=model.managedCopy;host.content.querySelector('#paymentConfirmationHeading').textContent=copy.title;host.content.querySelector('.payment-confirmation-heading p').textContent=copy.body;return host.innerHTML;};
const originalManagedPaymentShow=showPaymentConfirmation;
showPaymentConfirmation=async(record,owner=paymentConfirmationOwner(),beforeOpen=null)=>{
 if(!owner||owner!==paymentConfirmationOwner()||page!=='payment')return false;
 const model=paymentConfirmationModel(record),copy=model.managedCopy;if(!copy.visible){beforeOpen?.();return false;}
 if(copy.delay){const finish=beginGeneralProcessing();try{await new Promise(resolve=>setTimeout(resolve,Math.min(copy.delay,300)*1000));}finally{finish();}}
 if(owner!==paymentConfirmationOwner())return false;if(copy.channel!=='popup'){beforeOpen?.();showManagedNotification(copy.action);return true;}const shown=await originalManagedPaymentShow(record,owner,beforeOpen);if(shown)rememberManagedAction(copy.action);return shown;
};
const originalManagedSupportModel=supportConfirmationModel;
supportConfirmationModel=(ticket,payload)=>{const model=originalManagedSupportModel(ticket,payload);return Object.freeze({...model,managedCopy:managedConfirmationCopy(model,'popup.support_submitted','Support Request Submitted!','Your support team can now review your request.')});};
const originalManagedSupportHTML=supportConfirmationHTML;
supportConfirmationHTML=model=>{const host=document.createElement('template');host.innerHTML=originalManagedSupportHTML(model);host.content.querySelector('#supportConfirmationHeading').textContent=model.managedCopy.title;host.content.querySelector('.payment-confirmation-heading p').textContent=model.managedCopy.body;return host.innerHTML;};
const originalManagedSupportShow=showSupportConfirmation;
showSupportConfirmation=async(ticket,payload,owner)=>{if(owner!==supportConfirmationOwner()||page!=='support')return false;const model=supportConfirmationModel(ticket,payload);if(!model.managedCopy.visible)return false;if(model.managedCopy.delay){const finish=beginGeneralProcessing();try{await new Promise(resolve=>setTimeout(resolve,Math.min(model.managedCopy.delay,300)*1000));}finally{finish();}}if(owner!==supportConfirmationOwner())return false;if(model.managedCopy.channel!=='popup'){showManagedNotification(model.managedCopy.action);return true;}const shown=await originalManagedSupportShow(ticket,payload,owner);if(shown)rememberManagedAction(model.managedCopy.action);return shown;};
const originalManagedLoginError=showLoginAccessError;
let managedLoginTimer=0,managedLoginGeneration=0;
showLoginAccessError=(detail={},method=loginMode==='token'?'code':'password')=>{
 clearTimeout(managedLoginTimer);const generation=++managedLoginGeneration;
 const state=detail.login,event=state?.locked?'popup.login_locked':!state?'popup.login_error':method==='code'?'popup.login_code_invalid':'popup.password_invalid';
 originalManagedLoginError(detail,method);const dialog=loginAccessDialog;if(!dialog)return;
 const description=dialog.querySelector('#loginAccessDescription'),heading=dialog.querySelector('#loginAccessTitle'),message=dialog.querySelector('.login-access-message');
 const result=managedNotificationResult(event,{remaining:state?.remaining??'',locked:state?.locked??false,scope:state?.scope||'',original_title:heading.textContent,original_body:description.textContent,message:message.textContent});const action=result.actions[0];
 if(result.configured&&!action){closeLoginAccessDialog();const target=$('#stagingLoginError')||$('#loginError');if(target)target.textContent=detail.message||message.textContent;return;}
 if(action?.channel==='banner'){const feedback=detail.message||message.textContent;closeLoginAccessDialog();const target=$('#stagingLoginError')||$('#loginError');if(target)target.textContent=feedback;managedLoginTimer=setTimeout(()=>{if(page==='login'&&generation===managedLoginGeneration)showManagedNotification(action);},action.delay*1000);return;}
 if(action){heading.textContent=action.title||heading.textContent;description.textContent=action.body||description.textContent;if(!action.delay)rememberManagedAction(action);}
 if(action?.delay){dialog.close();managedLoginTimer=setTimeout(()=>{if(page==='login'&&generation===managedLoginGeneration&&dialog.isConnected){dialog.showModal();rememberManagedAction(action);dialog.querySelector('.primary').focus({preventScroll:true});}},Math.min(action.delay,300)*1000);}
 applyBorrowerLanguage();loadManagedNotificationRules();
};
const originalManagedSignIn=signin,originalManagedCode=signinWithToken;
signin=()=>{clearTimeout(managedLoginTimer);managedLoginGeneration++;originalManagedSignIn();};
signinWithToken=(...args)=>{clearTimeout(managedLoginTimer);managedLoginGeneration++;return originalManagedCode(...args);};
const originalManagedToast=toast;
toast=message=>{const result=managedNotificationResult('ui.notice',{message,original_body:message,original_title:'Notice'});if(!result.configured){originalManagedToast(message);return;}const action=result.actions[0];if(action){const owner=stagingData?.user?.id;setTimeout(()=>{if(owner===stagingData?.user?.id)showManagedNotification(action);},Math.min(action.delay,300)*1000);}};
function showManagedNotification(item){
 if(!item)return;if(item.channel==='paw'&&(page!=='dashboard'||chatWidgetOpen)){managedPresentationQueue.push(item);return;}rememberManagedAction(item);
 if(item.channel==='banner'){const previous=$('#managedNotificationBanner');previous?.remove();const banner=document.createElement('aside');banner.id='managedNotificationBanner';banner.className='managed-notification-banner';banner.setAttribute('role','status');banner.innerHTML='<div><strong></strong><p></p></div><button type="button" aria-label="Dismiss notification">×</button>';banner.querySelector('strong').textContent=item.title||'';banner.querySelector('p').textContent=item.body;const close=()=>{banner.remove();flushManagedNotificationQueue();};banner.querySelector('button').onclick=close;document.body.append(banner);applyBorrowerLanguage();setTimeout(close,(item.duration||10)*1000);return;}
 if(item.channel==='paw'&&page==='dashboard'&&!chatWidgetOpen){
  const aside=document.createElement('aside');aside.className='paw-proactive-bubble';aside.id='managedPawNotice';aside.innerHTML='<button class="paw-proactive-open"><span class="paw-proactive-name">Pawcheebels ✦</span><span class="paw-proactive-message"></span><span class="paw-proactive-cta">View notification ↗</span></button><button class="paw-proactive-dismiss" aria-label="Dismiss">×</button>';aside.querySelector('.paw-proactive-message').textContent=item.body;document.body.append(aside);const anchor=$('#dashboardOrbitTrigger')?.getBoundingClientRect();aside.style.width='250px';aside.style.left=Math.max(12,(anchor?.right||innerWidth-18)-250)+'px';aside.style.top=Math.max(12,(anchor?.top||innerHeight-150)-aside.offsetHeight-12)+'px';aside.querySelector('.paw-proactive-open').onclick=()=>{aside.remove();go('notifications');};aside.querySelector('.paw-proactive-dismiss').onclick=()=>aside.remove();setTimeout(()=>aside.remove(),(item.duration||10)*1000);return;
 }
 const dialog=document.createElement('dialog');dialog.className='login-access-dialog managed-notification-dialog';dialog.setAttribute('aria-label','App notification');dialog.innerHTML='<button type="button" class="login-access-close" aria-label="Close">×</button><h2></h2><p class="managed-notification-body"></p><button type="button" class="primary">Close</button>';dialog.querySelector('h2').textContent=item.title||'Notification';dialog.querySelector('p').textContent=item.body;const close=()=>{dialog.close();dialog.remove();flushManagedNotificationQueue();};dialog.querySelectorAll('button').forEach(button=>button.onclick=close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});document.body.append(dialog);dialog.showModal();dialog.querySelector('.primary').focus({preventScroll:true});
}
function flushManagedNotificationQueue(){
 clearTimeout(managedPresentationTimer);if(!managedPresentationQueue.length||!stagingData?.user)return;
 if(managedPresentationQueue[0]?.channel==='paw'&&page!=='dashboard')return;
 if(document.hidden||document.querySelector('dialog[open],#managedPawNotice,#pawProactiveBubble,#managedNotificationBanner')||loadingTasks.size||generalProcessTasks.size){managedPresentationTimer=setTimeout(flushManagedNotificationQueue,1000);return;}
 showManagedNotification(managedPresentationQueue.shift());if(managedPresentationQueue.length)managedPresentationTimer=setTimeout(flushManagedNotificationQueue,1000);
}
function clearManagedNotices(){document.querySelectorAll('.managed-notification-dialog').forEach(dialog=>{dialog.close();dialog.remove();});$('#managedPawNotice')?.remove();$('#managedNotificationBanner')?.remove();clearTimeout(managedPresentationTimer);managedPresentationQueue=[];}
let managedSnapshotOwner=null;
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='loanledger-v41224')return;
 const message=event.data;
 if(message.type==='notification-rules-updated'){loadManagedNotificationRules(true);return;}
 if(message.type==='session'&&message.state==='signed-out'){managedSnapshotOwner=null;managedPresentationIds.clear();clearManagedNotices();loadManagedNotificationRules(true);}
 if(message.type==='snapshot'){
  const owner=message.data.user.id,items=message.data.notifications||[];
  if(owner!==managedSnapshotOwner){clearManagedNotices();managedSnapshotOwner=owner;managedPresentationIds=new Set(items.map(item=>item.id));managedPresentationQueue=[];loadManagedNotificationRules(true);return;}
  for(const item of items)if(!managedPresentationIds.has(item.id)){managedPresentationIds.add(item.id);if(['banner','popup','paw'].includes(item.deliverySurface))managedPresentationQueue.push({...item,channel:item.deliverySurface,duration:item.displayDuration||10});}
  flushManagedNotificationQueue();
 }
});
document.addEventListener('visibilitychange',flushManagedNotificationQueue);
document.addEventListener('focusin',()=>{if(page==='login')loadManagedNotificationRules();});
const originalManagedRender=render;
render=()=>{originalManagedRender();if(page!=='login')flushManagedNotificationQueue();if(page==='login'&&(managedRulesOwner!=='guest'||!managedRulesReady))loadManagedNotificationRules();};
loadManagedNotificationRules();
