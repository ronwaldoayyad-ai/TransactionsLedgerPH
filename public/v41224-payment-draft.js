// Retain an unfinished proof only for the authenticated borrower who owns it.
let paymentDraftOwner=null,paymentDraftMemory=null,paymentDraftRestoring=false,paymentDraftProtected=false,paymentDraftQueuedSnapshot=null,paymentDraftQueue=Promise.resolve(),paymentDraftDB=null,paymentDraftTimer=null,paymentDraftRevision=0;
const paymentDraftFields=['amount','date','ref','paymentMethod','notes','mobileCorrectionNote'];
function paymentDraftDatabase(){if(!paymentDraftDB)paymentDraftDB=new Promise((resolve,reject)=>{const request=indexedDB.open('loanledger-payment-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'owner'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return paymentDraftDB;}
async function paymentDraftStorage(mode,record){if(mode==='write'&&record.blob instanceof Blob)record={...record,blob:await record.blob.arrayBuffer()};const db=await paymentDraftDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('drafts'),request=mode==='read'?store.get(record):mode==='delete'?store.delete(record):store.put(record);let result;request.onsuccess=()=>result=request.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function paymentDraftPersist(record){paymentDraftQueue=paymentDraftQueue.catch(()=>{}).then(()=>paymentDraftStorage(record?'write':'delete',record||paymentDraftOwner)).catch(()=>{if(page==='payment'&&stagingData?.user.id===paymentDraftOwner){const notice=$('#paymentDraftNotice');if(notice)notice.textContent='Your draft is retained in this tab. Device storage is unavailable; keep this tab open to retry.';}});return paymentDraftQueue;}
function capturePaymentDraft(){
 if(paymentDraftRestoring||page!=='payment'||!stagingData?.user.id||stagingData.user.id!==paymentDraftOwner||!$('#amount'))return paymentDraftMemory;
 const fields=Object.fromEntries(paymentDraftFields.map(id=>[id,$('#'+id)?.value||'']));
 const record={owner:paymentDraftOwner,revision:++paymentDraftRevision,fields,confirmed:!!$('#allocationConfirm')?.checked,dates:[...paymentDueKeys],selected:[...paymentSelected].map(i=>paymentRows[i]?.[4]).filter(Boolean),selectedAmounts:[...paymentSelected].map(i=>[paymentRows[i]?.[4],paymentRows[i]?.[2]]),blob:file||null,name:file?.name||'',type:file?.type||'',lastModified:file?.lastModified||0,ocr:proofOcrFields?{...proofOcrFields}:null,correction:mobileCorrection?{id:mobileCorrection.id,reference:mobileCorrection.reference}:null};
 if(!record.blob&&!record.dates.length&&!Object.values(fields).some(Boolean))return paymentDraftMemory;
 record.error=paymentDraftMemory?.error||'';paymentDraftMemory=record;clearTimeout(paymentDraftTimer);paymentDraftTimer=setTimeout(()=>paymentDraftPersist(record),120);return record;
}
function restorePaymentDraft(){
 const draft=paymentDraftMemory;if(!draft||draft.owner!==stagingData?.user.id||page!=='payment'||!$('#amount'))return;
 paymentDraftRestoring=true;
 try{
  const records=borrowerPayableRecords(),byId=new Map(records.map(r=>[r[4],r]));paymentDueKeys=new Set(draft.dates.filter(date=>records.some(r=>r[3]===date)));paymentRows=records.filter(r=>paymentDueKeys.has(r[3]));paymentSelected=new Set(paymentRows.flatMap((r,i)=>draft.selected.includes(r[4])&&(paymentItemSelectable(r)||paymentItemCredit(r))?[i]:[]));
  sanitizePaymentSelection();const changed=draft.selected.some(id=>!byId.has(id)||(!paymentItemSelectable(byId.get(id))&&!paymentItemCredit(byId.get(id)))||Number(byId.get(id)[2])!==Number(draft.selectedAmounts.find(r=>r[0]===id)?.[1]))||[...paymentSelected].some(i=>!draft.selected.includes(paymentRows[i][4]));
  file=draft.blob?new File([draft.blob],draft.name,{type:draft.type,lastModified:draft.lastModified}):null;proofOcrFields=draft.ocr;mobileCorrection=draft.correction;
  if(draft.correction&&!$('#mobileCorrectionNote')){const label=document.createElement('label');label.className='field';label.innerHTML='<span>What has been corrected? *</span><textarea id="mobileCorrectionNote" minlength="10" maxlength="2000"></textarea>';$('#paymentError').before(label);}
  renderPaymentDates();renderPaymentItems();for(const [id,value] of Object.entries(draft.fields)){const el=$('#'+id);if(el)el.value=value;}$('#allocationConfirm').checked=draft.confirmed&&!changed;
  if(file){$('#filename').textContent=file.name;$('#filemeta').textContent=(file.size/1024).toFixed(1)+' KB · Attached';$('#paymentDetailsStep').hidden=false;try{const transfer=new DataTransfer();transfer.items.add(file);$('#proof').files=transfer.files;}catch{/* Submission uses the retained File directly. */}}
  paymentAllocationChanged();if(draft.error)$('#paymentError').textContent=draft.error;setPaymentDraftBusy(mobileProofSubmitting);let notice=$('#paymentDraftNotice');if(!notice){notice=document.createElement('div');notice.id='paymentDraftNotice';notice.className='payment-draft-notice';notice.setAttribute('role','status');$('.payment-card').prepend(notice);}notice.innerHTML='<span>'+ (changed?'Draft restored. Selected items changed; review your allocation.':'Your unsubmitted draft is retained for retry.')+'</span><button type="button" onclick="discardPaymentDraft()">Discard draft</button>';
 }finally{paymentDraftRestoring=false;}
}
async function forgetPaymentDraft(owner=paymentDraftOwner){clearTimeout(paymentDraftTimer);paymentDraftMemory=null;file=null;proofOcrFields=null;paymentDueKeys.clear();paymentSelected.clear();paymentRows=[];const selectedOwner=owner;paymentDraftQueue=paymentDraftQueue.catch(()=>{}).then(()=>paymentDraftStorage('delete',selectedOwner)).catch(()=>{});await paymentDraftQueue;}
async function discardPaymentDraft(){if(mobileProofSubmitting||proofScanBusy){toast('Wait for the current payment process to finish.');return;}if(!confirm('Discard this unsubmitted payment draft?'))return;await forgetPaymentDraft();resetPaymentSuccess();$('#paymentDraftNotice')?.remove();}
function retainPaymentSubmissionError(owner,message){if(paymentDraftMemory?.owner!==owner)return;paymentDraftMemory.error=message;paymentDraftPersist(paymentDraftMemory);}
function setPaymentDraftBusy(busy){if(page!=='payment')return;document.querySelectorAll('#amount,#date,#ref,#paymentMethod,#notes,#proof,#allocationConfirm,#selectAllItems,#paymentDateToggle,#paymentItems input,.due-pill,#mobileCorrectionNote').forEach(el=>{if(busy){if(el.dataset.paymentBusyDisabled===undefined)el.dataset.paymentBusyDisabled=String(el.disabled);el.disabled=true;}else if(el.dataset.paymentBusyDisabled!==undefined){el.disabled=el.dataset.paymentBusyDisabled==='true';delete el.dataset.paymentBusyDisabled;}});}
function preservePaymentSnapshot(data){if(page!=='payment'||data.user.id!==paymentDraftOwner)return false;capturePaymentDraft();if(proofScanBusy||mobileProofSubmitting){paymentDraftQueuedSnapshot=data;return true;}paymentDraftQueuedSnapshot=null;return false;}
function flushPaymentSnapshot(){if(proofScanBusy||mobileProofSubmitting)return;const data=paymentDraftQueuedSnapshot;paymentDraftQueuedSnapshot=null;if(data&&data.user.id===stagingData?.user.id)window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:parent,data:{channel:'loanledger-v41224',type:'snapshot',data}}));}
const draftClearProof=clearPaymentProof;clearPaymentProof=()=>{if(!paymentDraftProtected)draftClearProof();};
const draftPaymentScreen=payment;payment=()=>{const dates=new Set(paymentDueKeys),selected=new Set(paymentSelected),rows=paymentRows.slice();paymentDraftProtected=true;try{return draftPaymentScreen();}finally{paymentDraftProtected=false;paymentDueKeys=dates;paymentSelected=selected;paymentRows=rows;}};
const draftGo=go;go=destination=>{
 if(page==='payment'&&destination!=='payment'){capturePaymentDraft();clearTimeout(paymentDraftTimer);if(paymentDraftMemory)paymentDraftPersist(paymentDraftMemory);if(proofScanBusy){useManualPaymentDetails();capturePaymentDraft();}paymentDraftProtected=true;try{draftGo(destination);}finally{paymentDraftProtected=false;}flushPaymentSnapshot();}
 else draftGo(destination);
};
const draftRender=render;render=()=>{
 if(page==='payment'&&paymentDraftOwner===stagingData?.user.id&&$('#amount')&&(proofScanBusy||mobileProofSubmitting))return;
 if(page==='payment'&&paymentDraftOwner===stagingData?.user.id&&$('#amount'))capturePaymentDraft();
 const owner=stagingData?.user.id||null;
 if(owner!==paymentDraftOwner){draftClearProof();paymentDraftOwner=owner;paymentDraftMemory=null;paymentDraftQueuedSnapshot=null;file=null;proofOcrFields=null;mobileCorrection=null;paymentDueKeys.clear();paymentSelected.clear();paymentRows=[];if(owner){const requestedOwner=owner;paymentDraftQueue.catch(()=>{}).then(()=>paymentDraftStorage('read',requestedOwner)).then(draft=>{if(paymentDraftOwner===requestedOwner&&draft&&!paymentDraftMemory){paymentDraftMemory=draft;if(page==='payment')restorePaymentDraft();}}).catch(()=>{});}}
 draftRender();if(page==='payment'&&owner){requestAnimationFrame(()=>restorePaymentDraft());}
};
const draftPick=pick;pick=async input=>{const result=draftPick(input);capturePaymentDraft();try{await result;}finally{capturePaymentDraft();flushPaymentSnapshot();}};
const draftResetSuccess=resetPaymentSuccess;resetPaymentSuccess=()=>{const owner=paymentDraftOwner;forgetPaymentDraft(owner);draftResetSuccess();$('#paymentDraftNotice')?.remove();};
document.addEventListener('input',event=>{if(page==='payment'&&event.target.closest('#app'))capturePaymentDraft();});document.addEventListener('change',event=>{if(page==='payment'&&event.target.closest('#app'))capturePaymentDraft();});
window.addEventListener('pagehide',()=>{capturePaymentDraft();clearTimeout(paymentDraftTimer);if(paymentDraftMemory)paymentDraftPersist(paymentDraftMemory);});
window.addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&event.data?.channel==='loanledger-v41224'&&event.data.type==='session'&&event.data.state==='signed-out'){paymentDraftOwner=null;paymentDraftMemory=null;paymentDraftQueuedSnapshot=null;file=null;}});
render();
