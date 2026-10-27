// Fee identification comes from persisted metadata, never guessed from a title.
let feePresentationSource=null,feePresentationTitles=new Set();
function isAssessedFeeTitle(title){if(feePresentationSource!==stagingData){feePresentationSource=stagingData;feePresentationTitles=new Set(stagingRows().filter(t=>TransactionGroups.transactionGroup(t)==='fees'||t.feeKind).map(t=>htmlSafe(t.description)));}return feePresentationTitles.has(title);}
const itemBeforeAssessedFees=transactionItem;
transactionItem=(icon,title,sub,amount,color='',kind='',status='',extraClass='',dateText='')=>itemBeforeAssessedFees(icon,title,sub,amount,color,kind,status,(extraClass+' '+(isAssessedFeeTitle(title)?'assessed-fee-entry':'')).trim(),dateText);
function assessedFeeHistory(){
 if(!['All','Fees'].includes(hf))return '';
 const rows=stagingRows().filter(t=>t.feeKind&&t.feeAssessmentId).slice().sort((a,b)=>String(b.txnDate).localeCompare(String(a.txnDate))||String(a.id).localeCompare(String(b.id)));
 if(!rows.length)return '';
 const fil=preferredLanguage==='Filipino';
 return '<section class="section assessed-fee-history" data-no-translate aria-label="Assessed fees"><div class="sectiontitle"><h2>'+(fil?'Mga naitalang singil':'Assessed fees')+'</h2><span class="count">'+rows.length+'</span></div>'+expandableRowsHTML('fee-history',rows.map(t=>{const row='<div data-fee-ledger-id="'+htmlSafe(t.id)+'">'+transactionItem('! ',htmlSafe(t.description),(fil?'Takdang bayaran ':'Due ')+htmlSafe(stagingDate(t.dueDate)),t.amount,'red','Assessed fee',stagingStatus(t),'assessed-fee-entry',stagingDate(t.txnDate))+'</div>';return typeof retailTransactionRowHTML==='function'?retailTransactionRowHTML(row,t.id):row;}),10)+'</section>';
}
const historyBeforeAssessedFees=history;history=()=>insertCreditActivity(historyBeforeAssessedFees(),assessedFeeHistory());
if(['transactions','history','straight','dashboard'].includes(page))render();
