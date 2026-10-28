import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import {brandDomain,brandLogoUrl,matchRetailBrand,resolveRetailBrand,uniqueRetailTargets,createRetailBrandResolver} from '../../src/lib/retailBrands.js'

const loan={id:'retail1',label:'PMC - IPHONE 18 PRO',loanCategory:'retail_installment',userId:'owner'},txn={id:'t1',loanId:'retail1',userId:'owner',type:'Installment',description:'PMC - IPHONE 18 PRO (1 of 12)',amount:1000}
test('first standalone lookup works without a loan and loan changes invalidate the cached decision',()=>{const resolve=createRetailBrandResolver(),straight={id:'straight',type:'Straight',description:'NIKE SHOES',amount:100};assert.equal(resolve(straight).domain,'nike.com');assert.equal(resolve(straight),resolve(straight));assert.equal(resolve(txn,loan).status,'review');assert.equal(resolve(txn,{...loan,loanCategory:'cash_loan'}).status,'ineligible');assert.equal(resolve(undefined).status,'ineligible')})
test('clear words auto-match; merchant/product ambiguity always needs a choice',()=>{
 assert.equal(matchRetailBrand('SAMSUNG TV (1 of 12)').domain,'samsung.com')
 assert.equal(matchRetailBrand('PMC - iPhone 18 Pro').status,'review')
 assert.equal(matchRetailBrand('PMC').status,'review')
 assert.equal(matchRetailBrand('Pineapple lamp').status,'unmatched')
 assert.equal(matchRetailBrand('Bought a phone').status,'unmatched')
 assert.equal(matchRetailBrand('Nike / Adidas').status,'review')
})
test('manual choice and explicit removal survive automatic matches and keyword changes',()=>{
 const manual={target_key:'loan:retail1',mode:'manual',domain:'powermaccenter.com',name:'Power Mac Center',version:'v1'}
 assert.equal(resolveRetailBrand(txn,loan,[manual]).domain,'powermaccenter.com')
 assert.equal(resolveRetailBrand(txn,loan,[{...manual,mode:'none',domain:null}]).status,'hidden')
 assert.equal(resolveRetailBrand(txn,loan,[{...manual,mode:'auto',domain:null}]).status,'review')
 assert.equal(manual.domain,'powermaccenter.com')
})
test('cash, fees, adjustments and archived entries never receive retail logos; loan targets deduplicate',()=>{
 assert.equal(resolveRetailBrand(txn,{...loan,loanCategory:'cash_loan'}).status,'ineligible')
 for(const t of [{...txn,type:'Straight',transactionGroup:'fees'},{...txn,type:'Straight',amount:-100},{...txn,archivedAt:'2026-10-01'}])assert.equal(resolveRetailBrand(t,null).status,'ineligible')
 const targets=uniqueRetailTargets([txn,{...txn,id:'t2'}],[loan]);assert.equal(targets.length,1);assert.equal(targets[0].key,'loan:retail1')
})
test('keywords do not resolve conflicting brands silently; inactive rules stop matching',()=>{
 const rule={alias:'Acme Shop',name:'Acme',domain:'acme.example',active:true}
 assert.equal(matchRetailBrand('ACME SHOP purchase',[rule]).domain,'acme.example')
 assert.equal(matchRetailBrand('Acme Shop Samsung TV',[rule]).status,'review')
 assert.equal(matchRetailBrand('ACME SHOP',[{...rule,active:false}]).status,'unmatched')
})
test('only valid domain identifiers produce direct logo links',()=>{
 for(const v of ['https://apple.com','apple.com/evil','localhost','127.0.0.1','bad.com?x=1','"><img>'])assert.equal(brandDomain(v),null)
 const url=brandLogoUrl('apple.com','public-id');assert.ok(url.startsWith('https://cdn.brandfetch.io/domain/apple.com/'));assert.ok(url.includes('c=public-id'))
 assert.equal(brandLogoUrl('apple.com',''),null)
})
test('borrower presentation and admin share identical matching/override decisions',()=>{
 const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('public/transaction-group-core.js','utf8'),context);vm.runInContext(fs.readFileSync('public/retail-brand-core.js','utf8'),context)
 const browser=context.window.RetailBrands
 for(const text of ['PMC - IPHONE','Samsung TV','NIKE','Unknown brand'])assert.deepEqual(JSON.parse(JSON.stringify(browser.matchRetailBrand(text))),matchRetailBrand(text))
 assert.deepEqual(JSON.parse(JSON.stringify(browser.resolveRetailBrand(txn,loan))),resolveRetailBrand(txn,loan))
})
