function borrowerAccountNumber(user=stagingData?.user){const number=String(user?.accountNumber||'');return /^\d{10,}$/.test(number)?number:'Not assigned';}
const borrowerAccountHideTimers=new Map(),borrowerAccountDisplayStates=new WeakMap();
function borrowerAccountIcon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(name==='copy'?'<rect x="9" y="9" width="11" height="12" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/>':'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')+'</svg>';}
function borrowerAccountMasked(number){return /^\d{10,}$/.test(number)?'•••• '+number.slice(-4):'Not assigned';}
function borrowerAccountDisplayHTML(label='Borrower account'){
 const number=borrowerAccountNumber(),assigned=/^\d{10,}$/.test(number);
 return '<span class="borrower-account-display" data-revealed="false"><span class="borrower-account-label">'+htmlSafe(label)+' ·</span><span class="borrower-account-reference"><span class="borrower-account-value">'+borrowerAccountMasked(number)+'</span>'+(assigned?'<button type="button" class="borrower-account-action" aria-label="Reveal borrower account number" title="Reveal account number" onclick="handleBorrowerAccountAction(event,this)">'+borrowerAccountIcon('eye')+'</button>':'')+'</span></span>';
}
function maskBorrowerAccountDisplay(root){
 clearTimeout(borrowerAccountHideTimers.get(root));borrowerAccountHideTimers.delete(root);
 const state=borrowerAccountDisplayStates.get(root);if(state)state.request++;
 if(!root?.isConnected)return;
 root.dataset.revealed='false';root.querySelector('.borrower-account-value').textContent=!state||state.owner===stagingData?.user?.id?borrowerAccountMasked(borrowerAccountNumber()):'••••';
 const button=root.querySelector('.borrower-account-action');if(button){button.disabled=false;button.removeAttribute('aria-busy');button.setAttribute('aria-label','Reveal borrower account number');button.title='Reveal account number';button.innerHTML=borrowerAccountIcon('eye');}
}
function resetBorrowerAccountDisplays(){
 for(const root of [...borrowerAccountHideTimers.keys()])maskBorrowerAccountDisplay(root);
 document.querySelectorAll('.borrower-account-display[data-revealed="true"]').forEach(maskBorrowerAccountDisplay);
}
async function handleBorrowerAccountAction(event,button){
 event?.preventDefault();event?.stopPropagation();const root=button.closest('.borrower-account-display'),owner=stagingData?.user?.id,number=borrowerAccountNumber();
 if(!root||button.disabled||!owner||!/^\d{10,}$/.test(number))return;
 let state=borrowerAccountDisplayStates.get(root);if(!state){state={owner,request:0};borrowerAccountDisplayStates.set(root,state);}
 if(state.owner!==owner){maskBorrowerAccountDisplay(root);return;}
 if(root.dataset.revealed!=='true'){
  state.request++;root.dataset.revealed='true';root.querySelector('.borrower-account-value').textContent=number;button.innerHTML=borrowerAccountIcon('copy');button.setAttribute('aria-label','Copy borrower account number');button.title='Copy account number; hides automatically after 4 seconds';borrowerAccountHideTimers.set(root,setTimeout(()=>maskBorrowerAccountDisplay(root),4000));return;
 }
 const request=++state.request;button.disabled=true;button.setAttribute('aria-busy','true');
 // The reveal deadline stays fixed even if a clipboard prompt is pending.
 const current=()=>root.isConnected&&stagingData?.user?.id===owner&&state.request===request;
 try{
  if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(number);
  else{const field=document.createElement('textarea');field.value=number;field.setAttribute('readonly','');field.setAttribute('aria-hidden','true');field.tabIndex=-1;field.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none';document.body.append(field);try{field.focus({preventScroll:true});field.select();if(!document.execCommand('copy'))throw Error('Clipboard unavailable');}finally{field.remove();if(current())button.focus({preventScroll:true});}}
  if(current())toast('Account number copied. It will hide shortly.');
 }catch{if(current())toast('Unable to copy the account number. Please try again.');}
 finally{if(current()){button.disabled=false;button.removeAttribute('aria-busy');}}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetBorrowerAccountDisplays();});
window.addEventListener('pagehide',resetBorrowerAccountDisplays);
