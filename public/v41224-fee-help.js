// The loan request and installment disclosure share the same explanatory copy.
function loanFeeDescription(label){
 return ({
  'Documentary Stamp Tax':'Documentary Stamp Tax (DST) is auto-calculated at ₱1.50 per ₱200 of the loan amount, applied when the amount is ₱500,000 or more.',
  'Processing Fee':'A fixed processing fee of '+cash(1500)+' is billed one-time on the first monthly amortization.',
  'Notarial Fee':'A notarial fee of 0.35% of the loan amount is charged one-time on the first monthly amortization, applied when the amount is ₱500,000 or more.'
 })[label]||'';
}
function loanFeeInfoButton(label){
 return loanFeeDescription(label)?'<button type="button" class="loan-fee-info" aria-label="About '+htmlSafe(label)+'" aria-haspopup="dialog" onclick="showLoanFeeInfo('+htmlSafe(JSON.stringify(label))+',this)"><span aria-hidden="true">i</span></button>':'';
}
function closeLoanFeeInfo(){document.querySelector('#loanFeeInfoDialog')?.close();}
function showLoanFeeInfo(label,trigger){
 const description=loanFeeDescription(label);if(!description)return;
 document.querySelector('#loanFeeInfoDialog')?.remove();
 const dialog=document.createElement('dialog');dialog.id='loanFeeInfoDialog';dialog.className='loan-fee-dialog';
 dialog.setAttribute('aria-labelledby','loanFeeInfoHeading');dialog.setAttribute('aria-describedby','loanFeeInfoDescription');
 dialog.innerHTML='<button type="button" class="loan-fee-close" aria-label="Close fee information">×</button><h2 id="loanFeeInfoHeading">'+htmlSafe(label)+'</h2><p id="loanFeeInfoDescription">'+htmlSafe(description)+'</p>';
 dialog.querySelector('button').onclick=closeLoanFeeInfo;
 dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
 document.body.append(dialog);dialog.showModal();
}
