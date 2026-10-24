import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
const read=p=>fs.readFileSync(p,'utf8'),legal=JSON.parse(read('public/legal-content.json')),help=read('public/v41224-help.js')
const renderSource=help.slice(help.indexOf('function legalSectionHTML('),help.indexOf('const helpOriginalRender='))
const loaderSource=help.slice(help.indexOf('async function loadHelpContent()'),help.indexOf('\nloadHelpContent();'))
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function context(extra={}){return vm.createContext({legalContent:legal,legalLoadError:'',htmlSafe:escape,...extra})}

test('legal documents have current dates and distinct stable sections',()=>{
 assert.equal(legal.updated,'October 25, 2026')
 for(const kind of ['privacy','terms']){
  assert.equal(new Set(legal[kind].map(s=>s.id)).size,legal[kind].length)
  for(const s of legal[kind]){assert.match(s.id,/^[a-z0-9-]+$/);assert.ok(s.title&&s.text)}
 }
 for(const id of ['website-disclaimer','copyright-notice','acceptable-use-policy'])assert.ok(legal.terms.some(s=>s.id===id))
 assert.ok(legal.privacy.some(s=>s.id==='cookie-policy'))
})

test('cookie notice matches security lifetimes and distinguishes browser controls from server records',()=>{
 const s=JSON.stringify(legal.privacy.find(s=>s.id==='cookie-policy'))
 assert.match(read('server/login-access.cjs'),/31536000/)
 assert.match(read('server/support-tracking.cjs'),/900/)
 for(const phrase of ['ll_login_device','one year','ll_support_tracking','15 minutes','HttpOnly','SameSite=Strict','local storage','session storage','IndexedDB','does not delete server-side','Help & Support'])assert.ok(s.includes(phrase),phrase)
})

test('copyright contact is Help and Support without a registered agent claim; terms preserve rights and agreements',()=>{
 const c=JSON.stringify(legal.terms.find(s=>s.id==='copyright-notice'))
 assert.match(c,/Help & Support/);assert.match(c,/does not currently have a registered U.S. DMCA designated agent/)
 assert.match(c,/good-faith/);assert.match(c,/electronic signature/);assert.match(c,/allowed to respond/)
 assert.match(JSON.stringify(legal.terms.find(s=>s.id==='website-disclaimer')),/cannot lawfully be excluded/)
 assert.match(legal.terms.find(s=>s.id==='loan-requests-rates-and-charges').text,/does not itself post a charge or amend an agreement/)
})

test('new and revised legal content has Filipino translations and its generated payload matches',()=>{
 const locale=JSON.parse(read('public/locales/filipino.json'))
 const ids=['cookie-policy','website-disclaimer','copyright-notice','acceptable-use-policy','information-processed','storage-and-access','pawcheebels-and-external-ai','loan-requests-rates-and-charges']
 for(const s of [...legal.privacy,...legal.terms].filter(s=>ids.includes(s.id))){
  const strings=[s.title,s.text,s.intro,...(s.items||[]),...(s.paragraphs||[]),s.link?.label].filter(Boolean)
  for(const text of strings)assert.ok(locale.strings[text],'Missing translation: '+text.slice(0,100))
 }
 const c=vm.createContext({window:{}});vm.runInContext(read('public/v41224-locale-data.js'),c)
 assert.equal(JSON.stringify(c.window.borrowerFilipinoMessages),JSON.stringify(locale))
})

test('borrower legal renderer includes the complete documents and escapes every content field',()=>{
 const c=context();vm.runInContext(renderSource,c)
 for(const kind of ['privacy','terms']){
  const out=c.legalScreen(kind)
  for(const s of legal[kind]){
   for(const text of [s.title,s.text,s.intro,...(s.items||[]),...(s.paragraphs||[])].filter(Boolean))assert.ok(out.includes(escape(text)))
   assert.ok(out.includes('id="'+s.id+'"'))
  }
 }
 const out=c.legalSectionHTML({id:'"><script>',title:'<img>',text:'<script>',intro:'<iframe>',items:['<b>'],paragraphs:['<i>'],link:{url:'javascript:alert(1)',label:'unsafe'}},0)
 assert.doesNotMatch(out,/<script>|<img>|<iframe>|<b>|<i>|javascript:/)
 assert.match(out,/&lt;script&gt;/)
})

test('policy loading succeeds when FAQ fails, and has its own retry state when policy fails',async()=>{
 for(const fail of ['faq','legal']){
  let rendered=0
  const c=context({legalContent:null,faqKnowledge:null,faqLoadError:'',page:'privacy',render(){rendered++},renderFAQResults(){},fetch:async url=>({ok:!url.includes(fail),json:async()=>url.includes('legal')?legal:{entries:[]}})})
  vm.runInContext(loaderSource,c);await c.loadHelpContent();assert.equal(rendered,1)
  if(fail==='faq'){assert.equal(c.legalContent,legal);assert.equal(c.legalLoadError,'');assert.ok(c.faqLoadError)}
  else{assert.equal(c.legalContent,null);assert.match(c.legalLoadError,/retry/);assert.ok(c.faqKnowledge)}
 }
})

test('both public policy routes use the shared content and bypass only the borrower frame',()=>{
 const app=read('src/App.jsx'),page=read('src/pages/PrivacyPolicy.jsx'),frame=read('src/components/VersionedBorrower.jsx')
 assert.match(app,/<Route path="\/privacy" element={<PrivacyPolicy/);assert.match(app,/<Route path="\/terms" element={<PrivacyPolicy kind="terms"/)
 assert.match(page,/public\/legal-content.json/);assert.match(page,/s.items.map/);assert.match(page,/s.paragraphs/)
 const pattern=frame.match(/const publicLegalPath = (\/.*?\/)\.test\(pathname\)/)[1],match=vm.runInNewContext(pattern)
 for(const p of ['/privacy','/privacy/','/terms','/terms/'])assert.ok(match.test(p))
 for(const p of ['/portal','/admin','/login','/privacy/private'])assert.equal(match.test(p),false)
 assert.match(frame,/mobileEnabled && !publicLegalPath/)
})
