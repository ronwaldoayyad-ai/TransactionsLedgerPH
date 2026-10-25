const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/borrower-v4.12.24.html','utf8');
const fn=name=>html.split('\n').find(line=>line.startsWith('function '+name+'('));
const positive=['Due','Due today',1200,'2026-10-19','positive'],negative=['Credit','Adjustment',-200,'2026-10-19','negative'],zero=['Settled','Adjustment',0,'2026-10-19','zero'];
function fixture(){
 const el=()=>({checked:true,disabled:false,value:'',textContent:'',classList:{remove(){},add(){},toggle(){}}});
 const elements=Object.fromEntries(['allocationConfirm','paymentItems','selectAllItems','paymentSuccess','submitPayment','amount','date','ref','amountValidation','paymentError','allocationTotal','submitGate'].map(id=>['#'+id,el()]));
 const c={paymentRows:[positive,negative,zero],paymentSelected:new Set(),paymentDueKeys:new Set(),$:s=>elements[s],clearPaymentProof(){},renderPaymentDates(){},clearResolvedSubmitHighlights(){},updatePaymentSteps(){},isDuplicatePaymentReference:()=>false,paymentMethodValid:()=>false,file:null,proofScanBusy:false,borrowerPayableRecords:()=>[positive,negative,zero],paymentDates:()=>[new Date()],dueKey:()=> '2026-10-19',cash:n=>'₱'+n,htmlSafe:String,expandableRowsHTML:(_,rows)=>rows.join('')};
 c.document={};vm.createContext(c);vm.runInContext(fs.readFileSync('public/v41224-money-inputs.js','utf8').split('// Browser integration')[0],c);vm.runInContext(['paymentItemSelectable','paymentSelectableIndexes','sanitizePaymentSelection','choosePaymentDue','renderPaymentItems','togglePaymentItem','toggleAllPaymentItems','paymentAllocationChanged'].map(fn).join('\n'),c);return {c,elements};
}

test('negative, zero, missing and invalid amounts cannot be payable selections',()=>{
 const {c}=fixture();for(const amount of [-200,-0.01,0,null,undefined,NaN,Infinity,'invalid'])assert.equal(c.paymentItemSelectable(['x','x',amount]),false);
 assert.equal(c.paymentItemSelectable(positive),true);assert.equal(c.paymentItemSelectable(['x','x','0.01']),true);
 assert.deepEqual(Array.from(c.paymentSelectableIndexes()),[0]);
});

test('due-date default selection and Select all include only positive items',()=>{
 const {c,elements}=fixture();c.choosePaymentDue({dataset:{key:'2026-10-19'}});assert.deepEqual(Array.from(c.paymentSelected),[0]);assert.equal(elements['#allocationTotal'].textContent,'₱1200');
 assert.equal(elements['#selectAllItems'].textContent,'Clear all');c.toggleAllPaymentItems();assert.equal(c.paymentSelected.size,0);c.toggleAllPaymentItems();assert.deepEqual(Array.from(c.paymentSelected),[0]);
 c.togglePaymentItem(1,true);c.togglePaymentItem(2,true);c.togglePaymentItem(999,true);assert.deepEqual(Array.from(c.paymentSelected),[0]);
 assert.match(elements['#paymentItems'].innerHTML,/class="payment-check" disabled aria-label="Select Credit"/);assert.match(elements['#paymentItems'].innerHTML,/No payment required/);
});

test('stale selections are removed and confirmation resets when an item becomes negative',()=>{
 const {c,elements}=fixture();c.paymentSelected=new Set([0,1,2,999]);c.paymentAllocationChanged();assert.deepEqual(Array.from(c.paymentSelected),[0]);assert.equal(elements['#allocationConfirm'].checked,false);
 c.paymentRows=[negative,zero];c.paymentSelected=new Set([0,1]);c.renderPaymentItems();c.paymentAllocationChanged();assert.equal(c.paymentSelected.size,0);assert.equal(elements['#allocationConfirm'].disabled,true);assert.equal(elements['#selectAllItems'].disabled,true);assert.equal(elements['#submitPayment'].disabled,true);assert.equal(elements['#allocationTotal'].textContent,'₱0');
});

test('restored drafts reject credits and require allocation review',()=>{
 const {c,elements}=fixture();c.stagingData={user:{id:'qa'}};c.page='payment';c.paymentDraftMemory={owner:'qa',dates:['2026-10-19'],selected:['positive','negative'],selectedAmounts:[['positive',1200],['negative',-200]],fields:{},confirmed:true};
 Object.assign(c,{mobileProofSubmitting:false,setPaymentDraftBusy(){},document:{createElement:()=>({setAttribute(){}})}});elements['#paymentDraftNotice']={};
 const draft=fs.readFileSync('public/v41224-payment-draft.js','utf8');vm.runInContext(draft.slice(draft.indexOf('function restorePaymentDraft(){'),draft.indexOf('async function forgetPaymentDraft')),c);c.restorePaymentDraft();
 assert.deepEqual(Array.from(c.paymentSelected),[0]);assert.equal(elements['#allocationConfirm'].checked,false);assert.match(elements['#paymentDraftNotice'].innerHTML,/Selected items changed/);
});

test('submission refuses a manipulated negative selection before file conversion or server calls',async()=>{
 const {c,elements}=fixture();c.paymentSelected=new Set([1]);c.mobileProofSubmitting=false;c.mobileBusy=new Set();c.localToday=()=> '2026-10-19';elements['#paymentMethod']={value:'GCASH'};
 const flow=fs.readFileSync('public/v41224-local-flows.js','utf8');vm.runInContext(flow.slice(flow.indexOf('submitproof=async()=>{'),flow.indexOf('retryMobilePayment=')),c);await c.submitproof();
 assert.equal(c.paymentSelected.size,0);assert.match(elements['#paymentError'].textContent,/greater than zero/);
});
