// Request-a-loan copy remains Cash Loan; schedule help follows its actual loan group.
function loanFeeDescription(label){
 const loan=typeof page!=='undefined'&&page==='installmentDetail'&&typeof stagingLoans==='function'?stagingLoans()[selectedInstallmentIndex]:null;
 const group=loan?TransactionGroups.defaultInstallmentGroup(loan):'cash_loan';
 return LoanFeeHelp.loanFeeHelp(label,group,cash(1500));
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
