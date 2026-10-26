// A confirmation of the saved proof and its current lender review status.
let paymentConfirmationState=null,paymentConfirmationGeneration=0;
const paymentConfirmationOwner=()=>stagingData?.user?.id||null;
const paymentConfirmationMoney=cents=>'PHP '+(cents/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
function paymentConfirmationDate(value,time=false){if(!value)return '';if(time&&/^\d{4}-\d{2}-\d{2}$/.test(String(value)))time=false;const date=new Date(time?value:String(value).slice(0,10)+'T00:00:00');if(!Number.isFinite(date.getTime()))return '';return date.toLocaleString('en-PH',time?{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Manila'}:{month:'short',day:'numeric',year:'numeric'});}
function paymentConfirmationApprovalDate(record){
 const values=[record.reviewedAt,record.approvedAt,record.postedAt],timestamp=values.find(value=>/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(String(value))&&Number.isFinite(new Date(value).getTime()));
 if(timestamp)return paymentConfirmationDate(timestamp,true);
 const date=values.map(value=>paymentConfirmationDate(value)).find(Boolean);return date?date+' · Time not recorded':'Not recorded';
}
function paymentConfirmationModel(record){
 const paid=Math.round(Number(record.amount)*100);if(!record.id||!Number.isSafeInteger(paid)||paid<=0)throw Error('The saved payment confirmation is incomplete.');
 const rows=record.requestedAllocations??record.allocations,known=Array.isArray(rows)&&rows.length>0&&rows.every(item=>Number.isFinite(Number(item.amount))&&Number(item.amount)>0);
 const selected=known?rows.reduce((total,item)=>total+Math.round(Number(item.amount)*100),0):null,difference=known?selected-paid:null;
 const raw=String(record.status||'pending').toLowerCase(),statusKey=record.retractedAt?'withdrawn':raw;
 const approved=statusKey==='approved',rejected=statusKey==='rejected',withdrawn=['withdrawn','retracted','cancelled','canceled'].includes(statusKey);
 const status=approved?'Approved':rejected?'Rejected':withdrawn?'Withdrawn':'Submitted for review';
 const title=approved?'Proof of Payment Approved!':rejected?'Proof of Payment Rejected':withdrawn?'Proof of Payment Withdrawn':'Proof of Payment Submitted!';
 const subtitle=approved?'Your submission has been approved.':rejected?'Your submission was not approved. Please review the lender’s note.':withdrawn?'This submission has been withdrawn.':'Your submission is being verified.';
 const approvedAt=approved?paymentConfirmationApprovalDate(record):'';
 return Object.freeze({id:String(record.id),receipt:String(record.receiptNumber||''),paid,selected,difference,coverage:difference===null?'':difference>0?'Partially covered':difference<0?'Excess submitted':'Fully covered',paymentDate:paymentConfirmationDate(record.paidDate),submittedAt:paymentConfirmationDate(record.submittedAt,true),approvedAt,approved,title,subtitle,statusKey,reference:String(record.reference||''),channel:({bank_transfer:'Bank Transfer',gcash:'GCash',maya:'Maya',cash:'Cash Deposit'}[record.method]||String(record.method||'')),status,reconciliationNote:approved?'Based on your submitted amount. Refer to your transaction ledger for the reviewed allocation.':'Based on the submitted amount. Dues update after lender approval.'});
}
function paymentConfirmationRows(model){return [model.channel&&['Payment channel',model.channel],['Amount paid',paymentConfirmationMoney(model.paid)],['Transaction status',model.status]].filter(Boolean);}
function paymentConfirmationReconciliation(model){if(model.selected===null)return [];return [['Total selected amount due',paymentConfirmationMoney(model.selected)],['Amount submitted',paymentConfirmationMoney(model.paid)],[model.difference<0?'Excess submitted amount':'Remaining balance / difference',paymentConfirmationMoney(Math.abs(model.difference))]];}
function paymentConfirmationHTML(model){const esc=htmlSafe;return '<button type="button" class="payment-confirmation-close" aria-label="Close payment confirmation">'+transferSvg('close')+'</button><div class="payment-confirmation-content"><header class="payment-confirmation-heading"><span class="payment-confirmation-check" aria-hidden="true">✓</span><h2 id="paymentConfirmationHeading">'+esc(model.title)+'</h2><p>'+esc(model.subtitle)+'</p><strong class="payment-confirmation-amount"><small>PHP</small> '+esc(paymentConfirmationMoney(model.paid).slice(4))+'</strong></header><section class="payment-confirmation-card payment-confirmation-meta" aria-label="Submission information">'+(model.paymentDate?'<span>Payment date</span><b data-confirmation="date">'+esc(model.paymentDate)+'</b>':'')+(model.reference?'<span>Reference no.</span><b class="payment-confirmation-reference" data-confirmation="reference">'+esc(model.reference)+'</b>':'')+(model.submittedAt?'<span>Submitted on</span><b class="payment-confirmation-timestamp">'+esc(model.submittedAt)+'</b>':'')+(model.approved?'<span>Approved on</span><b data-confirmation="approved-at">'+esc(model.approvedAt)+'</b>':'')+'</section><section class="payment-confirmation-card"><h3>Payment details</h3><dl>'+paymentConfirmationRows(model).map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd '+(label==='Transaction status'?'class="payment-confirmation-status"':'')+'>'+esc(value)+'</dd></div>').join('')+'</dl></section>'+(model.selected!==null?'<section class="payment-confirmation-card"><h3>Due &amp; submission reconciliation</h3><span class="payment-confirmation-coverage '+(model.difference>0?'partial':model.difference<0?'excess':'covered')+'">'+(model.difference===0?'✓ ':'')+esc(model.coverage)+'</span><dl class="payment-confirmation-reconciliation">'+paymentConfirmationReconciliation(model).map(([label,value],index)=>'<div><dt>'+esc(label)+'</dt><dd '+(index===2?'class="payment-confirmation-difference '+(model.difference>0?'partial':model.difference<0?'excess':'covered')+'"':'')+'>'+esc(value)+'</dd></div>').join('')+'</dl><p class="payment-confirmation-note">'+esc(model.reconciliationNote)+'</p></section>':'')+(model.receipt?'<p class="payment-confirmation-receipt">Receipt '+esc(model.receipt)+'</p>':'')+'</div><footer class="payment-confirmation-actions"><button type="button" class="payment-confirmation-save">'+transferSvg('download')+'<span>Save Image</span></button><button type="button" class="payment-confirmation-share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4m-6 8 6 4"/></svg><span>Share</span></button></footer>';}

// Draw a receipt directly from the same immutable model; no screen capture library.
async function paymentConfirmationImage(model){
 const canvas=document.createElement('canvas'),scale=3,width=360,ctx=canvas.getContext('2d');if(!ctx)throw Error('Image creation is unavailable.');
 canvas.width=width*scale;canvas.height=1200*scale;ctx.scale(scale,scale);const font=getComputedStyle(document.body).fontFamily;
 const setFont=(size=11,weight=400)=>{ctx.font=weight+' '+size+'px '+font;};
 const lines=(value,maxWidth,size=11,weight=400)=>{setFont(size,weight);const out=[];for(const paragraph of String(value).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){const candidate=line?line+' '+word:word;if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue;}if(line){out.push(line);line='';}if(ctx.measureText(word).width<=maxWidth){line=word;continue;}for(const character of word){if(line&&ctx.measureText(line+character).width>maxWidth){out.push(line);line='';}line+=character;}}out.push(line);}return out.length?out:[''];};
 const rounded=(x,y,w,h,radius)=>{ctx.beginPath();if(typeof ctx.roundRect==='function'){ctx.roundRect(x,y,w,h,radius);return;}ctx.moveTo(x+radius,y);ctx.arcTo(x+w,y,x+w,y+h,radius);ctx.arcTo(x+w,y+h,x,y+h,radius);ctx.arcTo(x,y+h,x,y,radius);ctx.arcTo(x,y,x+w,y,radius);ctx.closePath();};
 const operations=[];let y=36;
 operations.push(()=>{ctx.fillStyle='#00a88b';ctx.beginPath();ctx.arc(180,58,22,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(171,58);ctx.lineTo(178,65);ctx.lineTo(189,51);ctx.stroke();});
 const center=(text,top,size,weight,color)=>{const value=lines(text,320,size,weight);operations.push(()=>{ctx.fillStyle=color;ctx.textAlign='center';setFont(size,weight);value.forEach((line,index)=>ctx.fillText(line,180,top+index*(size+5)));});return top+value.length*(size+5);};
 y=center(model.managedCopy?.title||model.title,106,17,700,'#00a88b');y=center(model.managedCopy?.body||model.subtitle,y+1,10,400,'#536b88');y=center(paymentConfirmationMoney(model.paid),y+14,27,800,'#17263e')+18;
 function card(title,rows,badge='',lastColor=''){
  const top=y;let cursor=top+24;const items=[];
  if(title){items.push({text:title.toUpperCase(),x:34,y:cursor,size:10,weight:700,color:'#8298b5'});cursor+=24;}
  if(badge){items.push({text:badge,x:34,y:cursor,size:10,weight:700,color:model.difference>0?'#a86510':'#008f76'});cursor+=24;}
  rows.forEach(([label,value],rowIndex)=>{const labelLines=lines(label,136,10),valueLines=lines(value,155,11,600),height=Math.max(labelLines.length,valueLines.length)*15;labelLines.forEach((text,index)=>items.push({text,x:34,y:cursor+index*15,size:10,weight:400,color:'#536b88'}));valueLines.forEach((text,index)=>items.push({text,x:326,y:cursor+index*15,size:11,weight:600,color:rowIndex===rows.length-1&&lastColor?lastColor:label==='Transaction status'?'#008f76':'#17263e',right:true}));cursor+=height+14;});
  const height=cursor-top+3;operations.push(()=>{ctx.fillStyle='#fff';rounded(18,top,324,height,16);ctx.fill();for(const item of items){ctx.fillStyle=item.color;ctx.textAlign=item.right?'right':'left';setFont(item.size,item.weight);ctx.fillText(item.text,item.x,item.y);}});y=top+height+12;
 }
 const metadata=[model.paymentDate&&['Payment date',model.paymentDate],model.reference&&['Reference no.',model.reference],model.submittedAt&&['Submitted on',model.submittedAt],model.approved&&['Approved on',model.approvedAt]].filter(Boolean);
 card('',metadata);card('Payment details',paymentConfirmationRows(model));if(model.selected!==null){card('Due & submission reconciliation',paymentConfirmationReconciliation(model),model.coverage,model.difference>0?'#a86510':model.difference<0?'#1769f5':'#009e82');y=center(model.reconciliationNote,y+4,9,400,'#536b88')+8;}
 if(model.receipt)y=center('Receipt '+model.receipt,y+3,9,400,'#536b88')+8;
 canvas.height=Math.ceil(y+14)*scale;ctx.scale(scale,scale);ctx.fillStyle='#f6f9fc';ctx.fillRect(0,0,width,canvas.height/scale);for(const draw of operations)draw();
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Unable to prepare the confirmation image.')),'image/png'));
}
function closePaymentConfirmation(){paymentConfirmationGeneration++;const state=paymentConfirmationState;paymentConfirmationState=null;state?.dialog?.close();state?.dialog?.remove();if(state?.owner===paymentConfirmationOwner()&&state.focus?.isConnected)state.focus.focus({preventScroll:true});}
function paymentConfirmationCurrent(){const state=paymentConfirmationState;if(!state||state.owner!==paymentConfirmationOwner()||!state.dialog.isConnected){closePaymentConfirmation();return null;}return state;}
async function showPaymentConfirmation(record,owner=paymentConfirmationOwner(),beforeOpen=null){
 if(!owner||owner!==paymentConfirmationOwner())return false;closePaymentConfirmation();const generation=paymentConfirmationGeneration,model=paymentConfirmationModel(record),dialog=document.createElement('dialog');
 dialog.id='paymentConfirmationDialog';dialog.className='payment-confirmation-dialog';dialog.dataset.recordId=model.id;dialog.setAttribute('aria-labelledby','paymentConfirmationHeading');dialog.innerHTML=paymentConfirmationHTML(model);
 let image=null;try{image=await paymentConfirmationImage(model);}catch{}
 if(generation!==paymentConfirmationGeneration||owner!==paymentConfirmationOwner()||page!=='payment')return false;
 const filename='Payment-submission-'+(model.receipt||model.id).replace(/[^a-z0-9_-]/gi,'-').slice(0,90)+'.png';paymentConfirmationState={dialog,model,owner,image,filename,focus:document.activeElement,busy:false,version:0};
 dialog.querySelector('.payment-confirmation-close').onclick=closePaymentConfirmation;dialog.querySelector('.payment-confirmation-save').onclick=()=>savePaymentConfirmationImage();dialog.querySelector('.payment-confirmation-share').onclick=sharePaymentConfirmationImage;
 dialog.addEventListener('cancel',event=>{event.preventDefault();closePaymentConfirmation();});dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closePaymentConfirmation();}});
 beforeOpen?.();closeAcknowledgement();document.body.append(dialog);dialog.showModal();refreshPaymentConfirmation();dialog.querySelector('.payment-confirmation-close').focus({preventScroll:true});return true;
}
function paymentConfirmationBusy(state,busy){state.busy=busy;state.dialog.querySelectorAll('.payment-confirmation-actions button').forEach(button=>{button.disabled=busy;button.setAttribute('aria-busy',String(busy));});}
async function savePaymentConfirmationImage(){
 const state=paymentConfirmationCurrent();if(!state||state.busy)return false;
 refreshPaymentConfirmation();const version=state.version;paymentConfirmationBusy(state,true);
 const current=()=>state===paymentConfirmationCurrent()&&state.version===version;
 try{if(!state.image)state.image=await paymentConfirmationImage(state.model);if(!current())return false;
  return await downloadAppFile(()=>{if(!current())throw Error('The confirmation changed. Download it again.');return state.image;},state.filename,'image/png',null,current);
 }catch{toast('Unable to prepare the image. Please try again.');return false;}finally{paymentConfirmationBusy(state,false);}
}
function sharePaymentConfirmationImage(){const state=paymentConfirmationCurrent();if(!state||state.busy)return;let file,supported=false;try{file=state.image&&new File([state.image],state.filename,{type:'image/png'});supported=!!file&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}catch{}
 if(supported){
  paymentConfirmationBusy(state,true);let request;try{request=navigator.share({files:[file],title:state.model.title});}catch(error){request=Promise.reject(error);}
  return Promise.resolve(request).then(()=>{if(state===paymentConfirmationCurrent())toast('Sharing options opened.');return true;},error=>{if(error.name!=='AbortError'&&state===paymentConfirmationCurrent())toast('Unable to open sharing. Use Save Image to share from your device.');return false;}).finally(()=>paymentConfirmationBusy(state,false));
 }
 return savePaymentConfirmationImage().then(saved=>{if(saved&&state===paymentConfirmationCurrent())showDownloadNotice('Image download started. Share it from your device.');});
}
const goBeforePaymentConfirmation=go;go=destination=>{closePaymentConfirmation();goBeforePaymentConfirmation(destination);};
const renderBeforePaymentConfirmation=render;render=()=>{if(paymentConfirmationState&&paymentConfirmationState.owner!==paymentConfirmationOwner())closePaymentConfirmation();renderBeforePaymentConfirmation();refreshPaymentConfirmation();};
const allocationBeforePaymentConfirmation=paymentAllocationChanged;paymentAllocationChanged=()=>{allocationBeforePaymentConfirmation();if(mobileProofSubmitting&&$('#submitPayment'))$('#submitPayment').disabled=true;};

function bindPaymentConfirmationActions(state){
 state.dialog.querySelector('.payment-confirmation-close').onclick=closePaymentConfirmation;
 state.dialog.querySelector('.payment-confirmation-save').onclick=()=>savePaymentConfirmationImage();
 state.dialog.querySelector('.payment-confirmation-share').onclick=sharePaymentConfirmationImage;
}
function refreshPaymentConfirmation(record){
 if(!paymentConfirmationState)return;
 const state=paymentConfirmationCurrent();if(!state)return;
 const source=record||stagingData?.payments?.find(p=>String(p.id)===state.model.id);
 if(!source||source.userId&&source.userId!==state.owner)return;
 const model=paymentConfirmationModel({...source,receiptNumber:source.receiptNumber||state.model.receipt});
 if(JSON.stringify(model)===JSON.stringify(state.model))return;
 const focused=state.dialog.contains(document.activeElement)?document.activeElement.className:null;
 state.model=model;state.version++;state.image=null;
 state.dialog.innerHTML=paymentConfirmationHTML(model);bindPaymentConfirmationActions(state);
 paymentConfirmationBusy(state,state.busy);if(typeof decorateProofStatuses==='function')decorateProofStatuses();
 if(focused){const button=[...state.dialog.querySelectorAll('button')].find(b=>b.className===focused);button?.focus({preventScroll:true});}
 const version=state.version;paymentConfirmationImage(model).then(image=>{if(state===paymentConfirmationCurrent()&&state.version===version)state.image=image;}).catch(()=>{});
}
window.addEventListener('message',event=>{
 const payload=event.data;
 if(event.origin!==location.origin||event.source!==parent||payload?.channel!=='loanledger-v41224'||payload.type!=='snapshot'||payload.data?.user?.id!==paymentConfirmationOwner()||!paymentConfirmationState)return;
 const record=payload.data.payments?.find(p=>String(p.id)===paymentConfirmationState.model.id);
 if(record)refreshPaymentConfirmation(record);
});
