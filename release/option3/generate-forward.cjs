// Generate the reviewed additive candidate; this script never connects to a database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const files=[path.join(__dirname,'foundation.sql'),...fs.readdirSync(path.join(root,'supabase/migrations')).filter(name=>/^202610.*\.sql$/.test(name)).sort().map(name=>path.join(root,'supabase/migrations',name))];
let sql=files.map((file,index)=>(index?'\n-- '+path.basename(file)+'\n':'')+fs.readFileSync(file,'utf8')).join('');
sql=sql.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
sql="-- GENERATED REHEARSAL CANDIDATE. NOT APPROVED FOR PRODUCTION.\nbegin;\nset local lock_timeout='5s';\n"+sql+'\ncommit;\n';
fs.writeFileSync(path.join(__dirname,'forward-candidate.sql'),sql);
fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({status:'rehearsal candidate; production approval required',classic_commit:'db08a917120a6455b8d2d0d42ddf981c5b3cbd63',sha256:hash(sql),sources:files.map(file=>({file:path.relative(root,file).replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))})),adaptations:['Preserve Classic borrower payment/message policies','Do not infer or backfill loan categories','One transaction; paused rollout and default Classic','No staging accounts, passwords, codes or enrollments']},null,2)+'\n');
console.log('Generated reviewed candidate from '+files.length+' source files. No database changes made.');
