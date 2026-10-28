const test=require('node:test'),assert=require('node:assert/strict');
const config=require('../../server/runtime-config.cjs');
const valid={APP_ORIGIN:'https://preview.example.com',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_PUBLIC_KEY:'public-fixture',SUPABASE_SERVICE_KEY:'server-fixture',DATABASE_URL:'postgresql://fixture:fixture@pool.example.com:5432/postgres?sslmode=require',LOGIN_CODE_SECRET:'dedicated-fixture-secret-at-least-32-characters',NOTIFICATION_WORKER_SECRET:'separate-fixture-worker-secret-at-least-32-characters'};
test('production config fails closed when required values are missing',()=>{for(const key of Object.keys(valid)){const value={...valid};delete value[key];assert.throws(()=>config(value));}});
test('production refuses localhost, insecure origins, paths and transaction pooling',()=>{
 for(const [key,value] of [['APP_ORIGIN','http://preview.example.com'],['APP_ORIGIN','https://preview.example.com/path'],['SUPABASE_URL','http://127.0.0.1:54321'],['DATABASE_URL','postgresql://u:p@localhost:5432/postgres'],['DATABASE_URL','postgresql://u:p@pool.example.com:6543/postgres'],['LOGIN_CODE_SECRET','short']])assert.throws(()=>config({...valid,[key]:value}));
});
test('hosted database TLS always verifies certificates',()=>{
 const value=config(valid);assert.equal(value.ssl.rejectUnauthorized,true);assert.ok(!value.databaseUrl.includes('sslmode'));assert.equal(value.api,valid.SUPABASE_URL);
});

test('hosted origins reject credentials and URL modifiers, and connection strings cannot weaken explicit TLS',()=>{
 for(const url of ['https://u:p@fixture.supabase.co','https://fixture.supabase.co/?x=1','https://fixture.supabase.co/#x'])assert.throws(()=>config({...valid,SUPABASE_URL:url}));
 const value=config({...valid,DATABASE_URL:valid.DATABASE_URL+'&ssl=false&sslkey=untrusted&sslpassword=untrusted&uselibpqcompat=true'});assert.equal(value.ssl.rejectUnauthorized,true);assert.doesNotMatch(value.databaseUrl,/ssl|libpq/);
 assert.throws(()=>config({...valid,SUPABASE_PUBLIC_KEY:'sb_secret_synthetic'}));
});

test('staged builds trust only the exact platform deployment hostname',()=>{
 const value=config({...valid,VERCEL_URL:'loanledger-reviewed-123.vercel.app'});assert.equal(value.origin,valid.APP_ORIGIN);assert.equal(value.deploymentOrigin,'https://loanledger-reviewed-123.vercel.app');assert.equal(config(valid).deploymentOrigin,null);
 for(const host of ['https://loanledger.vercel.app','loanledger.vercel.app/path','loanledger.vercel.app:443','loanledger.vercel.app.evil.invalid','user@loanledger.vercel.app','*.vercel.app','loanledger.vercel.app?x'])assert.throws(()=>config({...valid,VERCEL_URL:host}));
});
