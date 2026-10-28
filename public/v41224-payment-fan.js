// Presentation only: every action opens an existing borrower screen.
(()=>{
 const desktop=matchMedia('(min-width:1024px)'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),motion=PaymentFanCore.motion;
 const paths={calendar:'M5 5h14v16H5Zm3-3v6m8-6v6M5 11h14',arrows:'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4',qr:'M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h3v3h-3Zm3 3h3v3h-3ZM12 3v3m0 6h3m-3 3v6m6-9h3',document:'M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6',card:'M3 6h18v14H3Zm0 4h18m-14 6h3m3 0h3'};
 const svg=key=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[key]+'"/></svg>';
 let dialog=null,phase='closed',owner=null,openedPage=null,trigger=null,returnFocus=null,timer=0,frame=0,generation=0,resizeFrame=0;
 const eligible=()=>!desktop.matches&&!!stagingData?.user&&page!=='login'&&!document.querySelector('#nav')?.classList.contains('hidden');
 function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='paymentFanDialog';dialog.className='payment-fan-dialog';dialog.dataset.phase='closed';dialog.setAttribute('aria-labelledby','paymentFanTitle');dialog.setAttribute('aria-modal','true');
  dialog.innerHTML='<h2 id="paymentFanTitle" class="payment-fan-sr">Payments quick actions</h2><nav class="payment-fan-actions" aria-label="Payment and loan shortcuts">'+PaymentFanCore.actions.map((a,i)=>'<button type="button" class="payment-fan-action" data-fan-page="'+a.page+'" style="--fan-delay:'+i*motion.stagger+'ms"><span class="payment-fan-icon">'+svg(a.icon)+'</span><span class="payment-fan-label">'+a.label+'</span></button>').join('')+'</nav><div class="payment-fan-brand" data-no-translate><div><img src="/favicon.svg" width="24" height="24" alt=""><strong>LoanLedger PH</strong></div><p>Your loans. Your records.<br>All in one place.</p></div><button type="button" class="payment-fan-close" aria-label="Close payments menu" autofocus><span class="payment-finder-border" aria-hidden="true"></span><span class="payment-fan-x" aria-hidden="true">×</span><span class="payment-fan-close-label">Close</span></button>';
  // Owner preference: the explicit × closes; neither the backdrop nor Escape dismisses.
  dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=[dialog.querySelector('.payment-fan-close'),...dialog.querySelectorAll('[data-fan-page]')].filter(button=>!button.disabled),index=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{event.stopPropagation();const action=event.target.closest('[data-fan-page]');if(action&&phase==='open')close(action.dataset.fanPage);else if(event.target.closest('.payment-fan-close'))phase==='closing'?open():close();});
  dialog.addEventListener('close',()=>{if(phase!=='closed')finish();});document.body.append(dialog);
 }
 function position(){
  if(!dialog?.open||!trigger)return;
  const rect=(trigger.querySelector('.ni')||trigger).getBoundingClientRect(),view=window.visualViewport,width=view?.width||innerWidth,height=view?.height||innerHeight;
  const geometry=PaymentFanCore.layout({width,height,anchorX:rect.left+rect.width/2,anchorY:rect.top+rect.height/2});
  dialog.classList.toggle('is-compact',geometry.compact);dialog.classList.toggle('is-tiny',geometry.tiny);
  const set=(name,value)=>dialog.style.setProperty('--fan-'+name,value+'px');set('anchor-x',geometry.anchorX);set('anchor-y',geometry.anchorY);set('icon-size',geometry.icon);set('label-gap',geometry.labelGap);set('brand-width',Math.max(84,geometry.logoWidth));set('brand-y',geometry.logoY);
  [...dialog.querySelectorAll('[data-fan-page]')].forEach((element,i)=>{const item=geometry.items[i];element.style.setProperty('--fan-x',item.x+'px');element.style.setProperty('--fan-y',item.y+'px');element.style.setProperty('--fan-label-width',item.labelWidth+'px');});
  // Reserve space for actual translated labels/font metrics, not just estimates.
  const brand=dialog.querySelector('.payment-fan-brand'),brandBox=brand.getBoundingClientRect();let minimumTop=0;
  for(const label of dialog.querySelectorAll('.payment-fan-action:nth-child(2) .payment-fan-label,.payment-fan-action:nth-child(4) .payment-fan-label')){const box=label.getBoundingClientRect();if(box.right>brandBox.left&&box.left<brandBox.right)minimumTop=Math.max(minimumTop,box.bottom+8);}
  if(phase==='open'&&minimumTop>brandBox.top){const shift=minimumTop-brandBox.top;if(brandBox.bottom+shift<geometry.anchorY-36)set('brand-y',geometry.logoY+shift);}
 }
 function queuePosition(){if(!resizeFrame)resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;position();});}
 function finish(destination){
  clearTimeout(timer);cancelAnimationFrame(frame);++generation;phase='closed';if(dialog?.open)dialog.close();if(dialog)dialog.dataset.phase='closed';document.body.classList.remove('payment-fan-visible');
  trigger?.setAttribute('aria-expanded','false');const focus=returnFocus;owner=null;openedPage=null;
  if(destination&&eligible()){go(destination);const heading=document.querySelector('#app h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  else if(focus?.isConnected&&page!=='login'&&!desktop.matches)focus.focus({preventScroll:true});
 }
 function close(destination){if(phase==='closed')return;clearTimeout(timer);cancelAnimationFrame(frame);const current=++generation;phase='closing';dialog.dataset.phase='closing';dialog.querySelectorAll('[data-fan-page]').forEach(b=>b.disabled=true);timer=setTimeout(()=>{if(current===generation)finish(destination)},reduced.matches?motion.reduced:motion.exit);}
 function open(){
  if(!eligible())return;
  ensure();if(!dialog.open&&document.querySelector('dialog[open]'))return;
  clearTimeout(timer);cancelAnimationFrame(frame);const current=++generation;
  if(phase==='closed'){trigger=document.querySelector('#nav button[data-page="payment"]');returnFocus=trigger;owner=stagingData.user.id;openedPage=page;document.activeElement?.matches('input,textarea,select')&&document.activeElement.blur();dialog.dataset.phase='initial';dialog.showModal();document.body.classList.add('payment-fan-visible');}
  phase='opening';trigger.setAttribute('aria-expanded','true');dialog.querySelectorAll('[data-fan-page]').forEach(b=>b.disabled=false);position();
  frame=requestAnimationFrame(()=>{if(current!==generation)return;phase='open';dialog.dataset.phase='open';queuePosition();dialog.querySelector('.payment-fan-close').focus({preventScroll:true});timer=setTimeout(()=>{if(current===generation)queuePosition()},motion.enter+4*motion.stagger+20);});
 }
 function sync(){const button=document.querySelector('#nav button[data-page="payment"]');if(button){button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','paymentFanDialog');button.setAttribute('aria-expanded',String(phase!=='closed'));}if(phase!=='closed'&&(!eligible()||stagingData?.user.id!==owner||page!==openedPage))finish();}
 document.addEventListener('click',event=>{const button=event.target.closest('#nav button[data-page="payment"]');if(!button||!eligible())return;event.preventDefault();event.stopImmediatePropagation();phase==='closed'||phase==='closing'?open():close();},true);
 window.addEventListener('loanledger-screen-rendered',sync);window.addEventListener('resize',queuePosition);window.visualViewport?.addEventListener('resize',queuePosition);window.visualViewport?.addEventListener('scroll',queuePosition);desktop.addEventListener('change',()=>{sync();queuePosition();});reduced.addEventListener('change',queuePosition);sync();
})();
