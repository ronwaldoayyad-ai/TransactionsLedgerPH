// Curated invitations, scoped to a signed-in tab session. No AI requests or
// account lookups are made until the user asks a question in the existing chat.
const pawProactiveMessages={
 welcome:[
  ['hello','Hi! I’m Pawcheebels. Need help finding your way around?'],
  ['guide','Need a hand? I can explain app features and guide you through payment-proof submission.'],
  ['features','Your app guide is here! Tap me for questions about payments, schedules, or using LoanLedger PH.'],
  ['greet','Hi there! You can ask me about the app or just say hello.']
 ],
 reminder:[
  ['proof','Need help submitting payment proof? Tap me and I’ll guide you through the steps.'],
  ['schedule','Questions about installment schedules? I can help you understand where to find them.'],
  ['anytime','You can chat with me anytime. For account-specific concerns, I’ll point you to your lender.'],
  ['available','I’m here if you need help with LoanLedger PH. What would you like to know?']
 ]
};
const pawProactiveStorage='loanledger-paw-proactive-v1';
function pawProactiveLauncher(){return document.querySelector('#dashboardOrbitTrigger')||document.querySelector('.chat-widget-launcher');}
let pawProactiveOwner=null,pawProactiveState=null,pawProactiveBridgeReady=!!stagingData,
 pawProactiveTimer=0,pawProactiveFrame=0,pawProactiveActive=null,
 pawProactiveWelcomeAt=0,pawProactiveLastActivity=Date.now(),pawProactiveLastMove=0;
function persistPawProactive(){try{if(pawProactiveState)sessionStorage.setItem(pawProactiveStorage,JSON.stringify(pawProactiveState));}catch{}}
function removePawProactiveBubble(){const bubble=$('#pawProactiveBubble'),focused=bubble?.contains(document.activeElement);bubble?.remove();pawProactiveActive=null;if(focused&&page==='dashboard')pawProactiveLauncher()?.focus({preventScroll:true});}
function resetPawProactiveSession(){clearTimeout(pawProactiveTimer);cancelAnimationFrame(pawProactiveFrame);pawProactiveTimer=0;pawProactiveFrame=0;removePawProactiveBubble();pawProactiveOwner=null;pawProactiveState=null;pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();try{sessionStorage.removeItem(pawProactiveStorage);}catch{}}
function syncPawProactiveOwner(){const owner=stagingData?.user?.id||null;if(!owner)return false;if(owner===pawProactiveOwner)return true;clearTimeout(pawProactiveTimer);removePawProactiveBubble();pawProactiveOwner=owner;let saved=null;try{saved=JSON.parse(sessionStorage.getItem(pawProactiveStorage)||'null');}catch{}pawProactiveState=saved?.owner===owner?{owner,welcomeShown:saved.welcomeShown===true,reminderShown:saved.reminderShown===true,stopped:saved.stopped===true}:{owner,welcomeShown:false,reminderShown:false,stopped:false};pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();persistPawProactive();return true;}
function stopPawProactive(){if(!syncPawProactiveOwner())return;if(!pawProactiveState.stopped){pawProactiveState.stopped=true;persistPawProactive();}clearTimeout(pawProactiveTimer);pawProactiveTimer=0;removePawProactiveBubble();}
function pawProactiveEligible(){
 if(!stagingData?.user||stagingData.user.id!==pawProactiveOwner||stagingData.user.status==='disabled'||page!=='dashboard'||!chatMascotEnabled||!pawProactiveBridgeReady||chatWidgetOpen||document.hidden||document.body.inert)return false;
 if(loadingTasks.size||generalProcessTasks.size||document.querySelector('dialog[open],#finderResultsOverlay,#recentProofModal,#invoicePdfModal,#disbursementPreviewModal'))return false;
 if(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'))return false;
 try{if(parent.document.hidden||parent.document.querySelector('#authenticatedMatrix,#appProcessingFeedback,dialog[open]'))return false;}catch{return false;}
 const launcher=pawProactiveLauncher();if(!launcher||launcher.inert||getComputedStyle(launcher).visibility==='hidden')return false;
 const box=launcher.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>0&&box.top<innerHeight;
}
function positionPawProactiveBubble(){
 const bubble=$('#pawProactiveBubble'),launcher=pawProactiveLauncher();if(!bubble||!launcher)return;
 const anchor=launcher.getBoundingClientRect(),screen=$('.phone-screen')?.getBoundingClientRect(),nav=$('#nav')?.getBoundingClientRect(),visual=window.visualViewport;
 const leftBound=Math.max(12,screen?.left||0,visual?.offsetLeft||0),rightBound=Math.min(innerWidth-12,(screen?.right||innerWidth)-12,(visual?.offsetLeft||0)+(visual?.width||innerWidth)-12);
 bubble.style.width=Math.max(0,Math.min(260,rightBound-leftBound))+'px';
 const height=bubble.offsetHeight,width=bubble.offsetWidth,left=Math.max(leftBound,Math.min(rightBound-width,anchor.right-width)),topBound=Math.max(12,visual?.offsetTop||0),bottomBound=Math.min((nav?.top||innerHeight)-12,(visual?.offsetTop||0)+(visual?.height||innerHeight)-12),above=anchor.top-height-12>=topBound;
 const top=Math.max(topBound,Math.min(bottomBound-height,above?anchor.top-height-12:anchor.bottom+12));
 bubble.style.left=left+'px';bubble.style.top=top+'px';bubble.classList.toggle('is-above',above);bubble.style.setProperty('--paw-tail',Math.max(18,Math.min(width-18,anchor.left+anchor.width/2-left))+'px');
}
function choosePawProactiveMessage(stage){let previous='';try{previous=sessionStorage.getItem('loanledger-paw-last-'+stage)||'';}catch{}const pool=pawProactiveMessages[stage].filter(([id])=>id!==previous),chosen=pool[Math.floor(Math.random()*pool.length)];try{sessionStorage.setItem('loanledger-paw-last-'+stage,chosen[0]);}catch{}return chosen;}
function showPawProactiveBubble(stage){
 if(!pawProactiveEligible()||pawProactiveState?.stopped)return false;const [id,message]=choosePawProactiveMessage(stage),bubble=document.createElement('aside');bubble.id='pawProactiveBubble';bubble.className='paw-proactive-bubble';bubble.setAttribute('aria-label','Pawcheebels invitation');
 bubble.innerHTML='<button type="button" class="paw-proactive-open" onclick="openPawProactiveChat()" aria-label="Chat with Pawcheebels"><span class="paw-proactive-name">Pawcheebels <i aria-hidden="true">✦</i></span><span class="paw-proactive-message" role="status" aria-live="polite" aria-atomic="true">'+htmlSafe(message)+'</span><span class="paw-proactive-cta">Let’s chat <span aria-hidden="true">↗</span></span></button><button type="button" class="paw-proactive-dismiss" onclick="stopPawProactive()" aria-label="Dismiss Pawcheebels invitations for this session">'+transferSvg('close')+'</button>';
 document.body.append(bubble);pawProactiveActive={stage,id,expiresAt:Date.now()+(typeof managedPawDuration==='function'?managedPawDuration():10000)};pawProactiveState[stage==='welcome'?'welcomeShown':'reminderShown']=true;if(stage==='welcome')pawProactiveLastActivity=Date.now();persistPawProactive();positionPawProactiveBubble();setChatMascotState('waving');applyBorrowerLanguage();return true;
}
function openPawProactiveChat(){
 if(!pawProactiveEligible()||!pawProactiveActive)return;stopPawProactive();pawMode='assistant';chatWidgetOpen=true;render();setChatMascotState('thinking');requestAnimationFrame(()=>$('#pawQuestion')?.focus({preventScroll:true}));
}
function reconcilePawProactive(){
 clearTimeout(pawProactiveTimer);pawProactiveTimer=0;if(!pawProactiveBridgeReady||!syncPawProactiveOwner()){removePawProactiveBubble();pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();return;}
 if(chatWidgetOpen||page==='messages'){stopPawProactive();return;}
 if(pawProactiveState.stopped||!chatMascotEnabled||page!=='dashboard'){removePawProactiveBubble();pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();return;}
 const schedule=delay=>pawProactiveTimer=setTimeout(reconcilePawProactive,Math.max(40,Math.min(60000,delay)));
 if(!pawProactiveEligible()){removePawProactiveBubble();pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();if(!document.hidden)schedule(500);return;}
 const now=Date.now();
 if(pawProactiveActive){
  positionPawProactiveBubble();if(now>=pawProactiveActive.expiresAt&&!$('#pawProactiveBubble')?.contains(document.activeElement))removePawProactiveBubble();else{schedule(Math.min(500,Math.max(100,pawProactiveActive.expiresAt-now)));return;}
 }
 if(!pawProactiveState.welcomeShown){if(!pawProactiveWelcomeAt)pawProactiveWelcomeAt=now+(typeof managedPawTiming==='function'?managedPawTiming('welcome'):2000);if(now<pawProactiveWelcomeAt){schedule(pawProactiveWelcomeAt-now);return;}showPawProactiveBubble('welcome');schedule(500);return;}
 if(pawProactiveState.reminderShown)return;
 const remaining=(typeof managedPawTiming==='function'?managedPawTiming('reminder'):120000)-(now-pawProactiveLastActivity);if(remaining>0){schedule(remaining);return;}showPawProactiveBubble('reminder');schedule(500);
}
function queuePawProactive(){if(pawProactiveFrame)return;pawProactiveFrame=requestAnimationFrame(()=>{pawProactiveFrame=0;reconcilePawProactive();});}
function pawProactiveActivity(event){if(!event.isTrusted||page!=='dashboard')return;const now=Date.now();if(event.type==='pointermove'&&now-pawProactiveLastMove<500)return;if(event.type==='pointermove')pawProactiveLastMove=now;pawProactiveLastActivity=now;queuePawProactive();}
for(const kind of ['pointerdown','pointermove','keydown','input','wheel','scroll'])document.addEventListener(kind,pawProactiveActivity,{passive:true,capture:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&pawProactiveActive){event.preventDefault();stopPawProactive();}});
document.addEventListener('focusin',event=>{if(event.target.closest?.('.chat-widget-panel,.paw-card'))stopPawProactive();else queuePawProactive();});document.addEventListener('focusout',queuePawProactive);
document.addEventListener('visibilitychange',()=>{pawProactiveLastActivity=Date.now();pawProactiveWelcomeAt=0;queuePawProactive();});
window.addEventListener('resize',queuePawProactive);window.visualViewport?.addEventListener('resize',queuePawProactive);window.visualViewport?.addEventListener('scroll',queuePawProactive);
const pawProactiveDOMObserver=new MutationObserver(queuePawProactive);
let pawProactiveParentObserver=null;
function observePawProactiveDOM(){pawProactiveDOMObserver.observe(document.body,{childList:true,subtree:true});try{if(parent!==window){if(!pawProactiveParentObserver)pawProactiveParentObserver=new MutationObserver(queuePawProactive);pawProactiveParentObserver.observe(parent.document.getElementById('root')||parent.document.body,{childList:true,subtree:true});}}catch{}}
observePawProactiveDOM();
const toggleBeforePawProactive=toggleChatWidget;toggleChatWidget=()=>{if(!chatWidgetOpen)stopPawProactive();toggleBeforePawProactive();queuePawProactive();};
const askBeforePawProactive=askFAQ;askFAQ=id=>{stopPawProactive();askBeforePawProactive(id);};
const goBeforePawProactive=go;go=destination=>{if(destination==='login'&&stagingData)stopPawProactive();removePawProactiveBubble();pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();goBeforePawProactive(destination);queuePawProactive();};
const renderBeforePawProactive=render;render=()=>{renderBeforePawProactive();queuePawProactive();};
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='loanledger-v41224')return;const message=event.data;if(message.type==='session'){pawProactiveBridgeReady=false;if(message.state==='signed-out'||message.state==='blocked')resetPawProactiveSession();queuePawProactive();}else if(message.type==='snapshot'){pawProactiveBridgeReady=true;queuePawProactive();}});
window.addEventListener('pagehide',()=>{pawProactiveDOMObserver.disconnect();pawProactiveParentObserver?.disconnect();clearTimeout(pawProactiveTimer);cancelAnimationFrame(pawProactiveFrame);pawProactiveTimer=0;pawProactiveFrame=0;removePawProactiveBubble();});window.addEventListener('pageshow',()=>{pawProactiveWelcomeAt=0;pawProactiveLastActivity=Date.now();observePawProactiveDOM();queuePawProactive();});
queuePawProactive();
