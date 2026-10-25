import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import * as RetailBrands from '../../src/lib/retailBrands.js'

function fixture(){
 const rows=['first','second'].map(id=>({id,userId:'owner',description:'Same retail purchase',type:'Straight',amount:100})),data={transactions:rows,loans:[],branding:{ready:true,clientId:'public-client',rules:[],assignments:rows.map((r,i)=>({target_key:'transaction:'+r.id,mode:'manual',domain:i?'nike.com':'apple.com',name:i?'Nike':'Apple'}))}}
 const html=id=>'<div data-staging-transaction-id="'+id+'" class="item"><div class="ico">✓</div><b>Same retail purchase</b></div>'
 const c=vm.createContext({stagingData:data,RetailBrands,stagingRows:()=>rows,stagingLoans:()=>[],stagingIndex:()=>({byLoan:new Map()}),htmlSafe:s=>String(s).replaceAll('"','&quot;'),document:{body:{classList:{contains:()=>false}},querySelectorAll:()=>[]},render:()=>{},transactionRecords:()=>rows.map(r=>['✓',r.description,'',r.amount,'','','straight','',r.id]),transactionBreakdownItems:()=>rows.map(r=>html(r.id)),stagingRecentActivity:()=>rows.map(r=>html(r.id)),historyAccountRecords:()=>rows.map(r=>['✓',r.description,'',r.amount,'','Payments','straight','','',null,r.id])})
 vm.runInContext(fs.readFileSync('public/v41224-retail-brands.js','utf8'),c);return {c,data}
}
test('identical descriptions keep their own logo across breakdown, recent activity and history without mutating records',()=>{
 const {c,data}=fixture(),before=JSON.stringify(data)
 for(const fn of ['transactionBreakdownItems','stagingRecentActivity']){const result=vm.runInContext(fn+'()',c);assert.match(result[0],/domain\/apple.com/);assert.match(result[1],/domain\/nike.com/)}
 const history=vm.runInContext('historyAccountRecords()',c);assert.match(history[0][0],/domain\/apple.com/);assert.match(history[1][0],/domain\/nike.com/);assert.equal(JSON.stringify(data),before)
})
test('logo rendering prefers transparent logo assets with an icon fallback and no guessed ID match',()=>{
 const {c}=fixture();assert.match(RetailBrands.brandLogoUrl('apple.com','public-client'),/\/type\/logo\?/)
 const html=vm.runInContext('transactionBreakdownItems()[0]',c);assert.match(html,/data-fallback="[^"]+\/icon.webp/)
 assert.equal(vm.runInContext('retailTransactionRowHTML("<div class=\\"ico\\">✓</div>","missing")',c),'<div class="ico">✓</div>')
})
