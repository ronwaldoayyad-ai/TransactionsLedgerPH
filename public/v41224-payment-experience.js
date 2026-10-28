function proofCandidateError(candidate){
 if(!candidate)return '';
 if(!candidate.size)return 'This file is empty. Choose a JPG, PNG, WebP or PDF.';
 if(candidate.size>5242880)return 'File exceeds 5 MB. Choose a smaller file.';
 if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(candidate.type))return 'Choose a JPG, PNG, WebP or PDF.';
 return '';
}
// Browser integration: validate replacements before the old picker clears the draft.
function refreshChangeProof(){
 const input=$('#proof');if(!input)return;
 if(!file&&$('#filemeta'))$('#filemeta').textContent='JPG, PNG, WebP or PDF · Max 5 MB';
 let button=$('#changePaymentProof');
 if(!button){button=document.createElement('button');button.id='changePaymentProof';button.type='button';button.className='secondary';button.style.cssText='margin-top:10px;min-height:42px;width:100%';button.onclick=()=>input.click();input.closest('label')?.after(button);if(!button.isConnected)input.parentElement.after(button);}
 button.textContent=preferredLanguage==='Filipino'?'Palitan ang patunay':'Change uploaded image';button.hidden=!file;button.disabled=mobileProofSubmitting;
}
const experiencePick=pick;
pick=async input=>{const error=proofCandidateError(input.files?.[0]);if(error){input.value='';$('#paymentError').textContent=error;refreshChangeProof();return;}const pending=experiencePick(input);refreshChangeProof();try{await pending;}finally{refreshChangeProof();}};
const experienceRestore=restorePaymentDraft;restorePaymentDraft=()=>{experienceRestore();refreshChangeProof();};
const experienceClear=clearPaymentProof;clearPaymentProof=()=>{experienceClear();refreshChangeProof();};
const experienceBusy=setPaymentDraftBusy;setPaymentDraftBusy=busy=>{experienceBusy(busy);refreshChangeProof();};
const experienceRender=render;render=()=>{experienceRender();if(page==='payment')refreshChangeProof();};
refreshChangeProof();
