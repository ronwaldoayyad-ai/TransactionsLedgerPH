const {test}=require('node:test'),assert=require('node:assert/strict'),{Readable}=require('node:stream');
const {createGroupLogos,createGroupLogoHandler}=require('../../server/group-logos.cjs'),createApi=require('../../server/web-api.cjs');
const raw='<svg viewBox="0 0 24 24"><path d="M2 2L22 22" fill="#10b981"/></svg>',origin='https://fixture.example';
test('only active administrators can validate or save group artwork and preview performs no database writes',async()=>{
 let queries=0;const db={query:()=>{queries++;throw Error('Unexpected database query')},connect:()=>{queries++;throw Error('Unexpected database connection')}};
 const allowed=createGroupLogos({db,active:async()=>({id:'admin',role:'admin',status:'active'})});assert.match((await allowed.preview({}, {group:'cash_loan',svg:raw})).svg,/<svg/);assert.equal(queries,0);
 for(const user of [{role:'user',status:'active'},{role:'admin',status:'disabled'}]){const service=createGroupLogos({db,active:async()=>user});await assert.rejects(service.preview({},{group:'fees',svg:raw}),e=>e.status===403);await assert.rejects(service.save({},{}),e=>e.status===403)}assert.equal(queries,0)
 await assert.rejects(allowed.preview({},{group:'retail_installment',svg:raw}),/Choose a supported shared logo/)
 assert.match((await allowed.preview({},{group:'payment_proof_submitted',svg:raw})).svg,/<svg/)
})
async function request(handler,{url='/group-logos/preview',method='POST',headers={},body='{}'}={}){const req=Readable.from([Buffer.from(body)]);Object.assign(req,{url,method,headers});let status=200,result;const res={setHeader(){},writeHead(code){status=code},end(text){result=JSON.parse(text)}};await handler(req,res);return {status,result}}
test('group-logo HTTP adapter rejects wrong origins, unknown actions, oversize payloads and malformed JSON',async()=>{
 let calls=0;const handler=createGroupLogoHandler({origin,service:{preview:async()=>{calls++;return {svg:raw}}}});
 assert.equal((await request(handler,{headers:{origin:'https://untrusted.invalid'}})).status,403);assert.equal((await request(handler,{url:'/group-logos/other'})).status,404);assert.equal((await request(handler,{body:'x'.repeat(3145729)})).status,413);assert.equal((await request(handler,{body:'{'})).status,400);assert.equal(calls,0);assert.equal((await request(handler)).result.svg,raw);assert.equal(calls,1)
})
test('hosted adapter permits bounded SVG preview while retaining smaller limits on unrelated endpoints',async()=>{
 const runtime={origin,service:{handler:async(req,res)=>res.end(JSON.stringify({path:req.url})),db:{query:async()=>({})}}};const handler=createApi(()=>runtime);
 assert.equal((await handler(new Request(origin+'/api/group-logos/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({svg:'x'.repeat(70000)})}))).status,200);assert.equal((await handler(new Request(origin+'/api/group-logos/preview',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(3145729)}))).status,413);assert.equal((await handler(new Request(origin+'/api/group-logos/not-allowed',{method:'POST'}))).status,404);assert.equal((await handler(new Request(origin+'/api/login-status',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(70000)}))).status,413)
})
