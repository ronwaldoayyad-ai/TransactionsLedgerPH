// Generate the reviewed additive candidate; this script never connects to a database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {removeTransactionBoundaries,assertSingleTransaction}=require('./sql-transaction-boundaries.cjs');
const root=path.resolve(__dirname,'../..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=[path.join(__dirname,'foundation.sql'),...fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>/^202610.*\.sql$/.test(name)).sort().map(name=>path.join(root,'supabase/migrations',name)).filter(file=>fs.readFileSync(file,'utf8').trim())];
const boundaries=[];
let sql=files.map((file,index)=>{const stripped=removeTransactionBoundaries(fs.readFileSync(file,'utf8'),path.relative(root,file));boundaries.push({file:path.relative(root,file).replaceAll('\\','/'),begins:stripped.begins,commits:stripped.commits});return(index?'\n-- '+path.basename(file)+'\n':'')+stripped.sql}).join('');
// Imported function definitions can omit a visible composite return schema.
// The candidate must also compile after pg_dump has cleared search_path.
sql=sql.replace(/(FUNCTION public\.acknowledge_loan_disbursement\(p_id uuid\)\s+RETURNS )loan_disbursements\b/g,'$1public.loan_disbursements');
sql="-- GENERATED REHEARSAL CANDIDATE. NOT APPROVED FOR PRODUCTION.\nbegin;\nset local lock_timeout='5s';\n"+sql+'\ncommit;\n';
assertSingleTransaction(sql);
fs.writeFileSync(path.join(__dirname,'forward-candidate.sql'),sql);
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({status:'rehearsal candidate; production approval required',classic_commit:'db08a917120a6455b8d2d0d42ddf981c5b3cbd63',sha256:hash(sql),transaction_boundaries:boundaries,sources:files.map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))})),adaptations:['Preserve Classic borrower payment/message policies','Do not infer or backfill loan categories','Schema-qualify imported disbursement return type for empty search_path','SQL-aware single transaction; paused rollout and default Classic','No staging accounts, passwords, codes or enrollments']},null,2)+'\n');
console.log('Generated reviewed candidate from '+files.length+' source files. No database changes made.');
