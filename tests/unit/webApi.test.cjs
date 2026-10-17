const test=require('node:test'),assert=require('node:assert/strict');
const create=require('../../server/web-api.cjs');
const origin='https://fixture.example',workerSecret='separate-worker-fixture-secret-at-least-32';
function runtime(){return {origin,workerSecret,service:{db:{query:async()=>({rows:[]})},runNotifications:async()=>({worked:true}),handler:async(req,res)=>{let data='';for await(const chunk of req)data+=chunk;res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie','fixture=opaque; HttpOnly; Path=/api; Secure');res.end(JSON.stringify({route:req.url,body:JSON.parse(data||'{}'),cookieSeen:!!req.headers.cookie}));}},assistant:async(req,res)=>res.end('{}')}}
test('Vercel rewrite preserves the endpoint and JSON, including HttpOnly response cookies',async()=>{
 const handler=create(runtime),r=await handler(new Request(origin+'/api?__route=login-status',{method:'POST',headers:{cookie:'fixture=opaque','Content-Type':'application/json'},body:'{"check":true}'}));
 assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/HttpOnly; Path=\/api/);assert.deepEqual(await r.json(),{route:'/login-status',body:{check:true},cookieSeen:true});
});
test('unknown API paths and unsupported methods never fall through to SPA HTML',async()=>{
 const handler=create(runtime);for(const [route,method,status] of [['/api/invalid','POST',404],['/api/login-status','GET',405]]){const r=await handler(new Request(origin+route,{method}));assert.equal(r.status,status);assert.match(r.headers.get('Content-Type'),/json/);}
});
test('missing hosted configuration fails closed with a scrubbed JSON error',async()=>{
 const r=await create(()=>{throw Error('private-value-must-not-escape')})(new Request(origin+'/api/login-status',{method:'POST'}));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private-value/);
});
test('requests from another origin and unauthorized worker invocations are denied',async()=>{
 const h=create(runtime),foreign=await h(new Request(origin+'/api/login-status',{method:'POST',headers:{Origin:'https://other.example'}}));assert.equal(foreign.status,403);
 const denied=await h(new Request(origin+'/api/notification-worker',{method:'POST'}));assert.equal(denied.status,401);
 const allowed=await h(new Request(origin+'/api/notification-worker',{method:'POST',headers:{Authorization:'Bearer '+workerSecret}}));assert.equal(allowed.status,200);assert.equal((await allowed.json()).worked,true);
});
test('oversized function bodies are rejected before the service handler',async()=>{
 const r=await create(runtime)(new Request(origin+'/api/login-status',{method:'POST',body:'x'.repeat(65537)}));assert.equal(r.status,413);
});
test('worker failures return a retryable error rather than a false success',async()=>{
 const r=runtime();r.service.runNotifications=async()=>{throw Error('database unavailable')};const result=await create(()=>r)(new Request(origin+'/api/notification-worker',{method:'POST',headers:{Authorization:'Bearer '+workerSecret}}));assert.equal(result.status,503);
});
