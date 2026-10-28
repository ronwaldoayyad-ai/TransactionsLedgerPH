// Enhance the authenticated borrower document at desktop widths; keep mobile DOM and actions.
(() => {
 const media=matchMedia('(min-width:1024px)');
 let sidebar=null,sidebarHTML='',layout=null;
 const paths={
  dashboard:'M3 10 12 3l9 7v10H3Zm6 10v-7h6v7',transactions:'M4 7h16M4 12h16M4 17h16',
  payment:'M3 6h18v13H3Zm0 4h18m-6 5h3',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v6l4 2',
  loan:'M12 3v18m4-14c-1-3-8-3-8 1s8 2 8 6-7 4-8 1',invoices:'M6 3h12v18l-3-2-3 2-3-2-3 2Zm3 5h6m-6 4h6',
  disbursements:'M3 12h18m-6-6 6 6-6 6',notifications:'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5Zm5 3h4',
  messages:'M3 4h18v13H8l-5 4Zm4 5h10m-10 4h7',support:'M4 13v-2a8 8 0 0 1 16 0v2M4 12h3v6H4Zm13 0h3v6h-3Zm3 6c0 3-5 3-7 3',
  profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',more:'M12 5h.01M12 12h.01M12 19h.01'
 };
 const icon=key=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[key]+'"/></svg>';
 const active=()=>media.matches&&!!stagingData&&page!=='login';
 function currentSection(){
  if(['installment','installmentDetail','straight','balance'].includes(page))return 'transactions';
  if(['personalInfo','changePassword','loanProfile'].includes(page))return 'profile';
  if(['notificationSettings','languageSettings','faq','about','privacy','terms'].includes(page))return 'more';
  return page;
 }
 const heading=node=>{const title=node.querySelector('h2');return title?(typeof borrowerSourceText==='function'?borrowerSourceText(title):title.textContent):'';};
 function groupLayout(root,kind,left,right){
  const children=[...root.children],nodes=children.filter(node=>left(node)||right(node));
  if(!nodes.length)return;
  const wrapper=document.createElement('div');wrapper.className='borrower-desktop-columns '+kind;
  const first=document.createElement('div'),second=document.createElement('div');first.className='desktop-primary-column';second.className='desktop-secondary-column';
  nodes[0].before(wrapper);wrapper.append(first,second);nodes.forEach(node=>(left(node)?first:second).append(node));
  layout={root,wrapper,original:children};
 }
 function restoreLayout(){
  if(layout?.wrapper.isConnected){for(const node of layout.original)layout.root.append(node);layout.wrapper.remove();}
  layout=null;
 }
 function sync(){
  const enabled=active();document.body.classList.toggle('borrower-desktop',enabled);
  document.body.dataset.borrowerPage=page;
  if(!enabled){if(sidebar){sidebar.hidden=true;if(!stagingData||page==='login'){sidebar.replaceChildren();sidebarHTML='';}}restoreLayout();return;}
  if(!sidebar){
   sidebar=document.createElement('aside');sidebar.id='borrowerDesktopSidebar';sidebar.className='borrower-desktop-sidebar';
   sidebar.setAttribute('aria-label','Borrower workspace');
   sidebar.addEventListener('click',event=>{const button=event.target.closest('[data-desktop-page]');if(button)go(button.dataset.desktopPage);});
   document.querySelector('.phone-screen').append(sidebar);
  }
  sidebar.hidden=false;
  const selected=currentSection(),unread=(stagingData.notifications||[]).filter(n=>!n.isRead).length;
  const chat=dashboardOrbitUnreadCount(stagingData.messages,stagingData.user.id);
  const link=(key,label,count=0)=>'<button type="button" data-desktop-page="'+key+'" '+(selected===key?'aria-current="page"':'')+'>'+icon(key)+'<span>'+label+'</span>'+(count?'<b class="desktop-nav-count" aria-label="'+count+' unread">'+(count>99?'99+':count)+'</b>':'')+'</button>';
  const initials=String(stagingData.user.preferredDisplayName||stagingData.user.name||'').split(/\s+/).slice(0,2).map(s=>s[0]||'').join('');
  const html='<button type="button" class="desktop-brand" data-desktop-page="dashboard"><span class="desktop-brand-mark">LL</span><span><strong>LoanLedger PH</strong><small>Borrower workspace</small></span></button><nav aria-label="Main navigation"><p>YOUR ACCOUNT</p>'+link('dashboard','Dashboard')+link('transactions','Transactions')+link('payment','Payments')+link('history','History')+(loanRequestsVisible()?link('loan','Request a Loan'):'')+'<p>DOCUMENTS & SUPPORT</p>'+link('invoices','Invoices & statements')+link('disbursements','Disbursements')+link('notifications','Notifications',unread)+link('messages','Message lender',chat)+link('support','Help & Support')+link('more','More & settings')+'</nav><div class="desktop-sidebar-bottom"><button type="button" class="desktop-profile" data-desktop-page="profile" '+(selected==='profile'?'aria-current="page"':'')+'><span class="desktop-profile-initials">'+htmlSafe(initials)+'</span><span><strong>'+htmlSafe(stagingData.user.preferredDisplayName||stagingData.user.name||'My profile')+'</strong><small>View profile</small></span></button><button type="button" class="desktop-signout" data-desktop-page="login">Sign out</button></div>';
  if(html!==sidebarHTML){const focused=sidebar.contains(document.activeElement)?document.activeElement.closest('[data-desktop-page]')?.dataset.desktopPage:null;sidebar.innerHTML=html;sidebarHTML=html;if(focused)sidebar.querySelector('[data-desktop-page="'+focused+'"]')?.focus({preventScroll:true});}
  const root=document.querySelector('#app');if(layout?.wrapper.isConnected)return;layout=null;
  if(page==='dashboard')groupLayout(root,'desktop-dashboard-columns',node=>node.id==='balance'||node.classList.contains('dashboard-due-advisory')||heading(node)==='Transactions Detailed Breakdown',node=>node.classList.contains('transfer-channels')||node.classList.contains('quick-access-section')||heading(node)==='Recent Activity');
  if(page==='installmentDetail')groupLayout(root,'desktop-schedule-columns',node=>node.classList.contains('disclosure'),node=>node.classList.contains('progress-card')||node.classList.contains('schedule-card'));
  requestAnimationFrame(()=>{if(typeof queueFinderViewport==='function')queueFinderViewport();if(typeof queueDashboardOrbit==='function')queueDashboardOrbit();});
 }
 // Apply the class before rendering so existing responsive positioning sees the correct geometry.
 const previousRender=render;
 render=()=>{document.body.classList.toggle('borrower-desktop',active());previousRender();sync();};
 media.addEventListener('change',()=>{sync();positionFinder();positionChatWidget();});
 sync();
})();
