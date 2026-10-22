const {test}=require('node:test'),assert=require('node:assert/strict');
const mailer=require('../../server/support-mailer.cjs');
test('tracking email is disabled when no approved SMTP transport is configured',()=>assert.equal(mailer({}),null));
test('tracking mailer requires TLS ports and rejects malformed sender configuration',()=>{
 const env={SUPPORT_SMTP_HOST:'smtp.test.invalid',SUPPORT_SMTP_USER:'synthetic',SUPPORT_SMTP_PASSWORD:'synthetic-only',SUPPORT_FROM_EMAIL:'support@test.invalid'};
 assert.throws(()=>mailer({...env,SUPPORT_SMTP_PORT:'25'}),/TLS/);assert.throws(()=>mailer({...env,SUPPORT_SMTP_HOST:'localhost/path'}),/configuration/);assert.throws(()=>mailer({...env,SUPPORT_FROM_EMAIL:'sender\r\nBcc:bad@test.invalid'}),/configuration/);
});
