import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/v41224-mobile-feedback.js','utf8');
const helpers=source.slice(source.indexOf('function proofImageDimensions('),source.indexOf('prepareProofImage=async('));
const reader=source.slice(source.indexOf('async function readProofImage('),source.indexOf('extractProofText=async'));
const values={amount:3209.96,paidDate:'2026-10-24',reference:'2026102413540',method:'GCASH'};
test('first pass keeps screenshots at native size and bounds large receipt images; detail preserves the previous limits',()=>{
 const c=vm.createContext({});vm.runInContext(helpers,c);
 assert.deepEqual({...c.proofImageDimensions(720,1400)},{width:720,height:1400});
 assert.deepEqual({...c.proofImageDimensions(720,1400,true)},{width:1440,height:2800});
 for(const [w,h] of [[2400,3600],[500,20000],[15000,500],[1,1]]){const s=c.proofImageDimensions(w,h);assert.ok(s.width<=1200&&s.height<=3000&&s.width*s.height<=2400000);assert.ok(s.width<=w&&s.height<=h);}
 assert.throws(()=>c.proofImageDimensions(0,10));assert.throws(()=>c.proofImageDimensions(NaN,10));
});
test('fast OCR requires every field and sufficient confidence; partial or uncertain text retains detailed recognition',()=>{
 const c=vm.createContext({parseProofText:text=>text==='complete'?values:{...values,reference:''}});vm.runInContext(helpers,c);
 assert.equal(c.proofNeedsDetail({text:'complete',confidence:95}),false);
 for(const r of [{text:'partial',confidence:99},{text:'complete',confidence:84},{text:'complete'},null])assert.equal(c.proofNeedsDetail(r),true);
});
function setup(results){const canvases=[],calls=[],c=vm.createContext({proofWorkerEpoch:0,proofOcrMetrics:{fastReads:0,detailReads:0},parseProofText:text=>text==='complete'?values:{...values,reference:''},releaseProofWorker:async()=>{},prepareProofImage:async(_file,detail=false)=>{calls.push('prepare:'+detail);const canvas={width:720,height:1400};canvases.push(canvas);return canvas;},createProofWorker:async()=>{calls.push('worker');return {recognize:async()=>({data:results.shift()})}}});vm.runInContext(helpers+reader,c);return {c,canvases,calls}}
test('clear receipts use one scan while preserving the uploaded file and releasing the canvas',async()=>{
 const {c,canvases,calls}=setup([{text:'complete',confidence:95}]),file={name:'proof.png'};let registered=0;
 assert.equal(await c.readProofImage(file,()=>{},()=>registered++),'complete');assert.equal(registered,1);
 assert.deepEqual(calls,['worker','prepare:false']);assert.equal(canvases.length,1);assert.equal(canvases[0].width,0);assert.equal(file.name,'proof.png');assert.equal(c.proofOcrMetrics.fastReads,1);assert.equal(c.proofOcrMetrics.detailReads,0);
});
test('incomplete or low-confidence results retry once with the original detailed image path',async()=>{
 for(const first of [{text:'partial',confidence:96},{text:'complete',confidence:80}]){const {c,canvases,calls}=setup([first,{text:'complete',confidence:95}]);assert.equal(await c.readProofImage({},()=>{},()=>{}),'complete');assert.deepEqual(calls,['worker','prepare:false','prepare:true']);assert.ok(canvases.every(x=>x.width===0&&x.height===0));assert.equal(c.proofOcrMetrics.detailReads,1);}
});
test('a failed recognition clears image memory and propagates to the existing manual-entry flow',async()=>{
 const {c,canvases}=setup([]);c.createProofWorker=async()=>({recognize:async()=>{throw Error('canceled')}});await assert.rejects(c.readProofImage({},()=>{},()=>{}),/canceled/);assert.equal(canvases[0].width,0);
});
test('early preparation is limited to confirmed payment intent and never starts another scan',async()=>{
 let creates=0,releases=0;const worker={},c=vm.createContext({page:'dashboard',proofScanBusy:false,document:{querySelector:()=>({checked:true})},cachedProofWorker:worker,createProofWorker:async()=>{creates++;return worker},deferProofWorkerRelease:()=>releases++});vm.runInContext(source.slice(source.indexOf('function warmProofRecognition('),source.indexOf("document.addEventListener('change',event=>{if(event.target.id==='allocationConfirm')")),c);
 c.warmProofRecognition();assert.equal(creates,0);c.page='payment';c.document.querySelector=()=>({checked:false});c.warmProofRecognition();assert.equal(creates,0);c.document.querySelector=()=>({checked:true});c.proofScanBusy=true;c.warmProofRecognition();assert.equal(creates,0);c.proofScanBusy=false;c.warmProofRecognition();await Promise.resolve();await Promise.resolve();assert.equal(creates,1);assert.equal(releases,1);
});

test('manual cancellation after a fast pass prevents the detailed scan and clears image memory',async()=>{
 const {c,canvases}=setup([]);c.createProofWorker=async()=>({recognize:async()=>{c.proofWorkerEpoch++;return {data:{text:'partial',confidence:20}}}});await assert.rejects(c.readProofImage({},()=>{},()=>{}),/canceled/);assert.equal(canvases.length,1);assert.equal(canvases[0].width,0);
});
test('a broken image still releases a worker prepared in parallel',async()=>{
 const {c}=setup([]);let released=0;c.prepareProofImage=async()=>{throw Error('broken image')};c.releaseProofWorker=async()=>released++;await assert.rejects(c.readProofImage({},()=>{},()=>{}),/broken image/);await Promise.resolve();assert.equal(released,1);
});
test('PDFs with embedded payment details bypass image OCR and destroy the PDF handle',async()=>{
 let creates=0,destroyed=0;const pdf={numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'complete',transform:[0,0,0,0,0,0]}]})})};const c=vm.createContext({location:{origin:'https://fixture.example'},Uint8Array,createProofWorker:async()=>creates++,parseProofText:()=>values,loadProofLibrary:async()=>({GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(pdf),destroy:async()=>destroyed++})})});vm.runInContext(source.slice(source.indexOf('extractProofText=async'),source.indexOf('// Prepare only after payment intent')),c);assert.equal((await c.extractProofText({type:'application/pdf',arrayBuffer:async()=>new ArrayBuffer(0)},()=>{},()=>{})).trim(),'complete');assert.equal(creates,0);assert.equal(destroyed,1);
});

test('reference labels never become part of the recognized transfer reference',()=>{
 const html=fs.readFileSync(new URL('../../public/borrower-v4.12.24.html',import.meta.url),'utf8'),parser=html.slice(html.indexOf('function parseProofText('),html.indexOf('function loadProofLibrary('));const c=vm.createContext({detectPaymentMethod:()=> 'Bank Transfer',dueKey:()=> '2026-10-08'});vm.runInContext(parser,c);
 for(const label of ['Reference','Reference no.','Reference number','Ref','Ref #','Confirmation number'])assert.equal(c.parseProofText(label+': FSX10082026013540').reference,'FSX10082026013540');
});
