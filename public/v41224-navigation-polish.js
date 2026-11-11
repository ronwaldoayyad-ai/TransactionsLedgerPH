// Notify the optional GPU border after the complete borrower/desktop render.
const positionFinderBeforeNavigationPolish=positionFinder;
positionFinder=()=>{if(finderCompact&&dashboardOrbitEligible())return;positionFinderBeforeNavigationPolish();};
const renderBeforeNavigationPolish=render;
render=()=>{renderBeforeNavigationPolish();window.dispatchEvent(new Event('loanledger-screen-rendered'));};

// Reuse existing borrower screens and downloads; activity never mutates records.
function borrowerActivityTarget(element){
 const owner=stagingData?.user?.id;if(!owner)return null;
 const proofId=element.dataset.paymentProofId;
 if(proofId){const proof=stagingData.payments?.find(p=>String(p.id)===proofId&&(!p.userId||p.userId===owner));return proof?{kind:'proof',id:proofId}:null;}
 const id=element.dataset.stagingTransactionId,transaction=stagingRows().find(t=>String(t.id)===id&&(!t.userId||t.userId===owner));
 if(!transaction)return null;
 const index=stagingLoans().findIndex(loan=>loan.id===transaction.loanId);
 return index<0?null:{kind:'installment',index,title:transaction.description};
}
function openActivityPayment(id){
 if(!borrowerActivityTarget({dataset:{paymentProofId:String(id)}}))return;
 const owner=stagingData.user.id;
 recentPaymentFilter='All';recentShowAll=true;go('payment');
 // payment() schedules its existing render; focus after that render completes.
 setTimeout(()=>{
  if(page!=='payment'||stagingData?.user?.id!==owner)return;
  recentPaymentFilter='All';recentShowAll=true;renderRecentPayments();
  const row=[...document.querySelectorAll('#recentPaymentsPanel .recent-payment-row')].find(row=>row.dataset.paymentId===String(id));
  if(!row)return;
  row.classList.add('activity-payment-target');row.tabIndex=-1;
  row.setAttribute('aria-label','Selected payment submission');
  row.scrollIntoView({block:'center',behavior:'auto'});row.focus({preventScroll:true});
 },0);
}
function decorateBorrowerActivityLinks(){
 document.querySelectorAll('[data-payment-proof-id],[data-staging-transaction-id]').forEach(row=>{
  if(row.hasAttribute('onclick'))return;
  const target=borrowerActivityTarget(row);if(!target)return;
  row.classList.add('activity-record-link');row.setAttribute('role','button');row.tabIndex=0;
  row.setAttribute('aria-label',target.kind==='proof'?'View payment submission details':'View loan schedule for '+target.title);
 });
}
function activateBorrowerActivity(event){
 const row=event.target.closest?.('.activity-record-link');if(!row||event.target.closest('a,button,input,select,textarea'))return;
 if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
 const target=borrowerActivityTarget(row);if(!target)return;
 event.preventDefault();
 if(target.kind==='proof')openActivityPayment(target.id);else openInstallment(target.index);
}
document.addEventListener('click',activateBorrowerActivity);
document.addEventListener('keydown',activateBorrowerActivity);
window.addEventListener('loanledger-screen-rendered',decorateBorrowerActivityLinks);
decorateBorrowerActivityLinks();
