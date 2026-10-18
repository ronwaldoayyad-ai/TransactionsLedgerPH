const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('the immediate payment confirmation uses the exact server submission timestamp',async()=>{
 const source=fs.readFileSync(require.resolve('../../public/v41224-local-flows.js'),'utf8');
 const submit=source.slice(source.indexOf('submitproof=async()=>{'),source.indexOf('\nretryMobilePayment='));
 const fields={paymentError:{textContent:''},amount:{value:'1000'},date:{value:'2026-10-18'},ref:{value:'TEST-ONLY'},paymentMethod:{value:'Bank Transfer'},notes:{value:''},allocationConfirm:{checked:true},submitPayment:{disabled:false}};
 const record={id:'test-proof',user_id:'borrower',amount:1000,paid_date:'2026-10-18',submitted_at:'2026-10-18',submitted_at_exact:'2026-10-18T01:59:28.916033+00:00',reference:'TEST-ONLY',method:'bank_transfer',status:'pending',file_type:'image',file_name:'test.png',requested_allocations:[],receipt_number:'AR-test'};
 let confirmed;const refreshes=[];
 const context={$:selector=>fields[selector.slice(1)],mobileProofSubmitting:false,mobileBusy:new Set(),paymentSelected:new Set([0]),paymentRows:[['test','','','','transaction']],proofScanBusy:false,file:{name:'test.png'},mobileCorrection:null,stagingData:{user:{id:'borrower'}},page:'payment',recentPayments:[],localToday:()=> '2026-10-18',isDuplicatePaymentReference:()=>false,beginTaskLoading:()=>1,yieldLoadingFrame:async()=>{},updateTaskLoading:()=>{},mobileFile:async()=>({name:'test.png',data:'synthetic'}),mobileSave:async()=>record,mobilePaymentRecord:row=>row,resetPaymentSuccess:()=>{},renderMostRecentPayment:()=>{},renderRecentPayments:()=>{},stagingAcknowledgement:()=>({}),showPaymentConfirmation:async row=>{confirmed=row;return true},cancelTaskLoading:()=>{},stagingSend:()=>{},paymentAllocationChanged:()=>{},toast:()=>{}};
 vm.runInNewContext(submit,context);
 context.stagingSend=message=>refreshes.push(message);
 await context.submitproof();
 assert.ok(confirmed,'successful submission opens the confirmation');
 assert.equal(confirmed.submittedAt,record.submitted_at_exact);
 assert.equal(context.mostRecentPayment.submittedAt,record.submitted_at_exact);
 assert.equal(refreshes.length,0,'the parent already refreshed saved payment records before returning the result');
});
