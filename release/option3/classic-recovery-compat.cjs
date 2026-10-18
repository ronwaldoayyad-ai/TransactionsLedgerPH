const notice='This Classic recovery screen is read-only. Use the current workspace to submit payments or change accounts.';
function replaceRequired(code,from,to){if(!code.includes(from))throw Error('Unrecognized Classic recovery source layout.');return code.replace(from,()=>to)}
exports.patchClassicRecovery=(code,id)=>{
 id=id.replaceAll('\\','/');
 if(id.endsWith('/src/lib/dbMappers.js')){
  const start=code.indexOf('export const mapTransaction ='),end=code.indexOf('export const mapPayment =');
  if(start<0||end<=start)throw Error('Unrecognized Classic mapper layout.');
  const transaction=replaceRequired(code.slice(start,end),'amount: num(r.amount),','...transactionAmounts(r),');
  code=code.slice(0,start)+transaction+code.slice(end);
  const profileStart=code.indexOf('export const mapProfile ='),profileEnd=code.indexOf('export const mapLoan =');
  // A minimal fixture can omit mapLoan; the production build has the full mapper.
  const limit=profileEnd>profileStart?profileEnd:code.indexOf('export const mapTransaction =');
  if(profileStart<0||limit<=profileStart)throw Error('Unrecognized Classic profile layout.');
  const profile=replaceRequired(code.slice(profileStart,limit),'status: r.status,','status: r.status, creditBalance: num(r.credit_balance),');
  code=code.slice(0,profileStart)+profile+code.slice(limit);
  const paymentStart=code.indexOf('export const mapPayment ='),paymentEnd=code.indexOf('export const mapPaymentLog =');
  const paymentLimit=paymentEnd>paymentStart?paymentEnd:code.length;
  const payment=replaceRequired(code.slice(paymentStart,paymentLimit),'status: r.status,',"status: r.retracted_at ? 'withdrawn' : r.status,");
  return "import {transactionAmounts} from 'virtual:classic-accounting-reader';\n"+code.slice(0,paymentStart)+payment+code.slice(paymentLimit);
 }
 if(id.endsWith('/src/supabaseClient.js')){
  const reader=`async function classicRecoveryFetch(input,init){
   const target=new URL(typeof input==='string'?input:input.url||String(input)),endpoint=new URL(SUPABASE_URL);
   const method=String(init?.method||input?.method||'GET').toUpperCase();
   const read=['GET','HEAD'].includes(method),auth=method==='POST'&&/^\\/auth\\/v1\\/(token|logout)$/.test(target.pathname),signed=method==='POST'&&target.pathname.startsWith('/storage/v1/object/sign/');
   if(target.origin===endpoint.origin&&(read||auth||signed))return fetch(input,init);
   return new Response(JSON.stringify({message:${JSON.stringify(notice)},code:'RECOVERY_READ_ONLY'}),{status:403,headers:{'Content-Type':'application/json'}});
  }
  document.addEventListener('submit',event=>{if(!/\\/login\\/?$/.test(location.pathname)){event.preventDefault();event.stopImmediatePropagation();window.alert(${JSON.stringify(notice)});}},true);
  `;
  return replaceRequired(code,'export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY)',reader+'export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY,{global:{fetch:classicRecoveryFetch}})');
 }
 if(id.endsWith('/src/context/AppContext.jsx')){
  code=code.replaceAll('supabase.auth.signOut()',"supabase.auth.signOut({ scope: 'local' })");
  const prefix=`const recoveryDeny=()=>{window.alert(${JSON.stringify(notice)});return {error:${JSON.stringify(notice)}}};\n`;
  return prefix+replaceRequired(code,'return <AppContext.Provider value={value}>{children}</AppContext.Provider>',`const recoveryValue=useMemo(()=>{const next={...value};for(const name of Object.keys(next)){if(/^(invite|update|delete|resend|submit|review|assign|unassign|set|archive|restore|purge|import|create|save|clear|add|complete)/.test(name)&&typeof next[name]==='function')next[name]=recoveryDeny;}return next},[value]);
   return <AppContext.Provider value={recoveryValue}><aside role="status" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:10000,padding:'10px 14px',textAlign:'center',fontSize:'12px',background:'#fff4d6',color:'#493400'}}>Read-only Classic recovery · Payments and account changes are disabled.</aside>{children}</AppContext.Provider>`);
 }
 if(id.endsWith('/src/pages/user/UserDashboard.jsx')){
  code=replaceRequired(code,'const { session, loans, payments, transactions, paymentDueOverrides } = useApp()','const { session, users, loans, payments, transactions, paymentDueOverrides } = useApp()');
  code=replaceRequired(code,'straightTxns.reduce((s, t) => s + t.amount, 0)','straightTxns.reduce((s, t) => s + (t.originalAmount ?? t.amount), 0)');
  code=replaceRequired(code,'installmentTxns.reduce((s, t) => s + t.amount, 0)','installmentTxns.reduce((s, t) => s + (t.originalAmount ?? t.amount), 0)');
  return replaceRequired(code,'      {/* Featured:',`      <div className="mb-4 rounded-xl bg-blue-50 p-4 text-sm">Available account credit <strong>{formatPeso(users.find(u=>u.id===session.user.id)?.creditBalance??0)}</strong> · Shown separately from outstanding dues.</div>\n      {/* Featured:`);
 }
 if(id.endsWith('/src/components/BorrowerScheduleTable.jsx')){
  code=replaceRequired(code,'transactions.reduce((s, t) => s + t.amount, 0)','transactions.reduce((s, t) => s + (t.originalAmount ?? t.amount), 0)');
  return code.replaceAll('formatPeso(t.amount)','formatPeso(t.originalAmount ?? t.amount)');
 }
 if(id.endsWith('/src/components/PaymentList.jsx'))return replaceRequired(code,'  const { users, loans, reviewPayment, getProofUrl, deletePayment } = useApp()', '  canReview = false;\n  const { users, loans, reviewPayment, getProofUrl, deletePayment } = useApp()');
 if(id.endsWith('/src/components/DuesOverview.jsx'))return replaceRequired(code,'  const goStatus = (key) => {',"  const goStatus = (key) => {\n    if(key==='paid'&&mode==='amount'&&scopedTxns.some(t=>t.paidAmount>0&&['unpaid','past_due'].includes(t.status))){navigate('/portal/payment-logs');return}");
 return code;
};
