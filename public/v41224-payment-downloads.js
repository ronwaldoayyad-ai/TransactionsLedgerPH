// Download the saved submission confirmation without opening the submission popup or emitting a new event.
function savedPaymentConfirmation(id,owner=paymentConfirmationOwner()){
 if(!owner||owner!==paymentConfirmationOwner())throw Error('This submission confirmation is no longer available.');
 const record=stagingData?.payments?.find(payment=>String(payment.id)===String(id));
 if(!record||record.userId&&record.userId!==owner)throw Error('This submission confirmation is no longer available.');
 const receipt=recentPayments.find(payment=>String(payment.id)===String(id))?.acknowledgement?.number;
 return paymentConfirmationModel({...record,receiptNumber:record.receiptNumber||receipt||''});
}
async function downloadPaymentConfirmation(id){
 const owner=paymentConfirmationOwner(),isCurrent=()=>!!owner&&owner===paymentConfirmationOwner()&&stagingData?.payments?.some(payment=>String(payment.id)===String(id)&&(!payment.userId||payment.userId===owner));
 try{
  const model=savedPaymentConfirmation(id,owner);
  const unchanged=()=>isCurrent()&&JSON.stringify(savedPaymentConfirmation(id,owner))===JSON.stringify(model);
  const filename='Payment-submission-'+(model.receipt||model.id).replace(/[^a-z0-9_-]/gi,'-').slice(0,90)+'.png';
  return await downloadAppFile(async()=>{
   if(!unchanged())throw Error('This submission confirmation changed. Please download it again.');
   const image=await paymentConfirmationImage(model);
   if(!isCurrent())throw Error('This submission confirmation is no longer available.');
   return image;
  },filename,'image/png',null,unchanged);
 }catch{toast('Unable to prepare this submission confirmation. Please try again.');return false;}
}
function decorateConfirmationDownloads(){
 document.querySelectorAll('.recent-payment-row').forEach(row=>{
  const actions=row.querySelector('.recent-actions'),proof=actions?.querySelector('[onclick^="downloadRecentPayment"]');
  const id=proof?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
  if(!actions||!proof||!id)return;
  let group=actions.querySelector('.recent-downloads');
  if(!group){group=document.createElement('div');group.className='recent-downloads';group.setAttribute('role','group');group.setAttribute('aria-label','Payment downloads');actions.prepend(group);}
  let receipt=actions.querySelector('[onclick^="downloadAcknowledgement"]');
  if(!receipt){receipt=document.createElement('button');receipt.type='button';receipt.disabled=true;receipt.setAttribute('onclick','downloadAcknowledgement('+JSON.stringify(id)+')');receipt.setAttribute('aria-label','Receipt unavailable for this payment');}
  let confirmation=actions.querySelector('[onclick^="downloadPaymentConfirmation"]');
  if(!confirmation){confirmation=document.createElement('button');confirmation.type='button';confirmation.setAttribute('onclick','downloadPaymentConfirmation('+JSON.stringify(id)+')');confirmation.setAttribute('aria-label','Download submission confirmation');}
  confirmation.disabled=!paymentConfirmationOwner()||!stagingData?.payments?.some(payment=>String(payment.id)===String(id)&&(!payment.userId||payment.userId===paymentConfirmationOwner()));
  group.append(proof,receipt,confirmation);
 });
 decoratePaymentDownloads();
}
const recentBeforeConfirmationDownloads=renderRecentPayments;
renderRecentPayments=()=>{recentBeforeConfirmationDownloads();decorateConfirmationDownloads();};
decorateConfirmationDownloads();
