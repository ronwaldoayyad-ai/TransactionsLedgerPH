// Only incoming, unread lender messages for the signed-in borrower count.
function dashboardOrbitUnreadCount(messages,ownerId){return ownerId&&Array.isArray(messages)?messages.filter(message=>message&&message.borrowerId===ownerId&&message.fromAdmin===true&&!message.readAt).length:0;}
function dashboardOrbitBadgeText(count){return count>99?'99+':String(count);}
// Dashboard presentation only. Each destination uses its existing UI/actions.
const dashboardOrbitMotion=Object.freeze({enter:350,feedback:180,exit:220,reduced:80,stagger:60});
let dashboardOrbitRoot=null,dashboardOrbitDialog=null,dashboardOrbitPhase='closed',dashboardOrbitFrame=0,dashboardOrbitOwner=null;
const dashboardOrbitIcons={
 finder:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 assistant:'<path d="M8 4V2m8 2V2M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><path d="M8 15c2 2 6 2 8 0"/><path d="M8 10h.01M16 10h.01"/>',
 lender:'<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 10h10M7 14h6"/>'
};
function dashboardOrbitSvg(kind){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+dashboardOrbitIcons[kind]+'</svg>';}
function dashboardOrbitEligible(){return borrowerShortcutsVisible();}
function dashboardOrbitReduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches;}
function ensureDashboardOrbit(){
 if(dashboardOrbitRoot)return;
 dashboardOrbitDialog=document.createElement('dialog');dashboardOrbitDialog.id='dashboardOrbitDialog';dashboardOrbitDialog.className='dashboard-orbit-dialog';dashboardOrbitDialog.setAttribute('aria-labelledby','dashboardOrbitTitle');
 dashboardOrbitDialog.innerHTML='<h2 id="dashboardOrbitTitle" class="orbit-sr-only">Dashboard shortcuts</h2><div class="dashboard-orbit-shade" aria-hidden="true"></div>';
 dashboardOrbitRoot=document.createElement('div');dashboardOrbitRoot.id='dashboardOrbit';dashboardOrbitRoot.className='dashboard-orbit';
 dashboardOrbitRoot.style.setProperty('--orbit-enter',dashboardOrbitMotion.enter+'ms');dashboardOrbitRoot.style.setProperty('--orbit-feedback',dashboardOrbitMotion.feedback+'ms');dashboardOrbitRoot.style.setProperty('--orbit-exit',dashboardOrbitMotion.exit+'ms');dashboardOrbitRoot.style.setProperty('--orbit-stagger',dashboardOrbitMotion.stagger+'ms');
 dashboardOrbitRoot.innerHTML='<button type="button" id="dashboardOrbitTrigger" class="finder-orb siri-animation dashboard-orbit-trigger" aria-label="Open Dashboard shortcuts" aria-haspopup="dialog" aria-expanded="false" aria-controls="dashboardOrbitDialog" onclick="toggleDashboardOrbit()"><span class="rainbow-container" aria-hidden="true"><span class="green"></span><span class="pink"></span><span class="blue"></span></span><span id="dashboardOrbitMascot" class="orbit-mascot chat-launcher-companion" aria-hidden="true"></span><span class="orbit-dismiss" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span><span class="orbit-idle-spark" aria-hidden="true">✦</span></button><nav class="dashboard-orbit-actions" aria-label="Quick actions" inert>'+[['finder','Finder'],['assistant','Pawcheebels'],['lender','Message lender']].map(([key,label],index)=>'<button type="button" class="dashboard-orbit-action orbit-'+key+'" data-orbit-action="'+key+'" style="--orbit-index:'+index+'" onclick="selectDashboardOrbit(\''+key+'\',this)"><span class="orbit-action-content"><span class="orbit-action-icon">'+dashboardOrbitSvg(key)+'</span><span>'+label+'</span></span></button>').join('')+'</nav>';
 for(const [selector,id] of [['#dashboardOrbitTrigger','dashboardOrbitUnread'],['[data-orbit-action="lender"]','dashboardOrbitLenderUnread']]){
  const badge=document.createElement('span');badge.id=id;badge.className='orbit-unread-badge';badge.hidden=true;badge.setAttribute('aria-hidden','true');dashboardOrbitRoot.querySelector(selector).append(badge);
 }
 document.body.append(dashboardOrbitDialog,dashboardOrbitRoot);
 dashboardOrbitDialog.addEventListener('cancel',event=>{event.preventDefault();closeDashboardOrbit();});
 dashboardOrbitDialog.addEventListener('click',event=>{if(event.target===dashboardOrbitDialog||event.target.classList.contains('dashboard-orbit-shade'))closeDashboardOrbit();});
 dashboardOrbitDialog.addEventListener('keydown',event=>{
  const buttons=[...dashboardOrbitRoot.querySelectorAll('[data-orbit-action]')],index=buttons.indexOf(document.activeElement);
  const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];
  if(step||event.key==='Home'||event.key==='End'){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:index<0?0:(index+step+buttons.length)%buttons.length;buttons[next].focus({preventScroll:true});}
 });
 dashboardOrbitDialog.addEventListener('close',()=>{if(dashboardOrbitPhase!=='closed')finishDashboardOrbitClose(false);});
}
function positionDashboardOrbit(){
 if(!dashboardOrbitRoot||dashboardOrbitRoot.hidden)return;
 const screen=$('.phone-screen')?.getBoundingClientRect(),nav=$('#nav')?.getBoundingClientRect(),view=window.visualViewport;
 const left=Math.max(screen?.left||0,view?.offsetLeft||0),right=Math.min(screen?.right||innerWidth,(view?.offsetLeft||0)+(view?.width||innerWidth));
 const top=Math.max(12,view?.offsetTop||0),bottom=Math.min(nav?.top||innerHeight,(view?.offsetTop||0)+(view?.height||innerHeight));
 const x=Math.max(left+12,right-76),y=Math.max(top+12,bottom-78);
 dashboardOrbitRoot.style.left=x+'px';dashboardOrbitRoot.style.top=y+'px';
 const room=x+30-left-82;
 dashboardOrbitRoot.style.setProperty('--orbit-left-x',-Math.min(140,Math.max(100,room))+'px');
 dashboardOrbitRoot.style.setProperty('--orbit-mid-x',-Math.min(100,Math.max(80,room-22))+'px');
 const up=Math.max(90,Math.min(144,y-top-26));dashboardOrbitRoot.style.setProperty('--orbit-up-y',-up+'px');dashboardOrbitRoot.style.setProperty('--orbit-mid-y',-Math.round(up*2/3)+'px');
}
function syncDashboardOrbitUnread(){
 if(!dashboardOrbitRoot)return;
 const count=dashboardOrbitEligible()?dashboardOrbitUnreadCount(stagingData?.messages,stagingData?.user?.id):0;
 for(const id of ['#dashboardOrbitUnread','#dashboardOrbitLenderUnread']){const badge=dashboardOrbitRoot.querySelector(id);badge.hidden=count===0;badge.textContent=count?dashboardOrbitBadgeText(count):'';}
 const filipino=preferredLanguage==='Filipino',expanded=dashboardOrbitPhase!=='closed';
 const unread=count?(filipino?count+' hindi pa nababasang mensahe mula sa nagpapahiram':count+' unread '+(count===1?'message':'messages')+' from lender'):'';
 const action=filipino?(expanded?'Isara ang mga shortcut':'Buksan ang mga shortcut'):(expanded?'Close Dashboard shortcuts':'Open Dashboard shortcuts');
 dashboardOrbitRoot.querySelector('#dashboardOrbitTrigger').setAttribute('aria-label',action+(unread?', '+unread:''));
 dashboardOrbitRoot.querySelector('[data-orbit-action="lender"]').setAttribute('aria-label',(filipino?'Magpadala ng mensahe sa nagpapahiram':'Message lender')+(unread?', '+unread:''));
}
function syncDashboardOrbit(){
 const eligible=dashboardOrbitEligible();document.body.classList.toggle('dashboard-orbit-enabled',eligible);
 if(!eligible){if(dashboardOrbitRoot){closeDashboardOrbit(true);dashboardOrbitRoot.hidden=true;syncDashboardOrbitUnread();}dashboardOrbitOwner=null;return;}
 ensureDashboardOrbit();
 if(dashboardOrbitOwner&&dashboardOrbitOwner!==stagingData.user.id)closeDashboardOrbit(true);
 dashboardOrbitOwner=stagingData.user.id;dashboardOrbitRoot.hidden=!finderCompact;syncDashboardOrbitUnread();
 const mascot=$('#dashboardOrbitMascot');let source=$('#chatWidgetMount .chat-cat-mascot');
 // The orb owns its avatar even when the chat panel is not mounted.
 if(!source&&!mascot.firstElementChild){const template=document.createElement('template');template.innerHTML=floatingMessagesWidget();source=template.content.querySelector('.chat-cat-mascot');}
 if(source&&!mascot.firstElementChild)mascot.append(source.cloneNode(true));
 dashboardOrbitRoot.classList.toggle('without-mascot',!mascot.firstElementChild);
 positionDashboardOrbit();
 if(chatWidgetOpen)positionChatWidget();
}
function queueDashboardOrbit(){if(dashboardOrbitFrame)return;dashboardOrbitFrame=requestAnimationFrame(()=>{dashboardOrbitFrame=0;positionDashboardOrbit();if(chatWidgetOpen)positionChatWidget();positionPawProactiveBubble();});}
function toggleDashboardOrbit(){if(dashboardOrbitPhase==='closed')openDashboardOrbit();else closeDashboardOrbit();}
function openDashboardOrbit(){
 if(!dashboardOrbitEligible()||dashboardOrbitPhase!=='closed')return;
 if(chatWidgetOpen)toggleChatWidget();
 if(!finderCompact)setFinderCompact(true);
 syncDashboardOrbit();removePawProactiveBubble();
 dashboardOrbitPhase='opening';dashboardOrbitDialog.append(dashboardOrbitRoot);positionDashboardOrbit();
 const actions=dashboardOrbitRoot.querySelector('nav');actions.inert=false;
 dashboardOrbitRoot.querySelectorAll('[data-orbit-action]').forEach(button=>button.classList.remove('is-selected'));
 dashboardOrbitDialog.showModal();document.body.classList.add('dashboard-orbit-open');
 const trigger=$('#dashboardOrbitTrigger');trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-label','Close Dashboard shortcuts');
 // Commit the collapsed geometry before starting the fan. No layout animates.
 void dashboardOrbitRoot.offsetWidth;
 requestAnimationFrame(()=>{if(dashboardOrbitPhase!=='opening')return;dashboardOrbitPhase='open';dashboardOrbitDialog.classList.add('is-open');dashboardOrbitRoot.classList.add('is-expanded');dashboardOrbitRoot.querySelector('[data-orbit-action]')?.focus({preventScroll:true});});
 applyBorrowerLanguage();syncDashboardOrbitUnread();queuePawProactive();
}
function finishDashboardOrbitClose(restoreFocus){
 dashboardOrbitPhase='closed';dashboardOrbitDialog.classList.remove('is-open');dashboardOrbitRoot.classList.remove('is-expanded');document.body.classList.remove('dashboard-orbit-open');
 dashboardOrbitRoot.querySelector('nav').inert=true;
 if(dashboardOrbitDialog.open)dashboardOrbitDialog.close();
 document.body.append(dashboardOrbitRoot);
 const trigger=$('#dashboardOrbitTrigger');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','Open Dashboard shortcuts');
 syncDashboardOrbitUnread();
 if(restoreFocus&&dashboardOrbitEligible())trigger.focus({preventScroll:true});
 queuePawProactive();
}
async function closeDashboardOrbit(immediate=false,restoreFocus=true){
 if(!dashboardOrbitRoot||dashboardOrbitPhase==='closed')return;
 if(immediate){finishDashboardOrbitClose(false);return;}
 if(dashboardOrbitPhase==='closing'||dashboardOrbitPhase==='selecting')return;
 dashboardOrbitPhase='closing';dashboardOrbitDialog.classList.remove('is-open');dashboardOrbitRoot.classList.remove('is-expanded');dashboardOrbitRoot.querySelector('nav').inert=true;
 await new Promise(resolve=>setTimeout(resolve,dashboardOrbitReduced()?dashboardOrbitMotion.reduced:dashboardOrbitMotion.exit));
 if(dashboardOrbitPhase==='closing')finishDashboardOrbitClose(restoreFocus);
}
async function selectDashboardOrbit(destination,button){
 if(dashboardOrbitPhase!=='open'||!dashboardOrbitIcons[destination])return;
 const owner=dashboardOrbitOwner;dashboardOrbitPhase='selecting';button.classList.add('is-selected');
 const reduced=dashboardOrbitReduced();
 if(!reduced)button.querySelector('.orbit-action-content').animate([{transform:'scale(1)'},{transform:'scale(.95)',offset:.4},{transform:'scale(1)'}],{duration:dashboardOrbitMotion.feedback,easing:'cubic-bezier(.22,1,.36,1)'});
 await new Promise(resolve=>setTimeout(resolve,reduced?dashboardOrbitMotion.reduced:dashboardOrbitMotion.feedback));
 if(!dashboardOrbitEligible()||dashboardOrbitOwner!==owner||dashboardOrbitPhase!=='selecting')return;
 dashboardOrbitPhase='open';await closeDashboardOrbit(false,false);
 if(!dashboardOrbitEligible()||dashboardOrbitOwner!==owner)return;
 if(destination==='finder'){setFinderCompact(false);return;}
 stopPawProactive();pawMode=destination==='lender'?'lender':'assistant';
 // Reuse the full conversation here so composer IDs remain unique.
 if(page==='messages'||page==='faq'){pawMessagesMode=pawMode;if(page!=='messages')go('messages');else render();return;}
 chatWidgetOpen=true;render();setChatMascotState('thinking');
 if(pawMode==='lender'&&stagingData.messages.some(message=>message.fromAdmin&&!message.readAt))mobileCall('message-read').catch(error=>toast(error.message));
 requestAnimationFrame(()=>$(pawMode==='assistant'?'#pawQuestion':'#chatDraft')?.focus({preventScroll:true}));
}
const orbitOriginalPositionChat=positionChatWidget;
positionChatWidget=()=>{
 if(!dashboardOrbitEligible()||!dashboardOrbitRoot)return orbitOriginalPositionChat();
 const mount=$('#chatWidgetMount'),root=mount?.querySelector('.chat-widget');if(!mount||!root)return;
 const m=mount.getBoundingClientRect(),anchor=dashboardOrbitRoot.getBoundingClientRect(),sx=m.width/Math.max(1,mount.clientWidth)||1,sy=m.height/Math.max(1,mount.clientHeight)||1;
 root.style.left=(anchor.left-m.left)/sx+'px';root.style.top=(anchor.top-m.top)/sy+'px';root.style.right='auto';root.style.bottom='auto';
 if(chatWidgetOpen)positionChatPanel(root);
};
const orbitOriginalChatBounds=chatPanelBounds;
chatPanelBounds=mount=>{
 if(!dashboardOrbitEligible()||!dashboardOrbitRoot)return orbitOriginalChatBounds(mount);
 const frame=mount.getBoundingClientRect(),sy=frame.height/Math.max(1,mount.clientHeight)||1;
 return {bottom:Math.max(0,(dashboardOrbitRoot.getBoundingClientRect().top-frame.top)/sy-12)};
};
const orbitOriginalMascotState=setChatMascotState;
setChatMascotState=state=>{orbitOriginalMascotState(state);const avatar=$('#dashboardOrbitMascot');if(avatar)avatar.dataset.mood=state;};
const orbitOriginalFinderCompact=setFinderCompact;
setFinderCompact=compact=>{orbitOriginalFinderCompact(compact);syncDashboardOrbit();if(compact&&dashboardOrbitPhase==='closed')requestAnimationFrame(()=>$('#dashboardOrbitTrigger')?.focus({preventScroll:true}));};
const orbitOriginalToggleChat=toggleChatWidget;
toggleChatWidget=()=>{orbitOriginalToggleChat();syncDashboardOrbit();if(!chatWidgetOpen)$('#dashboardOrbitTrigger')?.focus({preventScroll:true});};
const orbitOriginalRender=render;render=()=>{orbitOriginalRender();syncDashboardOrbit();};
const orbitOriginalGo=go;go=destination=>{if(destination!==page){closeDashboardOrbit(true,false);chatWidgetOpen=false;finderCompact=true;}orbitOriginalGo(destination);syncDashboardOrbit();};
window.addEventListener('resize',queueDashboardOrbit);window.visualViewport?.addEventListener('resize',queueDashboardOrbit);window.visualViewport?.addEventListener('scroll',queueDashboardOrbit);
window.addEventListener('pagehide',()=>{closeDashboardOrbit(true,false);cancelAnimationFrame(dashboardOrbitFrame);dashboardOrbitFrame=0;});
window.addEventListener('pageshow',syncDashboardOrbit);
syncDashboardOrbit();
