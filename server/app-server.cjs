// Local acceptance harness for the Vercel Web Request API and static build.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {createPawcheebelsHandler}=require('./pawcheebels.cjs');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
module.exports=function createAppServer({service,origin,dist,env=process.env}){
 const root=path.resolve(dist),assistant=createPawcheebelsHandler({origin,authenticate:service.active,env});
 const api=require('./web-api.cjs')(()=>({service,assistant,origin,workerSecret:env.NOTIFICATION_WORKER_SECRET}));
 return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Cache-Control','no-store');
  try{
   const url=new URL(req.url,origin);
   if(url.pathname==='/healthz'){
    try{await service.db.query('select 1');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready:true}));}
    catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:false}));}return;
   }
   if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
    const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response=await api(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const decoded=decodeURIComponent(url.pathname),candidate=path.resolve(root,'.'+decoded);
   if(candidate!==root&&!candidate.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   let file=candidate;
   if(!fs.existsSync(file)||!fs.statSync(file).isFile()){
    // Never serve index.html for a missing script, service, or API response.
    if(path.extname(decoded)||decoded.startsWith('/local-flow/')){res.writeHead(404);res.end();return;}
    file=path.join(root,'index.html');
   }
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
   if(file.includes(path.sep+'assets'+path.sep)&&/-[A-Za-z0-9_-]{8,}\./.test(path.basename(file)))res.setHeader('Cache-Control','public, max-age=31536000, immutable');
   if(req.method==='HEAD'){res.end();return;}
   const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The request could not be completed. Please retry.'}));}
 });
};
