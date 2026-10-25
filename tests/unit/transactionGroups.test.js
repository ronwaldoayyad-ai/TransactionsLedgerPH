import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transactionGroup,defaultInstallmentGroup,parseTransactionGroup,TRANSACTION_GROUPS} from '../../src/lib/transactionGroups.js';
import {parseCSV,parseCSVAmount,parseCSVDate} from '../../src/lib/csv.js';
const source=fs.readFileSync('src/pages/admin/Transactions.jsx','utf8');
test('legacy classification preserves installment assignments and identifies straight charges and adjustments without mutating rows',()=>{
 const cases=[[{type:'Installment',description:'Other'},{loanCategory:'cash_loan'},'cash_loan'],[{type:'Installment',description:'Cash Loan'},{loanCategory:'retail_installment'},'retail_installment'],[{type:'Straight',description:'3% Finance Charge - July 10, 2026',amount:100},null,'fees'],[{type:'Straight',description:'Late Payment Fee as of July 10, 2026',amount:1500},null,'fees'],[{type:'Straight',description:'Partial Payment - Jul 10, 2026',amount:-1000},null,'adjustments'],[{type:'Straight',description:'Overpayment Credit',amount:100},null,'adjustments'],[{type:'Straight',description:'Purchased Item',amount:100},null,'straight_retail']];
 for(const [row,loan,expected]of cases){const before=JSON.stringify(row);assert.equal(transactionGroup(row,loan),expected);assert.equal(JSON.stringify(row),before);}
 assert.equal(defaultInstallmentGroup({label:'PAYPAL SEND'}),'cash_loan');assert.equal(defaultInstallmentGroup({label:'Phone'}),'retail_installment');
 assert.equal(transactionGroup({type:'Straight',description:'Custom charge',transactionGroup:'fees'}),'fees');
 assert.equal(transactionGroup({type:'Straight',description:'Phone',transactionGroup:'cash_loan'}),'straight_retail');
});
test('browser and React grouping engines use identical source',()=>{
 const shared=fs.readFileSync('src/lib/transactionGroups.js','utf8'),browser=fs.readFileSync('public/transaction-group-core.js','utf8');
 assert.ok(browser.includes(shared.replace(/export /g,'')));
});
test('Group accepts labels/keys only within the selected type and older files retain defaults',()=>{
 for(const [key,label]of Object.entries(TRANSACTION_GROUPS)){const type=['cash_loan','retail_installment'].includes(key)?'Installment':'Straight';assert.equal(parseTransactionGroup(label,type),key);assert.equal(parseTransactionGroup(key,type),key);}
 assert.throws(()=>parseTransactionGroup('Cash Loan','Straight'),/match/);assert.throws(()=>parseTransactionGroup('Fees','Installment'),/match/);
 assert.equal(parseTransactionGroup('','Straight',{description:'Overpayment Credit',amount:-500}),'adjustments');
});
function importHarness(users){const ctx=vm.createContext({users,parseCSV,parseCSVAmount,parseCSVDate,parseTransactionGroup,STATUS_LABELS:{paid:'Paid',unpaid:'Unpaid',cancelled:'Cancelled',past_due:'Past Due',refunded:'Refunded'},setImportPreview:value=>ctx.preview=value,downloadCSV:(name,text)=>ctx.download={name,text}});vm.runInContext(source.slice(source.indexOf('const IMPORT_HEADERS'),source.indexOf('// --- Find & Replace')),ctx);const start=source.indexOf('  const handleImportFile ='),end=source.indexOf('  const confirmImport =',start);vm.runInContext(source.slice(start,end)+'\nthis.importFile=handleImportFile;this.template=downloadTemplate;',ctx);return ctx}
test('updated template imports every group, negative standalone adjustments and linked loan categories',async()=>{
 const ctx=importHarness([{id:'borrower',role:'user',name:'Test, Borrower',email:'qa@test.invalid'}]);ctx.template();const csv=ctx.download.text;assert.equal(parseCSV(csv).headers.length,18);assert.ok(parseCSV(csv).rows.every(row=>row.length===18));await ctx.importFile({text:async()=>csv});assert.deepEqual(Array.from(ctx.preview.errors),[]);assert.equal(ctx.preview.rows.length,7);assert.equal(ctx.preview.groups.filter(g=>g.standalone).length,2);assert.equal(ctx.preview.groups.find(g=>g.loan.label==='Cash Loan').loan.loanCategory,'cash_loan');const adjustment=ctx.preview.groups.find(g=>g.standalone&&g.rows[0].amount<0);assert.equal(adjustment.rows[0].transactionGroup,'adjustments');assert.equal(adjustment.rows[0].loanId,null);
});
test('older CSVs without Group infer defaults and conflicting installment labels stop import',async()=>{
 const ctx=importHarness([{id:'borrower',role:'user',name:'QA',email:'qa@test.invalid'}]);await ctx.importFile({text:async()=> 'Borrower,Txn Date,Item Description,Amount,Type,Due Date,Date Paid,Status\nQA,2026-10-01,3% Finance Charge,300,Straight,2026-11-01,,Unpaid\nQA,2026-10-01,Partial Payment,-100,Straight,2026-11-01,,Unpaid'});assert.equal(ctx.preview.errors.length,0);assert.deepEqual(Array.from(ctx.preview.rows,r=>r.transactionGroup),['fees','adjustments']);ctx.template();const csv=ctx.download.text.replace('Installment,Retail Installment,2026-07-10','Installment,Cash Loan,2026-07-10');await ctx.importFile({text:async()=>csv});assert.ok(ctx.preview.errors.some(error=>error.includes('same Group')));
});
const money=fs.readFileSync('public/v41224-money-inputs.js','utf8').split('// Browser integration')[0];
test('money inputs parse grouped values safely and consistently display comma groups with two decimals',()=>{
 const ctx=vm.createContext({});vm.runInContext(money,ctx);for(const [raw,expected]of [[100000,'100,000.00'],['3209.96','3,209.96'],['100,000.50','100,000.50'],['5000.1','5,000.10']]){assert.equal(ctx.moneyInputFormat(raw),expected);assert.equal(ctx.moneyInputNumber(expected),Number(String(raw).replace(/,/g,'')));}
 for(const raw of ['1,00','1,234.567','1e5','-100','abc',''])assert.ok(Number.isNaN(ctx.moneyInputNumber(raw)));
 const input={id:'amount',value:'1234567.5',selectionStart:9,setSelectionRange(p){this.caret=p}};ctx.editMoneyInput(input);assert.equal(input.value,'1,234,567.5');ctx.editMoneyInput(input,true);assert.equal(input.value,'1,234,567.50');
});
