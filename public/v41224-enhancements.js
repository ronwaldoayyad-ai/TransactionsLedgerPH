// Requested changes to the approved UI, using only the scoped staging payload.
const enhancementStyle=document.createElement('style');
enhancementStyle.textContent=`
.acknowledgement-dialog,.acknowledgement-dialog h2,.acknowledgement-dialog p,.acknowledgement-dialog .ack-close{color:var(--ink)!important}
.acknowledgement-dialog a{color:var(--blue)}body.dark .acknowledgement-dialog a{color:#8ebdff}
.head .avatar{width:38px!important;height:38px!important;min-width:38px;min-height:38px;overflow:hidden;display:block;line-height:38px;text-align:center}
.account-avatar{overflow:hidden;min-width:48px;min-height:48px;max-height:48px;display:block;line-height:48px;text-align:center}
.account-avatar.large{width:64px!important;height:64px!important;max-height:64px;line-height:64px}
.avatar img,.account-avatar img{width:100%!important;height:100%!important;max-width:100%;max-height:100%;object-fit:cover!important;display:block;border-radius:inherit}
.avatar img.animated-profile-avatar,.account-avatar img.animated-profile-avatar{object-fit:contain!important}
.account-finder:not(.finder-compact) #finderInput,.account-finder .finder-search-icon,.account-finder .finder-collapse{border:0!important;border-left:0!important;border-right:0!important;outline:none!important;box-shadow:none!important}
.notification-bell{overflow:visible}.notification-unread-count{position:absolute;right:-2px;top:-2px;min-width:18px;height:18px;padding:0 4px;display:grid;place-items:center;border:2px solid var(--surface,#fff);border-radius:12px;background:#ff3b52;color:white;font-size:10px;font-weight:800;line-height:14px;font-style:normal}
.notification-filters{padding:11px 6px 7px;gap:6px;align-items:center}.notification-filters button{position:relative;overflow:visible;padding:6px 9px;font-size:10px;line-height:16px;min-height:30px}.notification-filter-badge{position:absolute;right:-4px;top:-6px;min-width:17px;height:17px;padding:0 4px;display:grid;place-items:center;border:2px solid var(--surface,#fff);border-radius:12px;background:#ff3b52;color:#fff;font-size:9px;font-weight:800;line-height:13px;pointer-events:none}
.account-finder .finder-inner #finderInput::placeholder{font-size:12px!important}
.installment-category-tabs button,.transaction-status-filters button{padding:6px 9px;min-height:30px;font-size:10px;line-height:16px}
.notification-unread-count,.notification-filter-badge,.notification-card-top i[aria-label="Unread"]{animation:notification-unread-pulse 2s ease-in-out infinite;transform-origin:center}
@keyframes notification-unread-pulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,59,82,.22)}50%{transform:scale(1.08);box-shadow:0 0 0 4px rgba(255,59,82,0)}}
@media(prefers-reduced-motion:reduce){.notification-unread-count,.notification-filter-badge,.notification-card-top i[aria-label="Unread"]{animation:none}}
.installment-principal{font-weight:800;color:var(--ink)}
.item.payment-credit{background:#edf9f2}.item.payment-credit,.item.payment-credit *{color:#078653!important}body.dark .item.payment-credit{background:#153b2d}body.dark .item.payment-credit,body.dark .item.payment-credit *{color:#91e8bd!important}
.installment-category-section{margin-top:16px}.installment-category-section .sectiontitle{margin-bottom:9px}
.installment-category-tabs{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.installment-category-tabs button{border:1px solid var(--line);background:var(--surface,#fff);color:var(--ink);border-radius:18px;padding:8px 12px;font-size:11px}.installment-category-tabs button.sel{background:var(--blue);color:#fff;border-color:var(--blue)}
.chat-widget-panel{min-height:160px!important}.chat-widget-resize{position:absolute;bottom:2px;right:3px;z-index:3;width:25px;height:25px;padding:0;border:0;background:transparent;color:var(--muted);cursor:nwse-resize;touch-action:none;font-size:22px;line-height:25px}.chat-widget-resize:focus-visible{outline:2px solid var(--blue);border-radius:6px}
`;
document.head.appendChild(enhancementStyle);
let installmentCategoryFilter='all';
let stagingBalanceScope='all';
const stagingBalanceRows=()=>stagingBalanceScope==='all'?stagingRows().filter(stagingOwed):stagingDue(stagingBalanceScope);
const approvedPayableBreakdownItem=payableBreakdownItem;
payableBreakdownItem=(...args)=>{
 const html=approvedPayableBreakdownItem(...args),amount=Number(String(args[2]).replace(/[^\d.-]/g,''));
 return amount<0?html.replace(/\bbreakdown-past-due\s*/g,'').replace(/class="item\b/,'class="item payment-credit'):html;
};
const approvedGo=go;
go=destination=>{if(destination==='balance'){stagingBalanceScope=page==='dashboard'?mode:'all';expandedLists.balanceBreakdown=false;}approvedGo(destination);};
transactionBreakdownItems=()=>(page==='balance'?stagingBalanceRows():stagingDue()).map(t=>{const index=stagingIndex().loanIndexes.get(t.loanId);return payableBreakdownItem(htmlSafe(t.description),'Due '+stagingDate(t.dueDate),cash(t.amount),t.dueDate,'',index??null,'▣').replace(/<(div|button) /,'<$1 data-staging-transaction-id="'+htmlSafe(t.id)+'" ');});
balance=()=>{const rows=stagingBalanceRows(),label=stagingBalanceScope==='all'?'Outstanding Balance':stagingBalanceScope?'Next Balance Due':'Current Balance Due';return '<button type="button" class="screen-back" onclick="goBack()"><span aria-hidden="true">‹</span> Back</button>'+head(label,'Items included in this balance view')+'<div class="glass balance"><div class="label">'+label+'</div><div class="big">'+cash(rows.reduce((sum,t)=>sum+t.amount,0))+'</div><div class="due">'+countLabel(rows.length,'item')+' in this balance</div></div><section class="section"><h2 style="margin-bottom:10px">Transactions Detailed Breakdown</h2><div class="glass">'+(rows.length?expandableRowsHTML('balanceBreakdown',transactionBreakdownItems(),5):'<div class="empty-state">No items in this balance view.</div>')+'</div></section><button class="primary" style="margin-top:18px" onclick="go(\'payment\')">Attach Proof of Payment</button>';};
dashboardDueListHTML=()=>{
 const dates=[...new Set(stagingDue().map(t=>t.dueDate))].sort((a,b)=>b.localeCompare(a)),shown=dashboardDuesExpanded?dates:dates.slice(0,2);
 return '<div class="balance-due-list" aria-label="Due dates">'+shown.map(d=>'<div class="balance-due-row '+(d<localToday()?'past-due':'')+'"><span class="balance-due-dot"></span><span class="balance-due-label">'+(d<localToday()?'Past due':d===localToday()?'Due today':mode?'Next due':'Current due')+'</span><b>'+stagingDate(d)+'</b></div>').join('')+'</div>'+(dates.length>2?'<button type="button" class="balance-due-toggle" aria-expanded="'+dashboardDuesExpanded+'" onclick="toggleDashboardDues()">'+(dashboardDuesExpanded?'Show fewer due dates':'Show '+countLabel(dates.length-2,'more due date'))+'</button>':'');
};
const approvedDashboardDueAdvisory=dashboardDueAdvisory;
dashboardDueAdvisory=()=>{
 if(!stagingData)return '';
 const today=Date.parse(accountDayKey(new Date())+'T00:00:00Z'),groups=new Map();
 for(const row of stagingDue(mode)){
  if(!stagingOwed(row)||!/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate||''))continue;
  const timestamp=Date.parse(row.dueDate+'T00:00:00Z');
  if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==row.dueDate)continue;
  const delta=Math.round((timestamp-today)/86400000);
  if(delta>=0)continue;
  if(!groups.has(row.dueDate))groups.set(row.dueDate,{date:row.dueDate,delta,count:0,hasCharge:false});
  const group=groups.get(row.dueDate);group.count++;group.hasCharge ||= Number(row.amount)>0;
 }
 const dates=[...groups.values()].filter(d=>d.hasCharge).sort((a,b)=>a.date.localeCompare(b.date));
 if(!dates.length)return '';
 const items=dates.reduce((sum,d)=>sum+d.count,0),expired=dates.filter(d=>d.delta<-3).length;
 const grace=expired===dates.length?'The 3-day grace period for '+(dates.length===1?'this due date':'these due dates')+' has ended.':expired?countLabel(expired,'payment date')+' '+(expired===1?'is':'are')+' beyond the 3-day grace period; '+countLabel(dates.length-expired,'payment date')+' '+(dates.length-expired===1?'is':'are')+' still within it.':(dates.length===1?'This payment is':'These payments are')+' still within the 3-day grace period.';
 return '<aside class="dashboard-due-advisory '+(expired?'beyond-grace':'')+'" data-balance-mode="'+mode+'" role="status"><span class="due-advisory-icon" aria-hidden="true">⚠</span><div><div class="due-advisory-heading"><b>Past-due payment advisory</b><span>Past due</span></div><p>You have <strong>'+countLabel(dates.length,'past-due payment date')+' (starting from '+stagingDate(dates[0].date)+')</strong> covering <strong>'+countLabel(items,'unpaid item')+'.</strong> '+grace+'</p><p><em>Please note that unpaid balances are subject to a monthly Late Payment Fee and a 3% monthly Finance Charge if not paid in full.</em></p></div></aside>';
};
// Switch only the balance region; keep the header, Finder, chat and recent activity mounted.
const approvedSetmode=setmode;
setmode=value=>{
 const next=Number(value);if(![0,1].includes(next)||next===mode)return;
 const card=document.querySelector('#balance');if(page!=='dashboard'||!card){approvedSetmode(next);return;}
 const direction=next>mode?1:-1;mode=next;dashboardDuesExpanded=false;
 const template=document.createElement('template');template.innerHTML=dashboard();
 card.classList.toggle('next-due',!!mode);
 card.querySelectorAll('.switch button').forEach((button,index)=>{button.classList.toggle('sel',index===mode);button.setAttribute('aria-pressed',String(index===mode));});
 card.querySelector('.balance-content').replaceWith(template.content.querySelector('.balance-content'));
 document.querySelector('#app>.dashboard-due-advisory')?.remove();
 const advisory=template.content.querySelector('.dashboard-due-advisory');if(advisory)card.after(advisory);
 const breakdown=document.querySelector('#app>.section .glass');if(breakdown)breakdown.innerHTML=expandableRowsHTML('dashboardTransactionBreakdown',transactionBreakdownItems(),5);
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  for(const element of [card.querySelector('.balance-content'),advisory].filter(Boolean))element.animate([{opacity:.35,transform:'translateX('+direction*10+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
 }
};
const approvedRenderFinder=renderFinder;
let finderRenderedOwner=null,finderRenderedSource=null;
renderFinder=()=>{
 // Keep the focused input and pending first search intact during data updates.
 const owner=stagingData?.user?.id||null,mounted=document.querySelector('#accountFinder');
 const sameOwner=owner===finderRenderedOwner,sourceChanged=finderRenderedSource!==stagingData;
 finderRenderedOwner=owner;finderRenderedSource=stagingData;
 if(!sameOwner){finderQuery='';finderFilter='All';finderStatusFilter='All';}
 if(sameOwner&&borrowerShortcutsVisible()&&mounted&&mounted.classList.contains('finder-compact')===finderCompact){
  positionFinder();
  if(sourceChanged&&!finderCompact&&finderQuery.trim())requestAnimationFrame(renderStagingFinderResults);
  return;
 }
 approvedRenderFinder();
 document.querySelector('.finder-collapse')?.remove();
 const input=document.querySelector('#finderInput');
 if(input){input.placeholder='Search loans, payments…';input.setAttribute('aria-label','Search your loans, payments and more');}
};
let stagingListOwner=null,stagingMessageVisible=20;
const approvedExpandableRows=expandableRowsHTML;
expandableRowsHTML=(key,rows,limit=3)=>approvedExpandableRows(key,rows,Math.max(1,Math.min(5,limit)));
const approvedRecentRender=renderRecentPayments;
renderRecentPayments=()=>{approvedRecentRender();const button=document.querySelector('.recent-view-all');if(button){button.hidden=recentPaymentTotal<=5;button.setAttribute('aria-expanded',String(recentShowAll));}};
const approvedRecentFilter=setRecentPaymentFilter;
setRecentPaymentFilter=value=>{recentShowAll=false;recentPaymentLimit=5;approvedRecentFilter(value);};
const approvedDisbursementRows=disbursementRows;
disbursementRows=()=>{const host=document.createElement('div');host.innerHTML=approvedDisbursementRows();const rows=[...host.querySelectorAll(':scope > .disbursement-row')];return rows.length?expandableRowsHTML('disbursements',rows.map(el=>el.outerHTML),5):host.innerHTML;};
const approvedFilterDisbursements=filterDisbursements;
filterDisbursements=value=>{expandedLists.disbursements=false;approvedFilterDisbursements(value);};
const approvedMessages=messages;
messages=()=>{const host=document.createElement('div');host.innerHTML=approvedMessages();const thread=host.querySelector('#chatMessages');if(thread){const rows=[...thread.querySelectorAll('.chat-row')];rows.slice(0,Math.max(0,rows.length-stagingMessageVisible)).forEach(row=>row.remove());if(rows.length>20){const button=document.createElement('button');button.className='list-more-button';button.type='button';button.textContent=stagingMessageVisible<rows.length?'Show more messages':'Show fewer messages';button.setAttribute('onclick',stagingMessageVisible<rows.length?'stagingMessageVisible+=20;render()':'stagingMessageVisible=20;render()');thread.prepend(button);}}return host.innerHTML;};
localToday=()=>accountDayKey(new Date());
let finderCacheSource=null,finderRecordCache=[],finderQueryTimer=null,finderResultOffset=0;
let finderMatchSource=null,finderMatchQuery=null,finderMatchCache=[];
const normalizeFinder=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/,/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const originalFinderRecords=finderRecords;
finderRecords=()=>{
 if(finderCacheSource!==stagingData){
  finderRecordCache=originalFinderRecords().map(r=>({...r,_search:normalizeFinder(r.title+' '+r.detail+' '+(r.searchTerms||'')),_type:finderRecordType(r),_status:finderRecordStatus(r)}));
  finderCacheSource=stagingData;
 }
 return finderRecordCache;
};
finderResults=(query,ignoreFilters=false)=>{
 const normalized=normalizeFinder(String(query).slice(0,200));if(!normalized)return [];
 const records=finderRecords();
 if(finderMatchSource!==records||finderMatchQuery!==normalized){
  const words=normalized.split(/\s+/);finderMatchCache=records.filter(r=>words.every(w=>r._search.includes(w)));
  finderMatchSource=records;finderMatchQuery=normalized;
 }
 return ignoreFilters?finderMatchCache:finderMatchCache.filter(r=>(finderFilter==='All'||r._type===finderFilter)&&(finderStatusFilter==='All'||r._status===finderStatusFilter));
};
function renderStagingFinderResults(){
 if(!borrowerShortcutsVisible()||!finderQuery.trim()||finderCompact)return;
 const matches=finderResults(finderQuery),total=finderResults(finderQuery,true).length,size=50;
 finderResultOffset=Math.min(finderResultOffset,Math.max(0,Math.floor((matches.length-1)/size)*size));
 let overlay=document.querySelector('#finderResultsOverlay');
 if(!overlay){const host=document.querySelector('#accountFinder')?.closest('.phone-screen');if(!host)return;overlay=document.createElement('div');overlay.id='finderResultsOverlay';overlay.className='finder-results-overlay';host.appendChild(overlay);overlay.addEventListener('pointerdown',event=>{if(event.target===overlay)closeFinderResults()});overlay.addEventListener('keydown',event=>{if(event.key==='Escape')closeFinderResults()});}
 const visible=matches.slice(finderResultOffset,finderResultOffset+size);
 overlay.innerHTML='<section class="finder-results-dialog" role="dialog" aria-label="Account search results"><div class="finder-result-heading"><div><b>Account results</b><small>'+matches.length+' of '+total+' matching records</small></div><button type="button" aria-label="Close search results" onclick="closeFinderResults()">×</button></div>'+finderFilterControls(finderQuery)+'<div id="finderResultList">'+(visible.length?visible.map(r=>'<button type="button" class="finder-result" onclick="selectFinderResult(decodeURIComponent(\''+encodeURIComponent(r.id).replace(/'/g,'%27')+'\'))"><span class="finder-result-symbol" aria-hidden="true">'+(r.loanIndex!==undefined?'▣':r.receipt?'▤':'⌕')+'</span><span><b>'+htmlSafe(r.title)+'</b><small>'+htmlSafe(r.detail)+'</small></span><span aria-hidden="true">›</span></button>').join(''):'<p class="finder-empty">No matching records. Try another search or clear the filters.</p>')+'</div>'+(matches.length>size?'<div class="finder-filter-controls"><span>Showing '+(finderResultOffset+1)+'–'+(finderResultOffset+visible.length)+' of '+matches.length+'</span><button type="button" '+(finderResultOffset===0?'disabled':'')+' onclick="pageFinderResults(-1)">Previous</button><button type="button" '+(finderResultOffset+size>=matches.length?'disabled':'')+' onclick="pageFinderResults(1)">Next</button></div>':'')+'</section>';
 document.querySelector('#finderInput')?.setAttribute('aria-expanded','true');
}
function pageFinderResults(direction){finderResultOffset=Math.max(0,finderResultOffset+direction*50);renderStagingFinderResults();}
updateFinderResults=query=>{clearTimeout(finderQueryTimer);finderQuery=String(query).slice(0,200);finderResultOffset=0;if(!finderQuery.trim()){closeFinderResults(true);return;}finderQueryTimer=setTimeout(renderStagingFinderResults,150);};
const oldCloseFinder=closeFinderResults;
closeFinderResults=(immediate=false)=>{clearTimeout(finderQueryTimer);oldCloseFinder(immediate);};
function collapseUnfocusedFinder(event){if(borrowerShortcutsVisible()&&!finderCompact&&!event.target.closest('#accountFinder,.finder-results-dialog'))setFinderCompact(true);}
document.addEventListener('pointerdown',collapseUnfocusedFinder);
document.addEventListener('focusout',event=>{if(event.target.id==='finderInput')setTimeout(()=>{if(borrowerShortcutsVisible()&&!finderCompact&&!document.activeElement?.closest('#accountFinder,#finderResultsOverlay'))setFinderCompact(true);},0);});
let stagingChatSize=null,stagingChatResize=null;
const stagingChatSizeKey=()=>'loanledger-chat-size-'+(stagingData?.user.id||'signed-out');
function saveStagingChatSize(){try{localStorage.setItem(stagingChatSizeKey(),JSON.stringify(stagingChatSize))}catch{}}
function resizeStagingChat(width,height){
 const mount=document.querySelector('#chatWidgetMount'),panel=mount?.querySelector('.chat-widget-panel');if(!mount||!panel)return;
 const maxWidth=Math.max(0,mount.clientWidth-24),maxHeight=Math.max(0,chatPanelBounds(mount).bottom-16);
 stagingChatSize={width:Math.round(Math.min(maxWidth,Math.max(Math.min(240,maxWidth),width))),height:Math.round(Math.min(maxHeight,Math.max(Math.min(180,maxHeight),height)))};
 panel.style.setProperty('width',stagingChatSize.width+'px','important');panel.style.setProperty('height',stagingChatSize.height+'px','important');positionChatPanel();
}
function startStagingChatResize(event){
 if(event.button!==undefined&&event.button!==0)return;const mount=document.querySelector('#chatWidgetMount'),panel=mount?.querySelector('.chat-widget-panel');if(!panel)return;
 const frame=mount.getBoundingClientRect(),sx=frame.width/Math.max(1,mount.clientWidth)||1,sy=frame.height/Math.max(1,mount.clientHeight)||1;
 stagingChatResize={pointerId:event.pointerId,x:event.clientX,y:event.clientY,width:panel.offsetWidth,height:panel.offsetHeight,sx,sy};event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
}
function moveStagingChatResize(event){if(!stagingChatResize||event.pointerId!==stagingChatResize.pointerId)return;event.preventDefault();const drag=stagingChatResize;resizeStagingChat(drag.width+(event.clientX-drag.x)/drag.sx,drag.height+(event.clientY-drag.y)/drag.sy);}
function endStagingChatResize(event){if(stagingChatResize&&event.pointerId===stagingChatResize.pointerId){stagingChatResize=null;saveStagingChatSize();}}
function keyStagingChatResize(event){const changes={ArrowRight:[10,0],ArrowLeft:[-10,0],ArrowDown:[0,10],ArrowUp:[0,-10]}[event.key];if(!changes)return;event.preventDefault();event.stopPropagation();const panel=document.querySelector('.chat-widget-panel');if(panel){resizeStagingChat(panel.offsetWidth+changes[0],panel.offsetHeight+changes[1]);saveStagingChatSize();}}
const originalFloatingWidget=floatingMessagesWidget;
floatingMessagesWidget=()=>originalFloatingWidget().replace('<div class="chat-widget-context">Cash Loan ···· 4821 <span>','<div class="chat-widget-context">'+borrowerAccountDisplayHTML()+' <span>').replace('</section><button type="button" class="chat-widget-launcher"','<button type="button" class="chat-widget-resize" aria-label="Resize messages window. Drag or use arrow keys." title="Resize messages window" onpointerdown="startStagingChatResize(event)" onpointermove="moveStagingChatResize(event)" onpointerup="endStagingChatResize(event)" onpointercancel="endStagingChatResize(event)" onlostpointercapture="endStagingChatResize(event)" onkeydown="keyStagingChatResize(event)">◢</button></section><button type="button" class="chat-widget-launcher"');
const originalPositionChat=positionChatPanel;
positionChatPanel=(root=document.querySelector('.chat-widget'))=>{
 const mount=document.querySelector('#chatWidgetMount'),panel=root?.querySelector('.chat-widget-panel');
 if(mount&&panel&&chatWidgetOpen&&stagingChatSize){const width=Math.min(stagingChatSize.width,Math.max(0,mount.clientWidth-24)),height=Math.min(stagingChatSize.height,Math.max(0,chatPanelBounds(mount).bottom-16));panel.style.setProperty('width',width+'px','important');panel.style.setProperty('height',height+'px','important');}
 originalPositionChat(root);
};
transactionItem=(icon,title,sub,amount,color='',kind='',status='',extraClass='',dateText='')=>{
 sub=transactionEventDescription(sub,status,kind);if(dateText)sub+='<br><span class="transaction-date-label">Transaction Date · '+dateText+'</span>';
 const value=cash(Math.abs(Number(amount)||0)),negative=Number(amount)<0;
 let markup=item(icon,title,sub,value,color).replace('<span class="amt">'+value+'</span>','<span class="amt'+(negative?' transaction-amount':'')+'">'+(negative?'-':'')+value+'</span>');
 if(negative)markup=markup.replace(/class="item\b/,'class="item payment-credit');
 if(extraClass)markup=markup.replace(/class="item\b([^"]*)"/,'class="item$1 '+extraClass+'"');return markup;
};
// Sort raw dates and amounts; missing dates stay last in either date direction.
function stagingCompareValues(a,b,sort=txSort){
 const dateA=Number.isFinite(a.date)?a.date:null,dateB=Number.isFinite(b.date)?b.date:null;
 const dateOrder=dateA===null?(dateB===null?0:1):dateB===null?-1:(sort==='Oldest'?dateA-dateB:dateB-dateA);
 const amountOrder=sort==='Amount: high to low'?b.amount-a.amount:sort==='Amount: low to high'?a.amount-b.amount:0;
 return amountOrder||dateOrder||String(a.id).localeCompare(String(b.id),undefined,{numeric:true});
}
function stagingCompareTransactions(a,b){return stagingCompareValues({date:a[7],amount:Number(a[3])||0,id:a[8]},{date:b[7],amount:Number(b[3])||0,id:b[8]});}
function stagingCompareLatestTransactions(a,b){return stagingCompareValues({date:a[7],amount:Number(a[3])||0,id:a[8]},{date:b[7],amount:Number(b[3])||0,id:b[8]},'Newest');}
function stagingCompareProfileGroups(a,b){const x=stagingLoans()[a.index],y=stagingLoans()[b.index];return stagingCompareValues({date:Date.parse(x.txnDate),amount:x.principal,id:x.id},{date:Date.parse(y.txnDate),amount:y.principal,id:y.id},'Newest');}
function stagingTransactionDate(timestamp){return Number.isFinite(timestamp)?stagingDate(new Date(timestamp).toISOString()):'—';}
const stagingLoanActive=loan=>!['cancelled','refunded','completed'].includes(String(loan.status).toLowerCase())&&stagingRows().some(t=>t.loanId===loan.id&&stagingOwed(t));
const stagingCategory=loan=>loan.loanCategory||'unclassified';
const stagingVisibleGroups=()=>stagingGroups().map((group,index)=>({group,index,loan:stagingLoans()[index]})).filter(({loan,group})=>(!excludeFullyPaidInstallments||stagingLoanActive(loan))&&(installmentCategoryFilter==='all'||stagingCategory(loan)===installmentCategoryFilter)&&(!txSearch||`${group[0]} ${loan.loanCategory==='cash_loan'?'Cash Loan':'Retail Installments'} ${group[2]} ${group[4]}`.toLowerCase().includes(txSearch.toLowerCase()))).sort((a,b)=>stagingCompareValues({date:Date.parse(a.loan.txnDate),amount:Number(a.loan.principal)||0,id:a.loan.id},{date:Date.parse(b.loan.txnDate),amount:Number(b.loan.principal)||0,id:b.loan.id}));
loanProfileCategory=group=>({cash_loan:'Cash Loan',retail_installment:'Retail Installments'}[stagingCategory(stagingLoans().find(l=>l.id===group[5])||{})]||'Unclassified');
function setInstallmentCategory(value){if(!['all','cash_loan','retail_installment'].includes(value))return;installmentCategoryFilter=value;render();}
const oldExclude=setExcludeFullyPaidInstallments;
setExcludeFullyPaidInstallments=value=>{for(const key of ['installmentGroups-cash_loan','installmentGroups-retail_installment','installmentGroups-unclassified'])expandedLists[key]=false;oldExclude(value);};
installmentGroupCards=()=>{
 const cards=stagingVisibleGroups();
 const control='<div class="installment-filter"><div class="installment-filter-copy"><b>Installment transactions</b><small>'+(excludeFullyPaidInstallments?'Showing active and unpaid groups':'Showing all groups')+'</small></div><div class="installment-filter-control"><span>Exclude fully paid</span><label class="installment-switch"><input type="checkbox" role="switch" aria-label="Exclude fully paid installment transactions" aria-checked="'+excludeFullyPaidInstallments+'" '+(excludeFullyPaidInstallments?'checked':'')+' onchange="setExcludeFullyPaidInstallments(this.checked)"><span class="installment-switch-track"></span></label></div></div>';
 const tabs='<div class="installment-category-tabs" role="group" aria-label="Filter installment category">'+[['all','All'],['cash_loan','Cash Loan'],['retail_installment','Retail Installments']].map(([id,name])=>'<button type="button" class="'+(installmentCategoryFilter===id?'sel':'')+'" aria-pressed="'+(installmentCategoryFilter===id)+'" onclick="setInstallmentCategory(\''+id+'\')">'+name+'</button>').join('')+'</div>';
 const sections=[['cash_loan','Cash Loan'],['retail_installment','Retail Installments'],['unclassified','Unclassified']].filter(([id])=>id!=='unclassified'||cards.some(x=>stagingCategory(x.loan)===id)).map(([id,title])=>{
  const bucket=cards.filter(x=>stagingCategory(x.loan)===id);
  if(installmentCategoryFilter!=='all'&&installmentCategoryFilter!==id)return '';
  const rows=bucket.map(({group:c,index:idx})=>{const past=installmentPastDueCount(c);return '<div class="item installment-click installment-group-row" role="button" tabindex="0" onclick="openInstallment('+idx+')" onkeydown="if(event.key===\'Enter\'||event.key===\' \')openInstallment('+idx+')"><div class="ico">▣</div><div class="itext"><b>'+c[0]+(past?'<span class="schedule-overdue-label">'+past+' PAST DUE</span>':'')+'</b><small><strong class="installment-principal">'+c[1]+'</strong> · '+c[2]+'</small><small class="transaction-date-label">Transaction Date · '+c[4]+'</small><div class="group-progress" role="progressbar" aria-label="'+c[0]+' payment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+c[3]+'"><span style="width:'+c[3]+'%"></span></div><div class="group-progress-label"><span>'+c[3]+'% paid</span><span>View schedule ›</span></div></div><span class="arrow">›</span></div>'});
  return '<section class="installment-category-section" data-loan-category="'+id+'"><div class="sectiontitle"><h3>'+title+'</h3><span class="count">'+bucket.length+'</span></div><div class="glass">'+(rows.length?expandableRowsHTML('installmentGroups-'+id,rows,5):'<div class="empty-state">No '+title.toLowerCase()+' to show.</div>')+'</div></section>';
 }).join('');return control+tabs+sections;
};
const oldTransactions=transactions;
transactions=()=>{const container=document.createElement('div');container.innerHTML=oldTransactions();const sections=[...container.querySelectorAll(':scope > .transaction-group')],straight=sections[0],installment=sections[1];if(straight&&installment){container.insertBefore(installment,straight);installment.querySelector('.transaction-count').textContent=stagingVisibleGroups().length;}return container.innerHTML;};
straightTransactions=()=>{const host=document.createElement('div');host.innerHTML=transactions();return '<button type="button" class="screen-back" onclick="goBack()"><span aria-hidden="true">‹</span> Back</button>'+head('Straight Transactions','Your direct transactions')+host.querySelector('.transaction-tools').outerHTML+[...host.querySelectorAll('.transaction-group')].find(section=>section.querySelector('h2')?.textContent==='Straight Transactions').outerHTML;};
const oldHead=head;
head=(title,subtitle='')=>oldHead(title,subtitle).replace('<i class="notification-unread-dot"></i>',unreadNotificationCount()?'<span class="notification-unread-count" aria-hidden="true">'+unreadNotificationCount()+'</span>':'');
const approvedNotificationInbox=notificationInbox;
notificationInbox=()=>{
 const host=document.createElement('div');host.innerHTML=approvedNotificationInbox();
 const unread=notificationItems.filter(n=>!notificationReadIds.has(n.id));
 host.querySelectorAll('.notification-filters button').forEach(button=>{
  const label=button.textContent.trim(),kind=label==='Payments'?'Payment':label,count=unread.filter(n=>kind==='All'||kind==='Unread'||n.kind===kind).length;
  button.dataset.notificationFilter=kind;button.setAttribute('aria-label',label+(count?', '+count+' unread notification'+(count===1?'':'s'):''));
  if(count){const badge=document.createElement('span');badge.className='notification-filter-badge';badge.setAttribute('aria-hidden','true');badge.textContent=String(count);button.appendChild(badge);}
 });return host.innerHTML;
};
currentProfileAvatar=()=>profileAvatarCatalog.find(a=>a.id===stagingData?.preference?.avatar_id)||null;
const approvedAvatarPicker=openProfileAvatarPicker;
openProfileAvatarPicker=()=>{approvedAvatarPicker();if(stagingData?.user.avatarUrl){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='Use uploaded profile photo';button.style.marginBottom='12px';button.onclick=()=>stagingSend({type:'avatar',id:null,usePhoto:true});document.querySelector('#profileAvatarPicker .profile-avatar-grid')?.before(button);}};
selectProfileAvatar=id=>{if(!profileAvatarCatalog.some(a=>a.id===id))return;stagingSend({type:'avatar',id,usePhoto:false});};
removeProfilePhoto=()=>stagingSend({type:'avatar',id:null,usePhoto:false});
// Crop uploads await the existing authenticated storage integration. Never claim a local-only preview was saved.
applyPhotoCrop=stagingPending;
toggleNotificationRead=id=>stagingSend({type:'notification-read',id,read:!notificationReadIds.has(id)});
markAllNotificationsRead=()=>notificationItems.filter(n=>!notificationReadIds.has(n.id)).forEach(n=>stagingSend({type:'notification-read',id:n.id,read:true}));
markAllNotificationsUnread=()=>notificationItems.filter(n=>notificationReadIds.has(n.id)).forEach(n=>stagingSend({type:'notification-read',id:n.id,read:false}));
function stagingAcknowledgement(payment){
 const loan=stagingData.loans.find(l=>l.id===payment.loanId);
 return {number:'AR-'+payment.id,issuedAt:payment.submittedAt,borrower:stagingData.user.name,account:borrowerAccountNumber(),amount:payment.amount,paidDate:payment.paidDate||'Not recorded',method:({bank_transfer:'Bank Transfer',gcash:'GCash',maya:'Maya',cash:'Cash'}[payment.method]||payment.method),reference:payment.reference||'Not recorded',proofName:payment.fileName,entryMode:'copied',items:[{id:payment.loanId,title:loan?.label||'Submitted loan reference: '+payment.loanId,transactionDate:loan?.txnDate||'Not recorded',dueDate:'Not recorded',amount:null}],allocationsKnown:false,notes:payment.note||'',status:payment.status,version:'4.12.24'};
}
showAcknowledgement=(id,view=false)=>{const record=recentPayments.find(p=>p.id===id);if(!record?.acknowledgement)return;closeAcknowledgement();const dialog=document.createElement('dialog');dialog.id='acknowledgementDialog';dialog.className='acknowledgement-dialog';dialog.dataset.recordId=id;dialog.addEventListener('cancel',()=>closeAcknowledgement());dialog.innerHTML='<button type="button" class="ack-close" aria-label="Close acknowledgement" onclick="closeAcknowledgement()">×</button><h2>Acknowledgement receipt</h2><p>'+safeRecent(record.acknowledgement.number)+'</p><p>Submission status: '+safeRecent(record.status)+'. This receipt acknowledges the submitted proof.</p><div class="ack-actions"><button class="primary" onclick="viewAcknowledgement(\''+safeRecent(id)+'\')">View PDF</button><button class="secondary" onclick="downloadAcknowledgement(\''+safeRecent(id)+'\')">Download PDF</button></div><div id="acknowledgementPreview"></div>';document.body.appendChild(dialog);dialog.showModal();if(view)viewAcknowledgement(id);};
const enhancementRender=render;
render=()=>{
 if(stagingData){
  if(stagingListOwner!==stagingData.user.id){
   stagingListOwner=stagingData.user.id;txSort='Newest';expandedLists={};recentShowAll=false;recentPaymentLimit=5;notificationExpanded=false;stagingMessageVisible=20;installmentCategoryFilter='all';stagingBalanceScope='all';dashboardDuesExpanded=false;
   try{const saved=JSON.parse(localStorage.getItem(stagingChatSizeKey())||'null');stagingChatSize=saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height)&&saved.width>0&&saved.height>0?saved:null;}catch{stagingChatSize=null;}
  }
  profilePhotoData=stagingData.preference?.use_profile_photo===false?'':stagingData.user.avatarUrl||'';
  notificationReadIds=new Set(stagingData.notifications.filter(n=>n.isRead).map(n=>n.id));
  recentPayments.forEach(p=>{const source=stagingData.payments.find(s=>s.id===p.id);if(source)p.acknowledgement=stagingAcknowledgement(source);});
 }
 enhancementRender();
 if(page==='profile'&&stagingData){const node=document.querySelector('.profile-overview-link b');if(node)node.textContent=stagingLoans().filter(stagingLoanActive).length+' active accounts';}
};
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.channel==='loanledger-v41224'&&event.data.type==='avatar-saved'){closeProfileAvatarPicker();profilePhotoMessage='Avatar preference saved.';toast('Avatar preference saved.');}});
render();
