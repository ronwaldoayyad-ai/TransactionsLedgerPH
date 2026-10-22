// Fixed local destinations only. This is an isolated rehearsal gateway, never deployed.
const http=require('node:http'),net=require('node:net');
const routes={'auth':['loanledger-release-gates-auth',9999],'storage':['loanledger-release-gates-storage',5000],'rest':['loanledger-release-gates-rest',3000],'mail':['loanledger-release-gates-mail',8025]};
http.createServer((req,res)=>{
 const match=/^\/(auth|storage|rest|mail)\/(.*)$/.exec(req.url);if(!match){res.writeHead(404);return res.end();}
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'http://127.0.0.1:25173','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-upsert','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end();}
 const [hostname,port]=routes[match[1]],headers={...req.headers,host:hostname+':'+port};delete headers.connection;
 if(match[1]==='mail'){delete headers.origin;delete headers.referer;}
 const upstream=http.request({hostname,port,path:'/'+match[2].replace(/^v1\//,''),method:req.method,headers},r=>{res.writeHead(r.statusCode,{...r.headers,'access-control-allow-origin':'http://127.0.0.1:25173'});r.pipe(res);});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local service unavailable');});req.pipe(upstream);
}).listen(5001,'0.0.0.0');
net.createServer(socket=>{const upstream=net.connect(1025,'loanledger-release-gates-mail');socket.pipe(upstream).pipe(socket);upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());}).listen(5002,'0.0.0.0');
