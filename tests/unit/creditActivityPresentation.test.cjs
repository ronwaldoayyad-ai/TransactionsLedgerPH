const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const file=path.resolve(__dirname,'../../public/v41224-credit-activity.js');
const record={id:'credit-1',date:'2026-10-18',recordedAt:'2026-10-18T15:00:00Z',creditUsed:2209.96,cashIncluded:0,totalApplied:2209.96,status:'applied',reference:'CREDIT-1',note:'<img src=x onerror=alert(1)>',allocations:[{description:'Purchased Item <script>',dueDate:'2026-11-19',amount:2209.96,beforeBalance:50000,afterBalance:47790.04}]};
function load(){const context=vm.createContext({stagingData:{creditApplications:[record]},page:'dashboard',preferredLanguage:'English',txSearch:'',txSort:'Newest',hf:'All',render(){},transactions:()=>'<h1>Transactions</h1><section>Existing dues</section>',history:()=>'<h1>History</h1><div class="filter">All</div><section>Existing payments</section>',htmlSafe:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),stagingDate:v=>v,cash:v=>'PHP '+Number(v).toFixed(2)});vm.runInContext(fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',context);return context}

test('Transactions and History both show credit breakdowns separately from existing dues',()=>{
 const c=load();for(const screen of ['transactions','history']){const html=c[screen]();assert.match(html,/Account credit activity/);assert.match(html,/47790.04/);assert.match(html,/credit-entry/);assert.ok(html.indexOf('Account credit activity')<html.indexOf('Existing '));assert.equal((html.match(/data-credit-id="credit-1"/g)||[]).length,1)}
})
test('record text is escaped and no executable HTML is inserted',()=>{
 const html=load().transactions();assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/)
})
test('credit search, amount sorting and History category filters remain usable',()=>{
 const c=load();c.txSearch='unmatched';assert.doesNotMatch(c.transactions(),/data-credit-id/);c.txSearch='Purchased Item';assert.match(c.transactions(),/data-credit-id/)
 c.hf='Fees';assert.doesNotMatch(c.history(),/data-credit-id/);c.hf='Account credit';assert.match(c.history(),/data-credit-id/)
 c.stagingData.creditApplications.push({...record,id:'second',creditUsed:1});c.txSort='Amount: low to high';assert.ok(c.transactions().indexOf('data-credit-id="second"')<c.transactions().indexOf('data-credit-id="credit-1"'))
})
test('reversed activity is labelled neutrally rather than presented as a new successful payment',()=>{
 const c=load();c.stagingData.creditApplications=[{...record,status:'reversal'}];assert.match(c.history(),/Credit application reversed/);assert.match(c.history(),/credit-entry is-reversed/);assert.doesNotMatch(c.history(),/Cash received/)
})
test('Filipino labels retain borrower-entered due descriptions and amounts',()=>{
 const c=load();c.preferredLanguage='Filipino';const html=c.history();assert.match(html,/Kreditong inilapat/);assert.match(html,/Purchased Item/);assert.match(html,/47790.04/)
})
test('accounts without credit applications do not get empty history sections',()=>{
 const c=load();c.stagingData.creditApplications=[];assert.doesNotMatch(c.transactions(),/credit-entry/);assert.doesNotMatch(c.history(),/Account credit activity/)
})
