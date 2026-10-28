const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
test('proof validation allows 5 MB, rejects oversized replacements before clearing the retained draft',()=>{
 const code=read('public/v41224-payment-experience.js');const context={};vm.createContext(context);
 vm.runInContext(code.slice(0,code.indexOf('// Browser integration')),context);
 assert.equal(context.proofCandidateError({size:5242880,type:'image/png'}),'');assert.match(context.proofCandidateError({size:5242881,type:'image/png'}),/5 MB/);
 assert.match(context.proofCandidateError({size:0,type:'image/png'}),/empty/);assert.match(context.proofCandidateError({size:1,type:'text/plain'}),/JPG/);
 assert.ok(code.indexOf('proofCandidateError(input.files')<code.indexOf('experiencePick(input)'));
});
test('expanded Finder fits above a keyboard and accounts for a scrolled visual viewport',()=>{
 const code=read('public/v41224-finder-viewport.js'),context={};vm.createContext(context);vm.runInContext(code.slice(0,code.indexOf('// Browser integration')),context);
 const layout=context.finderViewportLayout({screenTop:0,screenHeight:844,scale:1,viewportTop:0,viewportHeight:390,barHeight:50});assert.equal(layout.top,12);assert.equal(layout.resultsTop,70);assert.equal(layout.resultsHeight,308);
 assert.equal(context.finderViewportLayout({screenTop:-80,screenHeight:844,scale:1,viewportTop:20,viewportHeight:390,barHeight:50}).top,112);
});

test('expanded Finder is centered when its maximum width is smaller than the screen',()=>{
 const code=read('public/v41224-finder-viewport.js'),context={};vm.createContext(context);vm.runInContext(code.slice(0,code.indexOf('// Browser integration')),context);
 for(const [screen,bar] of [[390,292],[430,292],[320,292],[280,256]])assert.equal(context.finderCenteredLeft(screen,bar)+bar/2,screen/2);
 assert.match(code,/right:'auto',width:'calc\(100% - 24px\)'/);
});

test('Dashboard credit advisory appears only for a positive available credit amount',()=>{
 const code=read('public/v41224-staging-adapter.js'),context={};vm.createContext(context);vm.runInContext(code.match(/function hasAvailableAccountCredit\(value\)\{[^\n]+/)[0],context);
 for(const value of [0,'0.00',null,undefined,-1,NaN,Infinity,'invalid',0.001])assert.equal(context.hasAvailableAccountCredit(value),false);
 for(const value of [0.01,1500,'2209.96'])assert.equal(context.hasAvailableAccountCredit(value),true);
 assert.match(code,/hasAvailableAccountCredit\(stagingData\?\.user.creditBalance\)/);
 assert.match(read('src/pages/user/UserDashboard.jsx'),/Number.isFinite\(accountCredit\)&&Math.round\(accountCredit\*100\)>0&&/);
});

test('credit advisory is included once in every balance-content render, including partial balance switches',()=>{
 const code=read('public/v41224-staging-adapter.js'),context={cash:n=>'₱'+Number(n).toFixed(2),dashboard:()=>'<div class="balance-content">Balance</div><div class="balance-foot">Footer</div>'};
 vm.createContext(context);vm.runInContext(code.slice(0,code.indexOf('const stagingDateFormat')).replace("const stagingSend=payload=>parent.postMessage({channel:'loanledger-v41224',...payload},location.origin);",''),context);
 for(const credit of [2209.96,150,0,-1]){
  vm.runInContext('stagingData={user:{creditBalance:'+credit+'}}',context);
  for(let i=0;i<4;i++){const html=context.dashboard();assert.equal((html.match(/account-credit-summary/g)||[]).length,credit>0?1:0);if(credit>0)assert.ok(html.indexOf('account-credit-summary')<html.indexOf('balance-foot'));}
 }
 assert.match(read('public/v41224-enhancements.js'),/template.innerHTML=dashboard\(\)/);
});
test('all upload boundaries enforce the same 5 MB cap and assigned installment categories are persisted',()=>{
 assert.doesNotMatch(read('src/lib/mobileLocalFlow.js'),/payment-submit'\?10\*/);
 assert.doesNotMatch(read('server/flow-service.cjs'),/payment-proofs'\?10485760/);
 assert.match(read('src/context/AppContext.jsx'),/loan_category:.*loan.loanCategory/);
 assert.match(read('src/pages/admin/Calculator.jsx'),/aria-label="Installment category"/);
});

test('Change image becomes visible immediately while recognition is still pending',async()=>{
 let finish;const button={isConnected:true,hidden:true,style:{}},input={};const elements={'#proof':input,'#changePaymentProof':button,'#filemeta':{}};
 const c={file:null,$:id=>elements[id],preferredLanguage:'English',mobileProofSubmitting:false,page:'payment',restorePaymentDraft(){},clearPaymentProof(){},setPaymentDraftBusy(){},render(){}};
 c.pick=()=>{c.file={name:'new.png'};return new Promise(r=>finish=r)};
 vm.createContext(c);vm.runInContext(read('public/v41224-payment-experience.js'),c);
 const pending=c.pick({files:[{size:100,type:'image/png'}]});assert.equal(button.hidden,false);finish();await pending;
});
