import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html=fs.readFileSync('public/borrower-v4.12.24.html','utf8')
test('loan entry points fail closed until admin access is explicitly true',()=>{
 const source=['loanRequestsVisible','quickAccessVisible'].map(name=>html.match(new RegExp('^function '+name+'\\(.*$','m'))?.[0]).join('\n');
 for(const state of [undefined,null,{}, {canRequest:false},{canRequest:'true'},{canRequest:true}]){const context=vm.createContext({stagingData:state});vm.runInContext(source,context);const allowed=state?.canRequest===true;assert.equal(vm.runInContext('loanRequestsVisible()',context),allowed);assert.equal(vm.runInContext("quickAccessVisible({page:'loan'})",context),allowed);assert.equal(vm.runInContext("quickAccessVisible({page:'payment'})",context),true);}
})
test('loan visibility covers saved shortcuts, add picker, More, Finder and direct navigation',()=>{
 assert.match(html,/filter\(x=>x&&quickAccessVisible\(x\)\)/);assert.match(html,/quickAccessCatalog\.filter\(x=>quickAccessVisible\(x\)/);assert.match(html,/quickAccessCatalog\.filter\(quickAccessVisible\)\.forEach/);assert.match(html,/x\[3\]!==\x27loan\x27\|\|loanRequestsVisible\(\)/);assert.match(html,/function go\(p\)\{if\(p===\x27loan\x27&&!loanRequestsVisible\(\)&&!loanRequests\.length\)return/);
 const flow=fs.readFileSync('public/v41224-local-flows.js','utf8');assert.match(flow,/submitLoanRequest=async\(\)=>\{if\(!loanRequestsVisible\(\)\)/);assert.match(flow,/loan=\(\)=>\{if\(!loanRequestsVisible\(\)\)return/);
 const shell=fs.readFileSync('src/components/AppShell.jsx','utf8');assert.match(shell,/item\.to!==\x27\/portal\/loan-request\x27\|\|canRequest/);
})
test('admin access overview uses saved flags, status filters and read-error handling',()=>{
 const ui=fs.readFileSync('src/pages/admin/LoanRequests.jsx','utf8');for(const text of ['Borrower loan-request access','Search borrower access','Filter borrower access','accessFor(b.id)','accessReady','accessError','Manage loan-request access for'])assert.ok(ui.includes(text),text);
 const context=fs.readFileSync('src/context/LoanRequestsContext.jsx','utf8');assert.match(context,/return accessReady && accessList.some/);assert.match(context,/setAccessList\(\[\]\);setAccessReady\(false\)/);assert.match(context,/table:\x27loan_request_access\x27,ownerId:meId,ownerColumn:\x27user_id\x27,isAdmin,onChange:fetchAll/);assert.match(context,/stopAccess\(\)/);
})
test('access publication changes no financial data or existing read policies',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261023195500_loan_request_access_realtime.sql','utf8');assert.match(sql,/alter publication supabase_realtime add table public.loan_request_access/);assert.doesNotMatch(sql,/\b(insert|update|delete|drop policy|grant)\b/i);
})
