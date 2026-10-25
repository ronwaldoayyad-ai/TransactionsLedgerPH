let installmentPresentation='cards',installmentPresentationOwner=null;
const installmentDeckSelections=new Map();
function installmentStatusBadge(g){const loan=stagingLoans().find(l=>l.id===g[5]),state=loan?installmentGroupState(loan,stagingIndex().byLoan.get(loan.id)||[],localToday()):Number(g[3])>=100?'Fully Paid':installmentPastDueCount(g)>0?'Past Due':'In Progress';const tone={'Fully Paid':'is-paid','Refunded':'is-refunded','Past Due':'is-overdue'}[state]||'',label={'Fully Paid':'Fully paid','In Progress':'In progress'}[state]||state;return '<span class="installment-deck-status '+tone+'">'+label+'</span>';}
function decorateInstallmentList(host){host.querySelectorAll('.installment-group-row,.settings-row[onclick^="openInstallment("]').forEach(row=>{const index=Number(row.getAttribute('onclick')?.match(/openInstallment\((\d+)\)/)?.[1]),g=stagingGroups()[index];if(!g)return;row.querySelector('.schedule-overdue-label')?.remove();const copy=row.querySelector('.itext,.settings-copy'),title=copy?.querySelector('b');if(!title)return;const oldStatus=copy.querySelector('small[style^="color:"]');oldStatus?.remove();const heading=document.createElement('span');heading.className='installment-list-heading';title.before(heading);heading.append(title);heading.insertAdjacentHTML('beforeend',installmentStatusBadge(g));});}
function installmentViewControl(){return '<div class="installment-view-control" role="group" aria-label="Installment view">'+[['list','List'],['cards','Cards']].map(([id,label])=>'<button type="button" aria-pressed="'+(installmentPresentation===id)+'" class="'+(installmentPresentation===id?'sel':'')+'" onclick="setInstallmentPresentation(\''+id+'\')">'+label+'</button>').join('')+'</div>';}
function setInstallmentPresentation(value){if(!['list','cards'].includes(value)||value===installmentPresentation)return;installmentPresentation=value;render();}
function installmentDeckHTML(entries,key){
 if(!entries.length)return '<div class="glass empty-state">No installment groups to show.</div>';
 return '<section class="installment-deck" data-deck="'+key+'" aria-label="Installment cards"><p class="installment-deck-hint">Swipe left or right, or use the arrows. Tap a card to view its schedule.</p><div class="installment-deck-stage" role="region" aria-roledescription="carousel" aria-label="Installment plans">'+entries.map(({group:g,index,loan})=>{
  const progress=Math.max(0,Math.min(100,Number(g[3])||0)),cashLoan=stagingCategory(loan)==='cash_loan';
  return '<button type="button" class="installment-deck-card'+(cashLoan?' installment-deck-card--cash':'')+'" data-loan="'+htmlSafe(loan.id)+'" data-index="'+index+'" onclick="openInstallmentDeckCard(event,this)"><span class="installment-deck-top">'+(cashLoan?'':'<span>'+htmlSafe(loanProfileCategory(g))+'</span>')+installmentStatusBadge(g)+'</span><h3 data-no-translate>'+g[0]+'</h3><small>Original installment amount</small><strong class="installment-deck-amount">'+g[1]+'</strong><p>'+g[2]+'</p><p class="transaction-date-label"><span>Transaction Date</span> · '+g[4]+'</p><span class="group-progress" role="progressbar" aria-label="Payment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress+'"><span style="width:'+progress+'%"></span></span><span class="installment-deck-bottom"><span>'+progress+'% paid</span><span>View schedule ›</span></span></button>';
 }).join('')+'</div><div class="installment-deck-navigation"><button type="button" data-step="-1" aria-label="Previous installment">‹</button><span class="installment-deck-position" role="status" aria-live="polite"></span><button type="button" data-step="1" aria-label="Next installment">›</button></div></section>';
}
const listInstallmentGroupCards=installmentGroupCards;
installmentGroupCards=()=>{
 const html=listInstallmentGroupCards(),host=document.createElement('div');host.innerHTML=html;
 const tabs=host.querySelector('.installment-category-tabs');tabs?.insertAdjacentHTML('afterend',installmentViewControl());
 if(installmentPresentation==='cards'){
  host.querySelectorAll('.installment-category-section').forEach(section=>section.remove());
  const entries=stagingVisibleGroups(),totals=[['cash_loan','Cash Loan'],['retail_installment','Retail Installments']].filter(([key])=>installmentCategoryFilter==='all'||installmentCategoryFilter===key).map(([key,title])=>'<div><span>'+title+'</span>'+transactionTotalHTML(displayedAmountTotal(entries.filter(entry=>stagingCategory(entry.loan)===key).map(entry=>entry.loan.principal)))+'</div>').join('');
  host.insertAdjacentHTML('beforeend','<div class="installment-card-totals" aria-label="Matching installment amounts">'+totals+'</div>'+installmentDeckHTML(entries,'transactions'));
 }
 decorateInstallmentList(host);return host.innerHTML;
};
const listLoanProfile=loanProfile;
loanProfile=()=>{
 const host=document.createElement('div');host.innerHTML=listLoanProfile();host.querySelector('.loan-profile-hero')?.insertAdjacentHTML('afterend',installmentViewControl());
 if(installmentPresentation==='cards')host.querySelectorAll('.section').forEach((section,n)=>{
  const title=section.querySelector('h2')?.textContent,list=section.querySelector('.settings-list');if(!list)return;
  const entries=stagingGroups().map((group,index)=>({group,index,loan:stagingLoans()[index]})).filter(x=>loanProfileCategory(x.group)===title).sort((a,b)=>stagingCompareProfileGroups({g:a.group,index:a.index},{g:b.group,index:b.index}));
  list.outerHTML=installmentDeckHTML(entries,'profile-'+n);
 });
 decorateInstallmentList(host);return host.innerHTML;
};
function openInstallmentDeckCard(event,card){const deck=card.closest('.installment-deck');if(!deck||performance.now()<(deck.suppressClickUntil||0)){event.preventDefault();return;}openInstallment(Number(card.dataset.index));}
function positionInstallmentDeck(deck,drag=0){
 const cards=[...deck.querySelectorAll('.installment-deck-card')],active=deck.activeIndex||0;
 cards.forEach((card,index)=>{const offset=index-active,distance=Math.abs(offset),visible=distance<=2;card.style.zIndex=String(10-distance);card.style.opacity=visible?String(distance?0.6-distance*0.12:1):'0';card.style.transform='translate3d('+(offset*15+(offset===0?drag:drag*.12))+'px,'+(distance*9)+'px,0) rotate('+(offset*3)+'deg) scale('+(1-distance*.045)+')';card.disabled=offset!==0;card.tabIndex=offset===0?0:-1;card.setAttribute('aria-hidden',String(offset!==0));});
 deck.querySelector('.installment-deck-position').textContent=(active+1)+' of '+cards.length;
 deck.querySelectorAll('[data-step]').forEach(button=>button.disabled=Number(button.dataset.step)<0?active===0:active===cards.length-1);
 installmentDeckSelections.set(deck.dataset.deck,cards[active]?.dataset.loan);
}
function selectInstallmentDeck(deck,index){const count=deck.querySelectorAll('.installment-deck-card').length;deck.activeIndex=Math.max(0,Math.min(count-1,index));positionInstallmentDeck(deck);}
function initializeInstallmentDecks(){
 document.querySelectorAll('.installment-deck').forEach(deck=>{
  if(deck.dataset.bound)return;deck.dataset.bound='true';const stage=deck.querySelector('.installment-deck-stage'),cards=[...stage.children],selected=installmentDeckSelections.get(deck.dataset.deck);
  deck.activeIndex=Math.max(0,cards.findIndex(card=>card.dataset.loan===selected));positionInstallmentDeck(deck);
  deck.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>selectInstallmentDeck(deck,deck.activeIndex+Number(button.dataset.step)));
  stage.onkeydown=event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();selectInstallmentDeck(deck,deck.activeIndex+(event.key==='ArrowRight'?1:-1));cards[deck.activeIndex]?.focus({preventScroll:true});}};
  let gesture=null,frame=0;
  stage.onpointerdown=event=>{const card=event.target.closest('.installment-deck-card');if(event.button!==0||!card||card.disabled)return;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,card,horizontal:false};card.setPointerCapture?.(event.pointerId);};
  stage.onpointermove=event=>{if(!gesture||event.pointerId!==gesture.id)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(!gesture.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}if(Math.abs(dx)>10)gesture.horizontal=true;if(!gesture.horizontal)return;event.preventDefault();deck.classList.add('is-dragging');cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>positionInstallmentDeck(deck,Math.max(-110,Math.min(110,dx))));};
  const end=event=>{if(!gesture||event.pointerId!==gesture.id)return;const current=gesture;gesture=null;cancelAnimationFrame(frame);deck.classList.remove('is-dragging');if(current.horizontal){deck.suppressClickUntil=performance.now()+350;const dx=event.clientX-current.x;if(event.type==='pointerup'&&Math.abs(dx)>40)selectInstallmentDeck(deck,deck.activeIndex+(dx<0?1:-1));else positionInstallmentDeck(deck);}else positionInstallmentDeck(deck);};
  stage.onpointerup=end;stage.onpointercancel=end;stage.onlostpointercapture=()=>{if(gesture){gesture=null;cancelAnimationFrame(frame);deck.classList.remove('is-dragging');positionInstallmentDeck(deck);}};
 });
}
const renderBeforeInstallmentDecks=render;
render=()=>{const owner=stagingData?.user?.id||null;if(owner!==installmentPresentationOwner){installmentPresentationOwner=owner;installmentPresentation='cards';installmentDeckSelections.clear();}renderBeforeInstallmentDecks();initializeInstallmentDecks();};
