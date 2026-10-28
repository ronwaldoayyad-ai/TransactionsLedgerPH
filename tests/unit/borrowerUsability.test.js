import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const html=fs.readFileSync('public/borrower-v4.12.24.html','utf8'),enhance=fs.readFileSync('public/v41224-enhancements.js','utf8')
const line=name=>html.match(new RegExp('^function '+name+'\\(.*$','m'))[0]

test('installments begin in Cards and reset to Cards only for a changed owner',()=>{
 const source=fs.readFileSync('public/v41224-installment-deck.js','utf8')
 assert.match(source,/let installmentPresentation='cards'/)
 assert.match(source,/owner!==installmentPresentationOwner\)[{][^}]*installmentPresentation='cards'/)
 assert.match(source,/function setInstallmentPresentation/)
})
test('all shortcuts are included once while the saved order is retained',()=>{
 const catalog=[{id:'payment'},{id:'loan'},{id:'invoices'},{id:'support'},{id:'history'}],c=vm.createContext({quickAccessCatalog:catalog})
 vm.runInContext(line('completeQuickAccessOrder'),c)
 assert.deepEqual(Array.from(c.completeQuickAccessOrder(['history','payment','payment','unknown'])),['history','payment','loan','invoices','support'])
 assert.deepEqual(Array.from(c.completeQuickAccessOrder(null)),catalog.map(x=>x.id))
 const section=html.slice(html.indexOf('function quickAccessSectionHTML()'),html.indexOf('\nfunction ',html.indexOf('function quickAccessSectionHTML()')+1))
 assert.match(section,/filter\(x=>x&&quickAccessVisible\(x\)\)/);assert.match(section,/beginQuickAccessDrag/);assert.match(section,/moveQuickAccess/);assert.doesNotMatch(section,/quick-remove/)
 const css=fs.readFileSync('public/v41224-dashboard-usability.css','utf8');assert.match(css,/grid-auto-columns:calc\(\(100% - 27px\)\/4\)/);assert.match(css,/overflow-x:auto/);assert.match(css,/scroll-snap-type:x proximity/)
})
test('shortcut reordering skips disabled destinations and preserves the full order',()=>{
 const c=vm.createContext({quickAccessCatalog:[{id:'payment'},{id:'loan'},{id:'history'},{id:'support'}],quickAccess:['payment','loan','history','support'],quickAccessVisible:x=>x.id!=='loan',saveQuickAccess(){},render(){},revealQuickAccess(){}})
 vm.runInContext(line('completeQuickAccessOrder')+'\n'+line('moveQuickAccess'),c)
 c.moveQuickAccess('history',-1);assert.deepEqual(Array.from(c.quickAccess),['history','payment','loan','support'])
 c.moveQuickAccess('history',1);assert.deepEqual(Array.from(c.quickAccess),['payment','history','loan','support'])
})
test('payment list exposes five then ten then fifteen then all without losing sort or records',()=>{
 const host={innerHTML:''},rows=Array.from({length:17},(_,i)=>({id:'p'+i,amount:i+1,status:'Approved',submittedAt:'2026-10-'+String(i+1).padStart(2,'0'),paidDate:'Oct '+(i+1)+', 2026'}))
 const c=vm.createContext({Date,$:()=>host,cash:String,safeRecent:x=>String(x??''),recentPayments:rows,mostRecentPayment:null,recentPaymentFilter:'All',recentShowAll:false,recentPaymentLimit:5,recentPaymentTotal:0})
 vm.runInContext(fs.readFileSync('public/v41224-payment-sort.js','utf8')+'\n'+line('renderRecentPayments')+'\n'+line('toggleRecentAll'),c)
 const count=()=>[...host.innerHTML.matchAll(/<article class="recent-payment-row">/g)].length
 c.renderRecentPayments();assert.equal(count(),5);assert.ok(host.innerHTML.indexOf('recent-more-footer')>host.innerHTML.lastIndexOf('</article>'));assert.ok(host.innerHTML.indexOf('recent-view-all')>host.innerHTML.indexOf('recent-payment-list'))
 c.toggleRecentAll();assert.equal(count(),10);c.toggleRecentAll();assert.equal(count(),15);c.toggleRecentAll();assert.equal(count(),17)
 c.toggleRecentAll();assert.equal(count(),5);assert.equal(rows.length,17)
 assert.match(enhance,/button.hidden=recentPaymentTotal<=5/)
 assert.match(enhance,/recentShowAll=false;recentPaymentLimit=5;approvedRecentFilter/)
})
test('Finder preserves the input and pending first search during a same-owner snapshot',()=>{
 let mounted=null,approved=0,results=0;const queued=[]
 const c={stagingData:{user:{id:'one'}},finderCompact:false,finderQuery:'payment',finderFilter:'All',finderStatusFilter:'All',renderFinder(){approved++;mounted={compact:false,classList:{contains(){return this.host.compact}}};mounted.classList.host=mounted},positionFinder(){},borrowerShortcutsVisible:()=>true,requestAnimationFrame:fn=>queued.push(fn),renderStagingFinderResults(){results++},document:{querySelector(selector){if(selector==='#accountFinder')return mounted;if(selector==='#finderInput')return {setAttribute(){}};return null}}}
 vm.createContext(c);vm.runInContext(enhance.slice(enhance.indexOf('const approvedRenderFinder='),enhance.indexOf('let stagingListOwner=')),c)
 c.renderFinder();assert.equal(approved,1);c.finderQuery='payment';const original=mounted;c.stagingData={user:{id:'one'},revision:2};c.renderFinder()
 assert.equal(mounted,original);assert.equal(approved,1);assert.equal(c.finderQuery,'payment');queued.forEach(fn=>fn());assert.equal(results,1)
 c.stagingData={user:{id:'two'}};c.renderFinder();assert.equal(approved,2);assert.equal(c.finderQuery,'')
})
test('Finder reuses search matches and invalidates them for fresh account data',()=>{
 let builds=0;const c=vm.createContext({stagingData:{user:{id:'one'}},finderFilter:'All',finderStatusFilter:'All',finderRecordType:r=>r.type,finderRecordStatus:r=>r.status,finderRecords:()=>{builds++;return [{id:'one',title:'Payment one',detail:'',type:'Payments',status:'Approved'}]}})
 vm.runInContext(enhance.slice(enhance.indexOf('let finderCacheSource='),enhance.indexOf('function renderStagingFinderResults')),c)
 assert.equal(c.finderResults('payment').length,1);c.finderResults('payment',true);assert.equal(builds,1)
 c.finderFilter='Installments';assert.equal(c.finderResults('payment').length,0);assert.equal(builds,1)
 c.stagingData={user:{id:'two'}};c.finderResults('payment',true);assert.equal(builds,2)
 const renderer=enhance.slice(enhance.indexOf('function renderStagingFinderResults'),enhance.indexOf('function pageFinderResults'))
 assert.doesNotMatch(renderer,/page!=='dashboard'/);assert.match(renderer,/borrowerShortcutsVisible/);assert.match(renderer,/matches.slice\(finderResultOffset,finderResultOffset\+size\)/)
})
