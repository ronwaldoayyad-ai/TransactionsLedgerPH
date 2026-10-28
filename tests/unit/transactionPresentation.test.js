import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/v41224-transaction-summary.js','utf8');
function harness(extra={}){const context=vm.createContext({straightGroupFilter:'all',transactionStraightFilter:'All',txSearch:'',transactionRecordGroup:row=>row[9],...extra});vm.runInContext(source,context);return context;}
test('refunded installment state uses the loan flag or all refunded rows before checking progress',()=>{
 const c=harness(),rows=[{status:'refunded',amount:100},{status:'Refunded',amount:200}],before=JSON.stringify(rows);
 assert.equal(c.installmentGroupState({status:'active'},rows,'2026-10-26'),'Refunded');
 assert.equal(c.installmentGroupState({status:'REFUNDED'},[{status:'paid'}],'2026-10-26'),'Refunded');
 assert.equal(c.installmentGroupState({},[{status:'paid'}],'2026-10-26'),'Fully Paid');
 assert.equal(c.installmentGroupState({},[{status:'unpaid',dueDate:'2026-09-01'}],'2026-10-26'),'Past Due');
 assert.equal(c.installmentGroupState({},[],'2026-10-26'),'In Progress');
 assert.equal(c.installmentGroupState({},[{status:'refunded'},{status:'unpaid',dueDate:'2026-11-01'}],'2026-10-26'),'In Progress');
 assert.equal(JSON.stringify(rows),before);
});
test('display totals include negative adjustments and use cents without changing saved values',()=>{
 const c=harness(),values=[12421.2,11020,-4000,.1,.2],before=JSON.stringify(values);
 assert.equal(c.displayedAmountTotal(values),19441.5);assert.equal(c.displayedAmountTotal([.1,.2]),.3);assert.equal(c.displayedAmountTotal([]),0);assert.equal(JSON.stringify(values),before);
});
test('straight totals use the same combined status, category and search filters as the actual list',()=>{
 const rows=[['','Retail shop','Due Nov 1',1000,'','Upcoming','straight',0,'r','straight_retail'],['','Finance Charge','Due Nov 1',300,'','Upcoming','straight',0,'f','fees'],['','Partial Payment','Due Nov 1',-500,'','Upcoming','straight',0,'a','adjustments'],['','Refund','Paid Oct 1',100,'','Refunded','straight',0,'x','straight_retail'],['','Cash Loan','Due Nov 1',2000,'','Upcoming','installment',0,'l','cash_loan']];
 const c=harness();assert.equal(c.displayedAmountTotal(c.filteredStraightTransactionRows(rows).map(r=>r[3])),900);
 c.straightGroupFilter='adjustments';assert.equal(c.displayedAmountTotal(c.filteredStraightTransactionRows(rows).map(r=>r[3])),-500);
 c.straightGroupFilter='all';c.transactionStraightFilter='Refunded';assert.equal(c.filteredStraightTransactionRows(rows).length,1);assert.equal(c.displayedAmountTotal(c.filteredStraightTransactionRows(rows).map(r=>r[3])),100);
 c.txSearch='missing';assert.equal(c.filteredStraightTransactionRows(rows).length,0);
});
test('installment totals follow the real search/category/settled filters and count each matching loan once',()=>{
 const enhance=fs.readFileSync('public/v41224-enhancements.js','utf8'),start=enhance.indexOf('const stagingVisibleGroups='),end=enhance.indexOf('\nloanProfileCategory=',start);
 const loans=[{id:'cash',label:'Cash Loan',loanCategory:'cash_loan',principal:10000,txnDate:'2026-01-01',active:true},{id:'retail',label:'Starlites Booking',loanCategory:'retail_installment',principal:12421.2,txnDate:'2026-02-01',active:false}],groups=loans.map(loan=>[loan.label,'', '',0,'',loan.id]);
 const c=harness({excludeFullyPaidInstallments:false,installmentCategoryFilter:'all',stagingGroups:()=>groups,stagingLoans:()=>loans,stagingLoanActive:loan=>loan.active,stagingCategory:loan=>loan.loanCategory,stagingCompareValues:()=>0});vm.runInContext(enhance.slice(start,end)+'\nthis.visible=stagingVisibleGroups;',c);
 assert.equal(c.displayedAmountTotal(c.visible().map(e=>e.loan.principal)),22421.2);
 c.txSearch='Starlites';assert.equal(c.displayedAmountTotal(c.visible().map(e=>e.loan.principal)),12421.2);
 c.txSearch='';c.installmentCategoryFilter='cash_loan';assert.equal(c.displayedAmountTotal(c.visible().map(e=>e.loan.principal)),10000);
 c.installmentCategoryFilter='all';c.excludeFullyPaidInstallments=true;assert.equal(c.displayedAmountTotal(c.visible().map(e=>e.loan.principal)),10000);
});
