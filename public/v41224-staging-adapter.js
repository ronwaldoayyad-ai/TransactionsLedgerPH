// Presentation adapter for the approved v4.12.24 document. Auth stays in React.
let stagingData=null,stagingBusy=false,stagingSnapshotKey=null;
const stagingSend=payload=>parent.postMessage({channel:'loanledger-v41224',...payload},location.origin);
function hasAvailableAccountCredit(value){const amount=Number(value);return Number.isFinite(amount)&&Math.round(amount*100)>0;}
function stagingAccountCreditHTML(){return hasAvailableAccountCredit(stagingData?.user.creditBalance)?'<p class="account-credit-summary" style="font-size:12px;padding:10px 14px;margin:10px 0;border-radius:12px;background:rgba(126,171,255,.12);line-height:1.5">Available account credit: '+cash(stagingData.user.creditBalance)+' · Applied to dues after lender review.</p>':'';}
const stagingDashboard=dashboard;
dashboard=()=>stagingDashboard().replace('</div><div class="balance-foot">',stagingAccountCreditHTML()+'</div><div class="balance-foot">');
const stagingDateFormat=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}),stagingDateCache=new Map();
const stagingDate=value=>{if(!value)return '—';const key=String(value).slice(0,10);if(!stagingDateCache.has(key))stagingDateCache.set(key,stagingDateFormat.format(new Date(key+'T00:00:00')));return stagingDateCache.get(key);};
const stagingOwed=t=>!['paid','refunded','cancelled'].includes(t.status);
const stagingRows=()=>stagingData?.transactions||[];
let stagingIndexSource=null,stagingCachedIndex=null;
function stagingIndex(){
  if(stagingIndexSource===stagingData&&stagingCachedIndex)return stagingCachedIndex;
  const byLoan=new Map();for(const row of stagingRows()){if(!byLoan.has(row.loanId))byLoan.set(row.loanId,[]);byLoan.get(row.loanId).push(row);}
  const loans=(stagingData?.loans||[]).filter(l=>l.txnType!=='straight'&&byLoan.has(l.id));
  stagingIndexSource=stagingData;return stagingCachedIndex={byLoan,loans,loanIds:new Set(loans.map(l=>l.id)),loanIndexes:new Map(loans.map((l,i)=>[l.id,i]))};
}
const stagingLoans=()=>stagingIndex().loans;
const stagingStatus=t=>t.status==='unpaid'?(t.dueDate<localToday()?'Past Due':'Upcoming'):({paid:'Paid',past_due:'Past Due',refunded:'Refunded',cancelled:'Cancelled'}[t.status]||t.status);
const stagingGroups=()=>stagingLoans().map(l=>{const rows=stagingIndex().byLoan.get(l.id)||[],paid=rows.filter(t=>t.status==='paid').length;return [htmlSafe(l.label),cash(l.principal),`${l.durationMonths||rows.length} months · ${paid} of ${rows.length} payments verified`,rows.length?Math.floor(paid/rows.length*100):0,stagingDate(l.txnDate),l.id]});
const stagingDue=(view=mode)=>{
  const owed=stagingRows().filter(stagingOwed),override=stagingData?.overrides[0];
  if(view)return owed.filter(t=>(override?.nextDueDates||[]).includes(t.dueDate));
  if(override?.dueDates.length)return owed.filter(t=>override.dueDates.includes(t.dueDate));
  const future=owed.filter(t=>t.dueDate>=localToday()).map(t=>t.dueDate).sort()[0];
  return owed.filter(t=>t.dueDate<localToday()||t.dueDate===future);
};
const stagingTotal=(view=mode)=>stagingDue(view).reduce((sum,t)=>sum+t.amount,0);
function stagingRecentActivity(){
  const activity=stagingRows().filter(t=>['paid','refunded'].includes(t.status)).map(t=>({date:t.datePaid||t.txnDate,markup:transactionItem(t.status==='paid'?'✓':'↩',htmlSafe(t.description),stagingDate(t.datePaid),t.amount,t.status==='paid'?'green':'purple',t.status==='paid'?'Payment Received':'Refund Processed').replace(/<(div|button) /,'<$1 data-staging-transaction-id="'+htmlSafe(t.id)+'" ')}));
  (stagingData?.payments||[]).forEach(p=>activity.push({date:p.submittedAt,markup:transactionItem('▣','Payment Proof Submitted',stagingDate(p.submittedAt),p.amount,'','Payment Proof Submitted')}));
  return activity.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(a=>a.markup);
}
const stagingPending=()=>toast('This action is not connected yet. No submission or change has been saved.');

// Reset all demonstration state before the first authenticated render.
recentPayments=[];mostRecentPayment=null;chatMessages=[];loanRequests=[];invoiceGenerated=[];
personalInfo={fullName:'',preferredDisplayName:'',email:'',phone:'',birthDate:'',address:'',occupation:''};
profilePhotoData='';notificationItems=[];disbursementRecords=[];supportTicketsMemory=[];
accountSupportTickets=()=>[];currentProfileAvatar=()=>null;
const stagingOriginalLogin=login;
login=()=>stagingOriginalLogin().replace('<div class="checkrow">','<div id="stagingLoginError" class="login-inline-error" role="alert" aria-live="polite"></div><div class="checkrow">');
function stagingLoginError(message){stagingBusy=false;const target=$('#stagingLoginError')||$('#loginError');if(target)target.textContent=message;$('#loginError')?.replaceChildren(document.createTextNode(message));document.querySelectorAll('#loginEmailFields .primary').forEach(b=>{b.disabled=false;b.textContent='→　Sign In'});}
signin=()=>{
  if(stagingBusy)return;
  const email=$('#email')?.value.trim()||'',password=$('#password')?.value||'';
  if(!email||!$('#email').checkValidity()){stagingLoginError('Enter a valid email address.');$('#email')?.focus();return;}
  if(!password){stagingLoginError('Enter your password.');$('#password')?.focus();return;}
  stagingBusy=true;$('#stagingLoginError').textContent='';const button=$('#loginEmailFields .primary');button.disabled=true;button.textContent='Signing in…';
  stagingSend({type:'login',email,password});
};
signinWithToken=()=>{const value=$('#loginToken')?.value||'';$('#loginError').textContent=/^\d{6}$/.test(value)?'Lender-issued token login is still being integrated. Use your local email and password for this viewing stage.':'Enter the 6-digit code provided by your lender or administrator.';};
completeDemoSignIn=stagingPending;
const stagingOriginalGo=go;
go=p=>{resetBorrowerAccountDisplays();if(p==='login'&&stagingData){stagingSend({type:'logout'});return;}if(!stagingData&&!['login','support','faq','privacy','terms','about'].includes(p))return;stagingOriginalGo(p);};
installmentGroupData=stagingGroups;
installmentPastDueCount=group=>stagingRows().filter(t=>t.loanId===group[5]&&stagingStatus(t)==='Past Due').length;
borrowerPayableRecords=()=>stagingRows().filter(stagingOwed).map(t=>[htmlSafe(t.description),'Due '+stagingDate(t.dueDate),t.amount,t.dueDate,t.id]);
dashboardBalanceRecords=(view=mode)=>stagingDue(view).map(t=>[htmlSafe(t.description),'Due '+stagingDate(t.dueDate),t.amount,t.dueDate,t.id]);
dashboardDueListHTML=()=>{
  const dates=[...new Set(stagingDue().map(t=>t.dueDate))].sort(),shown=dashboardDuesExpanded?dates:dates.slice(0,2);
  return '<div class="balance-due-list" aria-label="Due dates">'+shown.map(d=>'<div class="balance-due-row '+(d<localToday()?'past-due':'')+'"><span class="balance-due-dot"></span><span class="balance-due-label">'+(mode?'Next due':d<localToday()?'Past due':'Current due')+'</span><b>'+stagingDate(d)+'</b></div>').join('')+'</div>'+(dates.length>shown.length?'<button type="button" class="balance-due-toggle" onclick="toggleDashboardDues()">Show '+countLabel(dates.length-shown.length,'more due date')+'</button>':'');
};
transactionBreakdownItems=()=>(page==='balance'?stagingRows().filter(stagingOwed):stagingDue()).map(t=>{const index=stagingLoans().findIndex(l=>l.id===t.loanId);return payableBreakdownItem(htmlSafe(t.description),'Due '+stagingDate(t.dueDate),cash(t.amount),t.dueDate,'',index<0?null:index,'▣');});
transactionRecords=()=>stagingRows().map(t=>{const status=stagingStatus(t),paid=['Paid','Refunded'].includes(status);return [status==='Paid'?'✓':status==='Past Due'?'!':'◷',htmlSafe(t.description),(paid?'Paid '+stagingDate(t.datePaid):'Due '+stagingDate(t.dueDate)),t.amount,status==='Paid'?'green':'orange',status==='Past Due'?'Past Dues':status,stagingLoans().some(l=>l.id===t.loanId)?'installment':'straight',Date.parse(t.txnDate),t.id];});
historyPaymentRecords=()=>stagingRows().filter(t=>t.status==='paid').map(t=>{const index=stagingLoans().findIndex(l=>l.id===t.loanId);return ['✓',htmlSafe(t.description),'Paid '+stagingDate(t.datePaid)+' · Due '+stagingDate(t.dueDate),t.amount,'green','Payments',index>=0?'installment':'straight',stagingDate(t.txnDate),Date.parse(t.datePaid||t.txnDate),index,t.id];});
historyAccountRecords=historyPaymentRecords;
const stagingOriginalStraight=straightTransactions;
straightTransactions=()=>head('Straight Transactions','Your direct transactions')+'<div class="glass">'+expandableRowsHTML('straight-real',transactionRecords().filter(r=>r[6]==='straight').sort(stagingCompareTransactions).map(r=>transactionItem(r[0],r[1],r[2],r[3],r[4],r[1],r[5],'transaction-row',stagingTransactionDate(r[7]))),5)+'</div>';
loanDisclosureData=(index=selectedInstallmentIndex)=>{
  const loan=stagingLoans()[index];if(!loan)return null;
  const rows=stagingRows().filter(t=>t.loanId===loan.id).sort((a,b)=>(a.n||0)-(b.n||0)||a.dueDate.localeCompare(b.dueDate)).map((t,i)=>({number:t.n||i+1,title:t.description+(t.paidAmount>0&&t.remainingAmount>0?' · Applied '+cash(t.paidAmount)+' · Remaining '+cash(t.remainingAmount):''),dueDate:t.dueDate,amount:t.originalAmount??t.amount,status:stagingStatus(t),paidDate:t.datePaid||''}));
  return {id:loan.id,name:loan.label,borrower:stagingData.user.name,account:borrowerAccountNumber(),transactionDate:loan.txnDate,principal:loan.principal,months:rows.length,verified:rows.filter(r=>r.status==='Paid').length,rate:loan.monthlyRate,firstPaymentDate:loan.firstPaymentDate,dst:loan.dst,processing:loan.processingFee,notarial:loan.notarialFee,feeTotal:loan.dst+loan.processingFee+loan.notarialFee,netProceeds:loan.disclosure?.netProceeds??loan.principal,totalRepayment:rows.reduce((n,r)=>n+r.amount,0),status:installmentGroupState(loan,stagingRows().filter(t=>t.loanId===loan.id),localToday()),penaltyRate:3,latePaymentFee:1500,rows};
};
const stagingOriginalBalance=balance;
balance=()=>stagingOriginalBalance().replace(cash(67158.99),cash(stagingRows().filter(stagingOwed).reduce((n,t)=>n+t.amount,0))).replace('7 items · Current due Oct 25, 2026 · Past due Sep/Aug 2026',countLabel(stagingRows().filter(stagingOwed).length,'outstanding item'));
viewRecentPayment=id=>stagingSend({type:'proof',id});
downloadRecentPayment=id=>stagingSend({type:'proof',id});
disbursementAcceptance=r=>r.acceptedAt;
refreshDisbursements=()=>{stagingSend({type:'refresh'});toast('Refreshing local records…');};
invoiceRows=()=>stagingRows().filter(t=>t.dueDate===dueKey(invoiceDueDates()[invoiceDueIndex]||new Date())).map(t=>({title:t.description,transactionDate:t.txnDate,amount:t.amount,status:stagingStatus(t),paidDate:t.datePaid||'',dueDate:t.dueDate}));
invoiceDueDates=()=>[...new Set(stagingRows().map(t=>t.dueDate))].sort().map(d=>new Date(d+'T00:00:00'));

// Keep the approved controls and validation UI without simulated persistence.
[ 'submitproof','removeRecentPayment','retractRecentPayment','submitLoanRequest','submitSupportRequest','savePersonalInformation','submitPasswordChange','sendChatMessage','generateInvoice','showAcknowledgement','acceptDisbursement','confirmDisbursement','deleteChatMessage','toggleNotificationRead','markAllNotificationsRead' ].forEach(name=>{if(typeof window[name]==='function')window[name]=event=>{event?.preventDefault?.();stagingPending();};});
const stagingRender=render;
render=()=>{
  resetBorrowerAccountDisplays();
  stagingRender();
  if(page==='dashboard'&&stagingData){
    const value=$('.balance-amount-value');if(value)value.textContent=cash(stagingTotal());
    const count=$('.balance-count b');if(count)count.textContent=stagingDue().length;
    const foot=$('.balance-foot>span:first-child');if(foot)foot.innerHTML=borrowerAccountDisplayHTML();
  }
  if(page==='profile'&&stagingData){const next=$('.profile-overview div b');if(next)next.textContent=stagingDue(1).length?stagingDate(stagingDue(1)[0].dueDate)+' · '+cash(stagingTotal(1)):'No next due dates set';}
};
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='loanledger-v41224')return;
  const message=event.data;
  if(message.type==='error'){stagingLoginError(message.message);if(page!=='login')toast(message.message);}
  if(message.type==='session'){
    // The initial signed-out handshake must not reset a form already being
    // filled. A real logout still clears the previously authenticated data.
    if(message.state==='signed-out'&&!stagingData&&page==='login')return;
    if(message.state==='signed-out'){stagingSnapshotKey=null;stagingData=null;recentPayments=[];mostRecentPayment=null;chatMessages=[];loanRequests=[];notificationItems=[];disbursementRecords=[];page='login';stagingBusy=false;render();}
    if(message.state==='blocked')stagingLoginError('This account is disabled. Contact your lender.');
    if(message.state==='error')stagingLoginError('Local records could not be loaded. Start local Supabase, then retry.');
  }
  if(message.type==='snapshot'){
    if(stagingData?.user.id===message.data.user.id&&typeof preservePaymentSnapshot==='function'&&preservePaymentSnapshot(message.data))return;
    const key=JSON.stringify(message.data);if(key===stagingSnapshotKey)return;stagingSnapshotKey=key;
    const sameOwner=stagingData?.user.id===message.data.user.id,focused=document.activeElement;
    const focus=sameOwner&&focused?.id?{id:focused.id,start:focused.selectionStart,end:focused.selectionEnd}:null;
    const scroll=sameOwner?['.phone-screen','#app','#chatMessages','.quick-access-section .quickgrid'].map(selector=>({selector,top:document.querySelector(selector)?.scrollTop||0,left:document.querySelector(selector)?.scrollLeft||0})):[];
    const previousUser=stagingData?.user.id;stagingData=message.data;
    const user=stagingData.user;
    if(!personalInfoEditing||previousUser!==user.id)personalInfo={fullName:[user.firstName,user.lastName].filter(Boolean).join(' ')||user.name,preferredDisplayName:user.nickname||'',email:user.email,phone:user.phone,birthDate:'',address:'',occupation:''};profilePhotoData=user.avatarUrl||'';
    recentPayments=stagingData.payments.map(p=>({id:p.id,amount:p.amount,submittedAt:p.submittedAt,paidDate:stagingDate(p.submittedAt),dueDate:'See lender allocation',reference:p.reference,proofName:p.fileName,method:p.method,status:p.status[0].toUpperCase()+p.status.slice(1),reviewedDate:stagingDate(p.reviewedAt),format:p.fileType==='pdf'?'PDF':'IMAGE',note:p.note}));
    mostRecentPayment=recentPayments.find(p=>p.id===mostRecentPayment?.id)||null;
    chatMessages=stagingData.messages.map(m=>({id:m.id,sender:m.fromAdmin?'lender':'borrower',body:m.body,time:new Date(m.createdAt).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}),replyTo:null,reactions:[]}));
    notificationItems=stagingData.notifications.map(n=>({id:n.id,kind:({payment:'Payment',document:'Loan',account:'Account',general:'Account'}[n.category]||'Account'),icon:'♧',title:htmlSafe(n.title),detail:htmlSafe(n.body),time:new Date(n.createdAt).toLocaleString('en-PH')}));
    disbursementRecords=stagingData.disbursements.map(d=>({id:d.disbursementNumber,loanRef:d.reference,date:d.disbursementDate,issued:d.valueDate||d.disbursementDate,agreementDate:d.agreementDate,borrower:user.name,gross:d.grossAmount,deductions:d.deductionItems,acceptedAt:d.acknowledgedAt,release:d.status,mode:d.disbursementMode,receiving:[d.bankName,d.bankAccountNumber,d.bankAccountName].filter(Boolean).join(' · '),receivingBank:{bankName:d.bankName,accountNumber:d.bankAccountNumber,accountName:d.bankAccountName}}));
    loanRequests=stagingData.requests.map(r=>({...r,id:r.requestNumber||r.id,amount:r.amount,term:r.termMonths,rate:r.monthlyRate,bank:r.bankName,accountNumber:r.bankAccountNumber,accountName:r.bankAccountName,status:r.status,createdAt:r.createdAt,fees:{processing:r.processingFee,dst:r.dst,notarial:r.notarialFee},schedule:(r.schedule||[]).map(row=>({month:row.month,payment:row.totalPayment,remaining:row.remainingBalance}))}));
    if(previousUser!==user.id||page==='login'){dashboardGreetingChoice=null;dashboardGreetingLanguage=null;dashboardGreetingTranslation=null;finderCompact=true;page='dashboard';previousPage='login';}
    stagingBusy=false;render();
    for(const saved of scroll){const target=document.querySelector(saved.selector);if(target){target.scrollTop=saved.top;target.scrollLeft=saved.left;}}
    if(focus){const target=document.getElementById(focus.id);if(target){target.focus({preventScroll:true});try{target.setSelectionRange(focus.start,focus.end)}catch{}}}
  }
  if(message.type==='proof'&&message.url){const url=new URL(message.url);if(url.origin!=='http://127.0.0.1:54321')return;closeRecentProofModal();const modal=document.createElement('div');modal.id='recentProofModal';modal.className='recent-proof-overlay';modal.innerHTML='<div class="recent-proof-dialog" role="dialog" aria-modal="true"><button class="recent-proof-close" onclick="closeRecentProofModal()">×</button><h2>Payment proof</h2>'+(message.mime==='pdf'?'<iframe class="proof-real-preview" title="Payment proof"></iframe>':'<img class="proof-real-preview" alt="Payment proof">')+'</div>';modal.querySelector('iframe,img').src=url.href;document.body.appendChild(modal);}
});
render();stagingSend({type:'ready'});
