const {test}=require('node:test'),assert=require('node:assert/strict');
const validate=require('../../tools/validate-client-build.cjs');
const valid={VITE_APP_ENV:'preview',VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLIC_KEY:'sb_publishable_fixture'};
test('build rejects missing browser configuration before generating a blank app',()=>{
 for(const name of Object.keys(valid)){const env={...valid};delete env[name];assert.throws(()=>validate(env),new RegExp(name));}
 assert.doesNotThrow(()=>validate(valid));
});
test('build rejects privileged keys without exposing their values',()=>{
 const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.synthetic';
 for(const key of ['sb_secret_never-print-this',jwt('service_role'),'eyJ.invalid.synthetic'])assert.throws(()=>validate({...valid,VITE_SUPABASE_PUBLIC_KEY:key}),error=>error.message.includes('VITE_SUPABASE_PUBLIC_KEY')&&!error.message.includes(key));
 assert.doesNotThrow(()=>validate({...valid,VITE_SUPABASE_PUBLIC_KEY:jwt('anon')}));
});
test('hosted build requires a secure endpoint and explicit environment',()=>{
 for(const url of ['not a URL','http://fixture.supabase.co','https://u:p@fixture.supabase.co','https://fixture.supabase.co/other','https://fixture.supabase.co/?token=fixture'])assert.throws(()=>validate({...valid,VITE_SUPABASE_URL:url}));
 assert.throws(()=>validate({...valid,VITE_APP_ENV:'unknown'}));
 assert.throws(()=>validate({...valid,VERCEL_ENV:'production'}));
 assert.doesNotThrow(()=>validate({...valid,VITE_APP_ENV:'production',VERCEL_ENV:'production'}));
});
test('local build permits only the isolated local endpoint or same-origin proxy',()=>{
 for(const url of ['http://127.0.0.1:54321','/local-supabase'])assert.doesNotThrow(()=>validate({...valid,VITE_APP_ENV:'local',VITE_SUPABASE_URL:url}));
 assert.throws(()=>validate({...valid,VITE_APP_ENV:'local'}));
});
