// Loopback-only development adapter. Never used by the hosted runtime.
const crypto=require('node:crypto'),{Pool}=require('pg'),path=require('node:path');
const db=new Pool({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres'});
const secret=process.env.LOCAL_SUPABASE_JWT_SECRET||'super-secret-jwt-token-with-at-least-32-characters-long';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role){const value=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});return value+'.'+crypto.createHmac('sha256',secret).update(value).digest('base64url');}
const service=require('./flow-service.cjs')({db,api:'http://127.0.0.1:54321',origin:process.env.LOCAL_PUBLIC_ORIGIN||'http://127.0.0.1:5173',jwt,
 hash:code=>crypto.createHmac('sha256',secret).update(String(code)).digest('hex'),cookiePath:'/local-flow',
 validatorPython:process.env.LOCAL_VALIDATOR_PYTHON||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')});
if(require.main===module)service.server.listen(54325,'127.0.0.1',()=>console.log('Local companion ready.'));
module.exports=service;
