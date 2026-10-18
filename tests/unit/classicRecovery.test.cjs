const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {patchClassicRecovery}=require('../../release/option3/classic-recovery-compat.cjs');
const source=`export const mapProfile = (r) => ({id:r.id, status: r.status,});
export const mapTransaction = (r) => ({id:r.id, amount: num(r.amount),status:r.status});
export const mapPayment = (r) => ({id:r.id,status: r.status,});`;
test('independent Classic uses the same tested remaining-balance reader and exposes account credit',()=>{
 const code=patchClassicRecovery(source,'/src/lib/dbMappers.js');
 assert.match(code,/transactionAmounts\(r\)/);assert.match(code,/creditBalance: num\(r.credit_balance\)/);
 assert.match(code,/virtual:classic-accounting-reader/);
});
test('recovery refuses unfamiliar mapper layouts instead of silently shipping incorrect balances',()=>{
 assert.throws(()=>patchClassicRecovery('changed layout','/src/lib/dbMappers.js'),/layout/i);
});
test('recovery permits authentication and signed document reads, while blocking financial writes',async()=>{
 const code=patchClassicRecovery("const SUPABASE_URL='https://test.invalid';const SUPABASE_PUBLIC_KEY='public';export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)",'/src/supabaseClient.js');
 let options,reads=0;const context={URL,Response,JSON,fetch:async()=>{reads++;return new Response('{}')},document:{addEventListener(){}},window:{alert(){}},createClient:(_url,_key,value)=>{options=value;return {}}};
 vm.runInNewContext(code.replace('export const supabase','const supabase'),context);
 const fetch=options.global.fetch;
 for(const [url,method] of [['https://test.invalid/rest/v1/transactions','GET'],['https://test.invalid/auth/v1/token?grant_type=password','POST'],['https://test.invalid/storage/v1/object/sign/payment-proofs/x','POST']])assert.equal((await fetch(url,{method})).status,200);
 assert.equal(reads,3);
 const denied=await fetch('https://test.invalid/rest/v1/transactions',{method:'PATCH'});assert.equal(denied.status,403);assert.match((await denied.json()).message,/read-only/i);assert.equal(reads,3);
 assert.equal((await fetch('https://test.invalid/auth/v1/user',{method:'PUT'})).status,403);
 assert.equal((await fetch('https://other.invalid/rest/v1/transactions',{method:'GET'})).status,403);
 assert.equal((await fetch({url:'https://test.invalid/rest/v1/profiles',method:'HEAD'})).status,200);
});
test('recovery wraps account mutators before they can optimistically change balances',()=>{
 const code=patchClassicRecovery('return <AppContext.Provider value={value}>{children}</AppContext.Provider>','/src/context/AppContext.jsx');
 assert.match(code,/recoveryValue/);assert.match(code,/Read-only Classic recovery/);assert.match(code,/recoveryDeny/);
});
test('recovery borrower summary shows available credit and retains original transaction totals',()=>{
 const source=`const { session, loans, payments, transactions, paymentDueOverrides } = useApp()
const straightTotal = straightTxns.reduce((s, t) => s + t.amount, 0)
const installmentTotal = installmentTxns.reduce((s, t) => s + t.amount, 0)
      {/* Featured: Current */}`;
 const code=patchClassicRecovery(source,'/src/pages/user/UserDashboard.jsx');assert.match(code,/Available account credit/);assert.match(code,/t.originalAmount \?\? t.amount/);assert.match(code,/users.find/);
});
test('recovery hides legacy proof-approval controls and does not queue withdrawn proofs',()=>{
 const component=patchClassicRecovery('  const { users, loans, reviewPayment, getProofUrl, deletePayment } = useApp()','/src/components/PaymentList.jsx');
 assert.match(component,/canReview = false/);
 assert.match(patchClassicRecovery(source,'/src/lib/dbMappers.js'),/r.retracted_at \? 'withdrawn' : r.status/);
});
test('recovery preserves schedule totals and routes partial paid-fund drilldown to history',()=>{
 const schedule=patchClassicRecovery('const total=transactions.reduce((s, t) => s + t.amount, 0);formatPeso(t.amount)','/src/components/BorrowerScheduleTable.jsx');assert.match(schedule,/t.originalAmount \?\? t.amount/);
 assert.match(patchClassicRecovery('  const goStatus = (key) => {','/src/components/DuesOverview.jsx'),/navigate\('\/portal\/payment-logs'\)/);
 assert.equal(patchClassicRecovery('untouched','/src/other.js'),'untouched');
});
test('full mapper layout retains adjacent functions and rejects incomplete profile/payment layouts',()=>{
 const full=source.replace('export const mapTransaction', 'export const mapLoan=r=>r;export const mapTransaction')+'export const mapPaymentLog=r=>r;';
 const code=patchClassicRecovery(full,'/src/lib/dbMappers.js');assert.match(code,/export const mapLoan/);assert.match(code,/export const mapPaymentLog/);
 assert.throws(()=>patchClassicRecovery(source.replace(/export const mapProfile[^\n]+\n/,''),'/src/lib/dbMappers.js'),/layout/i);
 assert.throws(()=>patchClassicRecovery(source.replace('id:r.id,status: r.status,','id:r.id,'),'/src/lib/dbMappers.js'),/layout/i);
});
test('recovery sign-out remains local to the current device',()=>{
 const code=patchClassicRecovery('supabase.auth.signOut();return <AppContext.Provider value={value}>{children}</AppContext.Provider>','/src/context/AppContext.jsx');assert.match(code,/signOut\(\{ scope: 'local' \}\)/);
});
