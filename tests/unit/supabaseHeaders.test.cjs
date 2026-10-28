const test=require('node:test'),assert=require('node:assert/strict');
const headers=require('../../server/supabase-headers.cjs');
test('opaque server keys are sent only as API keys',()=>{assert.deepEqual(headers('sb_publishable_fixture','sb_secret_fixture'),{apikey:'sb_secret_fixture'});});
test('user JWTs stay bearer tokens with the public API key',()=>{assert.deepEqual(headers('sb_publishable_fixture','sb_secret_fixture','user.jwt.token'),{apikey:'sb_publishable_fixture',Authorization:'Bearer user.jwt.token'});});
test('legacy service-role JWT compatibility is retained',()=>{assert.deepEqual(headers('anon.jwt','service.jwt'),{apikey:'service.jwt',Authorization:'Bearer service.jwt'});});
