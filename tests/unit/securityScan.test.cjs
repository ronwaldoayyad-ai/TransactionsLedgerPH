const {test}=require('node:test'),assert=require('node:assert/strict'),{inspect}=require('../../tools/security-scan.cjs');
test('secret guard reports locations without echoing credentials and allows explicit public/fixture configuration',()=>{
 const token='sb_'+'secret_'+ 'a'.repeat(24),findings=inspect('const x="'+token+'"','server/service.cjs');assert.equal(findings.length,1);assert.ok(!JSON.stringify(findings).includes(token));assert.equal(inspect('sb_publishable_public_example','src/client.js').length,0);assert.equal(inspect('DATABASE_URL=postgresql://USER:PASSWORD@PROJECT/db','.env.example').length,0);assert.equal(inspect('DATABASE_URL=','.env.production').length,1);
});
