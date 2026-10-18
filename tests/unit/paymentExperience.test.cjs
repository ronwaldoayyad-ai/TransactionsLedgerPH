const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
test('proof validation allows 5 MB, rejects oversized replacements before clearing the retained draft',()=>{
 const code=read('public/v41224-payment-experience.js');const context={};vm.createContext(context);
 vm.runInContext(code.slice(0,code.indexOf('// Browser integration')),context);
 assert.equal(context.proofCandidateError({size:5242880,type:'image/png'}),'');assert.match(context.proofCandidateError({size:5242881,type:'image/png'}),/5 MB/);
 assert.match(context.proofCandidateError({size:0,type:'image/png'}),/empty/);assert.match(context.proofCandidateError({size:1,type:'text/plain'}),/JPG/);
 assert.ok(code.indexOf('proofCandidateError(input.files')<code.indexOf('await experiencePick(input)'));
});
test('expanded Finder fits above a keyboard and accounts for a scrolled visual viewport',()=>{
 const code=read('public/v41224-finder-viewport.js'),context={};vm.createContext(context);vm.runInContext(code.slice(0,code.indexOf('// Browser integration')),context);
 const layout=context.finderViewportLayout({screenTop:0,screenHeight:844,scale:1,viewportTop:0,viewportHeight:390,barHeight:50});assert.equal(layout.top,12);assert.equal(layout.resultsTop,70);assert.equal(layout.resultsHeight,308);
 assert.equal(context.finderViewportLayout({screenTop:-80,screenHeight:844,scale:1,viewportTop:20,viewportHeight:390,barHeight:50}).top,112);
});
test('all upload boundaries enforce the same 5 MB cap and assigned installment categories are persisted',()=>{
 assert.doesNotMatch(read('src/lib/mobileLocalFlow.js'),/payment-submit'\?10\*/);
 assert.doesNotMatch(read('server/flow-service.cjs'),/payment-proofs'\?10485760/);
 assert.match(read('src/context/AppContext.jsx'),/loan_category:.*loan.loanCategory/);
 assert.match(read('src/pages/admin/Calculator.jsx'),/aria-label="Installment category"/);
});
