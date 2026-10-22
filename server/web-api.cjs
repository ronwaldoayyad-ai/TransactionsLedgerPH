const {Readable}=require('node:stream'),crypto=require('node:crypto');
const routes=new Set(['/issue','/revoke','/redeem','/login-password','/login-status','/login-locks','/login-unlock','/borrower-details','/borrower-profile','/borrower-password','/borrower-access','/borrower-access-save','/installment-category','/validate-upload','/guest-support']);
module.exports=function createApiHandler(getRuntime){return async function handle(request){
 const url=new URL(request.url),route=url.pathname==='/api'?'/'+(url.searchParams.get('__route')||''):url.pathname.slice('/api'.length);
 const json=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(url.pathname!=='/api'&&!url.pathname.startsWith('/api/'))return json(404,{error:'Unsupported request.'});
 if(!routes.has(route)&&!/^\/(release-access|notification-rules)\/[a-z-]+$/.test(route)&&!/^\/support-tracking\/(capabilities|request|verify|read|end)$/.test(route)&&!['/pawcheebels/ask','/notification-worker','/health'].includes(route))return json(404,{error:'Unsupported request.'});
 if(request.method!=='POST'&&!(route==='/health'&&request.method==='GET'))return json(405,{error:'Unsupported request method.'});
 let runtime;try{runtime=getRuntime()}catch{return json(503,{error:'The service is not configured yet. Please contact support.'});}
 const {service,assistant,origin,deploymentOrigin,workerSecret}=runtime;
 const requestOrigin=request.headers.get('origin');
 if(requestOrigin&&requestOrigin!==origin&&requestOrigin!==deploymentOrigin)return json(403,{error:'This request is not allowed.'});
 if(route==='/health'){
  try{await service.db.query('select 1');return json(200,{ready:true})}catch{return json(503,{ready:false})}
 }
 if(route==='/notification-worker'){
  const supplied=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+workerSecret);
  if(!workerSecret||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return json(401,{error:'Unauthorized worker request.'});
  try{return json(200,{processed:true,...await service.runNotifications()})}catch{return json(503,{error:'Notification processing failed. Queued events remain available for retry.'});}
 }
 try{
  const limit=route==='/guest-support'?4194304:65536,chunks=[];let size=0;
  if(request.body)for await(const chunk of request.body){size+=chunk.byteLength;if(size>limit)return json(413,{error:'Request is too large.'});chunks.push(Buffer.from(chunk));}
  const req=Readable.from(chunks);req.url=route;req.method=request.method;req.headers=Object.fromEntries(request.headers);
  // Nested handlers use the canonical origin. Normalize only after matching the
  // exact platform-bound deployment origin above; never broaden their CORS policy.
  if(deploymentOrigin&&requestOrigin===deploymentOrigin)req.headers.origin=origin;
  req.socket={remoteAddress:request.headers.get('x-vercel-forwarded-for')?.split(',')[0]||'anonymous'};
  const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});let status=200,ended=false,result;
  const response=new Promise(resolve=>result=resolve);
  const res={setHeader(name,value){headers.delete(name);for(const item of Array.isArray(value)?value:[value])headers.append(name,String(item));},getHeader:name=>headers.get(name),writeHead(code,extra){status=code;if(extra)for(const [k,v] of Object.entries(extra))this.setHeader(k,v);return this;},end(body){if(!ended){ended=true;result(new Response(body||null,{status,headers}));}}};
  await (route.startsWith('/pawcheebels/')?assistant(req,res):service.handler(req,res));
  if(!ended)return json(503,{error:'The service did not complete. Please retry.'});
  return response;
 }catch{return json(503,{error:'The request could not be completed. Please retry.'});}
};};
