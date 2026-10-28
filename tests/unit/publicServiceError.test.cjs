const test=require('node:test'),assert=require('node:assert/strict');
const publicError=require('../../server/public-service-error.cjs');
test('database and TLS failures expose retry feedback without internal details',()=>{
 for(const code of ['SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ECONNRESET','ETIMEDOUT','ENOTFOUND','42702','28P01']){
  const result=publicError(Object.assign(Error('private database host, query and certificate details'),{code}));
  assert.equal(result.status,503);assert.match(result.body.error,/temporarily unavailable/i);assert.doesNotMatch(JSON.stringify(result),/private database|42702|certificate details/);
 }
});
test('account lock and remaining attempts keep their intended response',()=>{
 const error=Object.assign(Error('Contact your lender to unlock access.'),{status:423,code:'LOGIN_LOCKED',login:{remaining:0,locked:true}});
 assert.deepEqual(publicError(error),{status:423,body:{error:error.message,code:'LOGIN_LOCKED',login:error.login}});
});
test('validation messages remain useful while malformed requests are scrubbed',()=>{
 assert.equal(publicError(Error('Choose a supported screenshot.')).body.error,'Choose a supported screenshot.');
 assert.equal(publicError(new SyntaxError('Unexpected token private-input')).status,400);
 assert.doesNotMatch(publicError(new SyntaxError('Unexpected token private-input')).body.error,/private-input/);
});
