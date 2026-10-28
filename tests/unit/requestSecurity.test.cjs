const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRequestSecurity,addressKey}=require('../../server/request-security.cjs'),createApi=require('../../server/web-api.cjs');
const secret='synthetic-request-protection-secret-at-least-32';
function storage(){const values=new Map(),calls=[];return {values,calls,db:{query:async(sql,args)=>{calls.push({sql,args});const n=(values.get(args[0])||0)+1;values.set(args[0],n);return {rows:[{attempts:n,retry_after:60}]}}}}}
test('IP subjects canonicalize mapped addresses and group IPv6 privacy addresses without accepting malformed addresses',()=>{
 assert.equal(addressKey('192.0.2.1'),'192.0.2.1');assert.equal(addressKey('::ffff:192.0.2.1'),'192.0.2.1');
 assert.equal(addressKey('2001:db8:0:1::1'),addressKey('2001:0db8:0000:0001:abcd::99'));
 for(const address of ['', 'spoofed','192.0.2.1, 198.51.100.1','fe80::1%eth0','evil.invalid'])assert.equal(addressKey(address),'unknown');
});
test('sign-in quotas survive cookie replacement and different service instances; persisted keys do not contain IPs or user IDs',async()=>{
 const s=storage(),a=createRequestSecurity({db:s.db,secret}),b=createRequestSecurity({db:s.db,secret});
 for(let n=0;n<15;n++)await (n%2?a:b).request({route:n%2?'/redeem':'/login-password',address:'192.0.2.10',cookie:'new-device-'+n});
 await assert.rejects(b.request({route:'/redeem',address:'192.0.2.10'}),e=>e.status===429&&e.retryAfter===60);
 const calls=s.calls.length;await assert.rejects(b.request({route:'/redeem',address:'192.0.2.10'}),e=>e.status===429);assert.equal(s.calls.length,calls,'deny cache avoids repeated database work');
 for(const {args}of s.calls)assert.match(args[0],/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(s.calls.map(c=>c.args)),/192\.0\.2|new-device/);
});
test('assistant user quotas remain shared when the client IP changes',async()=>{
 const s=storage(),a=createRequestSecurity({db:s.db,secret}),b=createRequestSecurity({db:s.db,secret});for(let n=0;n<12;n++)await (n%2?a:b).assistant({id:'borrower-fixture'});await assert.rejects(b.assistant({id:'borrower-fixture'}),e=>e.status===429);
 await a.assistant({id:'another-borrower'});assert.doesNotMatch(JSON.stringify(s.calls.map(c=>c.args)),/borrower-fixture/);
});
test('unavailable or malformed quota results fail closed without internal details',async()=>{
 for(const query of [async()=>{throw Error('private database credentials')},async()=>({rows:[]}),async()=>({rows:[{attempts:-1}]})]){const g=createRequestSecurity({db:{query},secret});await assert.rejects(g.request({route:'/redeem',address:'192.0.2.1'}),e=>e.status===503&&!e.message.includes('private database'));}
});
test('the hosted gateway rejects cross-origin/non-JSON requests and enforces quotas before invoking a handler',async()=>{
 const s=storage(),guard=createRequestSecurity({db:s.db,secret});let handled=0;
 const h=createApi(()=>({origin:'https://fixture.example',requestGuard:guard.request,service:{handler:async(_req,res)=>{handled++;res.end('{}')}},assistant:async()=>{}}));
 const req=(extra={})=>new Request('https://fixture.example/api/redeem',{method:'POST',body:'{}',headers:{'Content-Type':'application/json','x-vercel-forwarded-for':'192.0.2.44',...extra}});
 assert.equal((await h(req({Origin:'https://foreign.invalid'}))).status,403);assert.equal(s.calls.length,0);
 assert.equal((await h(req({'Content-Type':'text/plain'}))).status,415);assert.equal(s.calls.length,0);
 for(let n=0;n<15;n++)assert.equal((await h(req({Cookie:'ll_login_device=different-'+n}))).status,200);
 const denied=await h(req());assert.equal(denied.status,429);assert.equal(handled,15);assert.equal(denied.headers.get('Retry-After'),'60');
});
test('gateway quota failures produce a generic retryable response',async()=>{
 const h=createApi(()=>({origin:'https://fixture.example',requestGuard:async()=>{throw Error('private query and password')}}));const r=await h(new Request('https://fixture.example/api/login-status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private query|password/);
});
