import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import vm from 'node:vm'
import {groupLogoUrl,resolveGroupLogo,createGroupLogoResolver} from '../../src/lib/groupLogos.js'
import {loanFeeHelp} from '../../src/lib/loanFeeHelp.js'
const require=createRequire(import.meta.url),{sanitizeGroupLogo}=require('../../server/group-logo-svg.cjs')
const artwork='<svg viewBox="0 0 24 24"><defs><linearGradient id="shade"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient></defs><path d="M2 2 L22 2 L22 22 Z" fill="url(#shade)"/></svg>'
test('SVG validation retains self-contained vectors, gradients, proportions and is idempotent',()=>{
 const clean=sanitizeGroupLogo(artwork);assert.match(clean,/viewBox="0 0 24 24"/);assert.match(clean,/fill="url\(#shade\)"/);assert.equal(sanitizeGroupLogo(clean),clean);assert.match(sanitizeGroupLogo('<svg width="32px" height="24"><rect width="32" height="24" style="fill:#00aaff;opacity:0.9"/></svg>'),/viewBox="0 0 32 24"/)
})
test('active, external, malformed and excessively complex SVGs never become shared artwork',()=>{
 const contents=['<script>alert(1)</script>','<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>','<image href="https://evil.invalid/pixel"/>','<use href="#x"/>','<a href="javascript:alert(1)"><path d="M0 0"/></a>','<style>path{fill:url(https://evil.invalid)}</style>','<path d="M0 0" onload="alert(1)"/>','<path d="M0 0" fill="url(https://evil.invalid)"/>','<path d="M0 0" fill="url(#missing)"/>','<text x="0" y="0">Convert me to outlines</text>','<path d="M0 0" style="fill:red;filter:url(https://evil.invalid)"/>','<g id="same"/><g id="same"/>']
 for(const content of contents)assert.throws(()=>sanitizeGroupLogo('<svg viewBox="0 0 24 24">'+content+'</svg>'),Error,content)
 for(const svg of ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1">&x;</svg>','<svg viewBox="0 0 1 1"><g></svg>','<svg viewBox="0 0 0 0"/>',artwork+'<svg/>','x'.repeat(131073),'<svg viewBox="0 0 1 1">'+'<g>'.repeat(30)+'</g>'.repeat(30)+'</svg>'])assert.throws(()=>sanitizeGroupLogo(svg))
})
test('shared group logos resolve automatically from current groups without financial or brand-fetch changes',()=>{
 const svg=sanitizeGroupLogo(artwork),logos=['cash_loan','fees','adjustments'].map(group_key=>({group_key,svg,version:'fixture'})),resolve=createGroupLogoResolver(logos),cash={id:'cash',type:'Installment',description:'PAYPAL SEND',amount:500},loan={id:'loan',label:'PAYPAL SEND',loanCategory:'cash_loan'},fee={id:'fee',type:'Straight',description:'Late Payment Fee',amount:1500},adjustment={id:'adj',type:'Straight',amount:-100},before=JSON.stringify([cash,loan,fee,adjustment])
 assert.equal(resolve(cash,loan).group,'cash_loan');assert.equal(resolve(fee).group,'fees');assert.equal(resolve(adjustment).group,'adjustments');assert.equal(resolve(cash,loan),resolve({...cash,id:'other'},loan));assert.equal(resolve({...cash,archivedAt:'2026-10-20'},loan),null)
 assert.equal(resolve({type:'Straight',description:'Nike shoes',amount:200}),null);assert.equal(resolve(cash,{...loan,loanCategory:'retail_installment'}),null);assert.equal(JSON.stringify([cash,loan,fee,adjustment]),before);assert.ok(groupLogoUrl(svg).startsWith('data:image/svg+xml;'));assert.equal(groupLogoUrl('https://untrusted.invalid/logo.svg'),null)
})
test('borrower browser helpers match shared group decisions and group-dependent fee copy',()=>{
 const c=vm.createContext({window:{}});for(const p of ['public/transaction-group-core.js','public/group-logo-core.js','public/loan-fee-help-core.js'])vm.runInContext(fs.readFileSync(p,'utf8'),c)
 const logos=[{group_key:'fees',svg:sanitizeGroupLogo(artwork)}],transaction={type:'Straight',description:'3% Finance Charge as of Oct 10, 2026',amount:100}
 assert.deepEqual(JSON.parse(JSON.stringify(c.window.GroupLogos.resolveGroupLogo(transaction,null,logos))),resolveGroupLogo(transaction,null,logos))
 for(const group of ['cash_loan','retail_installment'])for(const label of ['Documentary Stamp Tax','Processing Fee','Notarial Fee'])assert.equal(c.window.LoanFeeHelp.loanFeeHelp(label,group,'PHP 1,500.00'),loanFeeHelp(label,group,'PHP 1,500.00'))
 const help=loanFeeHelp('Processing Fee','retail_installment');assert.match(help,/transaction amount/);assert.match(help,/checkout usually have no processing fee/);assert.match(help,/straight purchase is later converted/);assert.match(loanFeeHelp('Notarial Fee','retail_installment'),/not applicable/);assert.match(loanFeeHelp('Documentary Stamp Tax','cash_loan'),/₱1.50 per ₱200/)
})
test('schedule helper chooses the actual group and Request a Loan retains its Cash Loan descriptions',()=>{
 const c=vm.createContext({page:'installmentDetail',selectedInstallmentIndex:0,stagingLoans:()=>[{label:'Cash Loan',loanCategory:'retail_installment'}],TransactionGroups:{defaultInstallmentGroup:loan=>loan.loanCategory},LoanFeeHelp:{loanFeeHelp},cash:()=> 'PHP 1,500.00'})
 vm.runInContext(fs.readFileSync('public/v41224-fee-help.js','utf8'),c);assert.match(vm.runInContext("loanFeeDescription('Documentary Stamp Tax')",c),/not applicable/);c.page='loan';assert.match(vm.runInContext("loanFeeDescription('Processing Fee')",c),/fixed processing fee of PHP 1,500.00/)
})
