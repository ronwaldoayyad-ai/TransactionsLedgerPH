// Read-only analysis of the verified local restore. No allocations or credit are inferred.
const fs=require('node:fs'),path=require('node:path');
const {Pool}=require('pg'),{vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
async function run(){
 const receipt=JSON.parse(fs.readFileSync(path.join(folder,'latest-restore.json'))),v=vault(folder);
 if(!/^release_restore_[a-f0-9]{12}$/.test(receipt.database))throw Error('Verified local restore required.');
 const db=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:receipt.database,max:1});
 try{
  await db.query("begin read only;set local time zone 'UTC'");
  const profiles=(await db.query('select id,name,email from public.profiles')).rows;
  const proofs=(await db.query("select * from public.payments where status='approved' order by submitted_at,id")).rows;
  const logs=(await db.query('select * from public.payment_logs order by txn_date,id')).rows;
  const transactions=(await db.query('select * from public.transactions order by due_date,id')).rows;
  const date=x=>x?new Date(x).toISOString().slice(0,10):null;
  const nearby=(a,b,c)=>a&&b&&c&&date(a)>=date(b)&&date(a)<=date(c);
  const shift=(a,n)=>a?new Date(new Date(a).getTime()+n*86400000):null;
  const reviewed=proofs.map(p=>{
   const owner=profiles.find(x=>x.id===p.user_id),paidRows=transactions.filter(t=>t.user_id===p.user_id&&t.loan_id===p.loan_id&&t.status==='paid');
   const candidates=logs.filter(l=>l.user_id===p.user_id&&l.kind==='payment'&&Math.round(Number(l.funds_applied)*100)===Math.round(Number(p.amount)*100)&&nearby(l.txn_date,shift(p.submitted_at,-3),shift(p.reviewed_at||p.submitted_at,3)));
   const nearPaidRows=paidRows.filter(t=>nearby(t.date_paid,shift(p.submitted_at,-3),shift(p.reviewed_at||p.submitted_at,3)));
   return {proof:p,borrower:owner,candidateAcknowledgements:candidates,paidRows,nearPaidRowIds:nearPaidRows.map(t=>t.id),classification:candidates.length===1?'candidate link — needs lender verification':'unresolved — needs lender evidence',decision:'pending'};
  });
  const usage=new Map();for(const item of reviewed)for(const c of item.candidateAcknowledgements)usage.set(c.id,(usage.get(c.id)||0)+1);
  for(const item of reviewed)item.sharedCandidateIds=item.candidateAcknowledgements.filter(c=>usage.get(c.id)>1).map(c=>c.id);
  const negatives=transactions.filter(t=>Number(t.amount)<0).map(t=>({transaction:t,borrower:profiles.find(p=>p.id===t.user_id),sameBorrowerAcknowledgements:logs.filter(l=>l.user_id===t.user_id&&(date(l.due_date)===date(t.due_date)||Math.abs(Number(l.remaining_balance))===Math.abs(Number(t.amount)))),decision:'pending',note:'Do not convert this historical adjustment into new credit automatically.'}));
  const summary={capturedAt:new Date().toISOString(),approvedProofs:proofs.length,approvedProofTotal:Number(proofs.reduce((s,p)=>s+Math.round(Number(p.amount)*100),0)/100),singleCandidateProofs:reviewed.filter(p=>p.candidateAcknowledgements.length===1).length,unmatchedProofs:reviewed.filter(p=>p.candidateAcknowledgements.length===0).length,proofsWithSharedCandidate:reviewed.filter(p=>p.sharedCandidateIds.length).length,proofsWithoutNearbyPaidRows:reviewed.filter(p=>!p.nearPaidRowIds.length).length,negativeAdjustments:negatives.length,negativeTotal:Number(negatives.reduce((s,t)=>s+Math.round(Number(t.transaction.amount)*100),0)/100),paidNegativeRows:negatives.filter(t=>t.transaction.status==='paid').length,unpaidNegativeRows:negatives.filter(t=>t.transaction.status==='unpaid').length,acknowledgements:logs.length,negativeAcknowledgementBalances:logs.filter(l=>Number(l.remaining_balance)<0).length,decisionsPending:proofs.length+negatives.length,financialWrites:0};
  const report={summary,proofs:reviewed,negativeAdjustments:negatives,acknowledgements:logs};
  const item=v.put('legacy-reconciliation-'+Date.now(),JSON.stringify(report));
  fs.writeFileSync(path.join(folder,'latest-reconciliation.json'),JSON.stringify({summary,encryptedReport:item.file},null,2));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>'PHP '+Number(x||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
  let md='# Protected legacy reconciliation review\n\nNo financial records have been changed. Candidate links are suggestions, not verified allocations. Review against receipts, bank statements and lender records. Approved legacy proofs must not be submitted to the new posting engine.\n\n';
  md+='## Summary\n\n'+Object.entries(summary).map(([k,val])=>'- '+k+': '+val).join('\n')+'\n\n';
  md+='## Approved proofs\n\n';
  for(const [i,r]of reviewed.entries())md+='### Proof '+(i+1)+' — '+esc(r.borrower?.name)+'\n\n- ID: '+r.proof.id+'\n- Amount: '+money(r.proof.amount)+'; submitted '+date(r.proof.submitted_at)+'; reviewed '+date(r.proof.reviewed_at)+'\n- Reference: '+esc(r.proof.reference)+'\n- Loan: '+esc(r.proof.loan_id)+'\n- Paid rows on loan: '+r.paidRows.length+'; paid rows within comparison window: '+r.nearPaidRowIds.length+'\n- Candidate acknowledgements: '+r.candidateAcknowledgements.map(l=>l.id+' ('+date(l.txn_date)+', '+money(l.funds_applied)+', '+esc(l.reference)+')').join('; ')+'\n- Shared candidate IDs: '+r.sharedCandidateIds.join(', ')+'\n- Review: PENDING — confirm historical-only, provide exact link/allocation evidence, or flag a correction.\n\n';
  md+='## Negative adjustments\n\n';
  for(const [i,r]of negatives.entries())md+='### Adjustment '+(i+1)+' — '+esc(r.borrower?.name)+'\n\n- ID: '+esc(r.transaction.id)+'\n- Description: '+esc(r.transaction.description)+'\n- Amount: '+money(r.transaction.amount)+'; status '+esc(r.transaction.status)+'; due '+date(r.transaction.due_date)+'\n- Potential related acknowledgements: '+r.sameBorrowerAcknowledgements.map(l=>l.id).join(', ')+'\n- Review: PENDING — confirm whether already represented by existing paid rows/acknowledgements. No automatic credit conversion.\n\n';
  fs.writeFileSync(path.join(folder,'LEGACY-RECONCILIATION-REVIEW.md'),md,{mode:0o600});
  console.log(JSON.stringify(summary));await db.query('commit');
 }catch(e){await db.query('rollback').catch(()=>{});v.put('reconciliation-error-'+Date.now(),JSON.stringify({code:e.code,message:e.message}));console.error('Local reconciliation stopped; protected diagnostics retained.');process.exitCode=1;}finally{await db.end();v.close();}
}
if(require.main===module)run();
