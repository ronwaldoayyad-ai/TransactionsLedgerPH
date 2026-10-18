const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('the imported disbursement return type resolves with an empty session search path',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../release/option3/forward-candidate.sql'),'utf8');
 assert.match(sql,/FUNCTION public\.acknowledge_loan_disbursement\(p_id uuid\)\s+RETURNS public\.loan_disbursements/);
});
