// Local test adapter only; no production keys or account-management routes are exposed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{Pool}=require('pg'),{vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22'),v=vault(folder),meta=JSON.parse(fs.readFileSync(path.join(folder,'latest-runtime.json'))),r=JSON.parse(v.get(meta.file.replace(/\.aesgcm$/,'')));
if(!/^release_runtime_[a-f0-9]{12}$/.test(r.database))throw Error('Only the local recovery clone is allowed.');
const credentialFile=fs.readdirSync(folder).filter(f=>f.startsWith('local-browser-credentials-')).sort().at(-1),credentials=JSON.parse(v.get(credentialFile.replace(/\.aesgcm$/,'')));v.close();
const origin='http://127.0.0.1:25173',db=new Pool({host:'127.0.0.1',port:25432,user:'postgres',password:'postgres',database:r.database,max:3});
const transport=require('nodemailer').createTransport({host:'127.0.0.1',port:25125,secure:false,ignoreTLS:true,allowInternalNetworkInterfaces:true,disableFileAccess:true,disableUrlAccess:true});
const service=require('../../server/flow-service.cjs')({db,api:'http://127.0.0.1:25100',origin,jwt:role=>role==='anon'?r.anon:r.service,hash:s=>crypto.createHmac('sha256',r.secret).update(String(s)).digest('hex'),cookiePath:'/local-flow',backgroundWorkers:false,sendSupportVerification:({to,code,reference})=>transport.sendMail({from:'recovery@test.invalid',to,subject:'Local support verification',text:'Code '+code+' for '+reference})});
const app=require('../../server/app-server.cjs')({service,origin,dist:path.join(folder,'browser-dist'),env:{PAWCHEEBELS_AI_ENABLED:'false'}});
const server=http.createServer((req,res)=>{
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end();}
 if(req.url==='/qa/credentials'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(JSON.stringify(credentials));}
 if(req.url.startsWith('/local-supabase/')){const route=req.url.slice('/local-supabase'.length),up=http.request({hostname:'127.0.0.1',port:25100,path:route,method:req.method,headers:{...req.headers,host:'127.0.0.1:25100'}},u=>{res.writeHead(u.statusCode,u.headers);u.pipe(res);});up.on('error',()=>{res.writeHead(502);res.end();});return req.pipe(up);}
 if(req.url.startsWith('/local-flow/'))req.url='/api/'+req.url.slice('/local-flow/'.length);
 app.emit('request',req,res);
});
server.listen(25173,'127.0.0.1',()=>console.log('Isolated recovery app ready on '+origin));
process.on('SIGINT',()=>server.close(()=>db.end()));
