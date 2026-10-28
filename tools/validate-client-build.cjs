// Reject incomplete public configuration before Vite produces an unusable build.
// Errors name the setting only; supplied keys and endpoints are never logged.
module.exports=function validateClientBuild(env){
 const fail=name=>{throw new Error('Configure '+name+' before building LoanLedger.');};
 for(const name of Object.keys(env))if(name.startsWith('VITE_')){
  if(/SECRET|PASSWORD|PRIVATE|SERVICE.?ROLE|SERVICE.?KEY|DATABASE_URL|MCP_TOKEN|BOT_TOKEN|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN/i.test(name)||/(?:^|_)DEBUG(?:_|$)/i.test(name))fail('server-only placement for '+name);
  const value=String(env[name]||'');if(/^(?:sb_secret_|sk-(?:proj-|or-v1-)?[a-zA-Z0-9_-]{20,}|gh[pousr]_|github_pat_)|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value))fail('public value for '+name);
  if(value.startsWith('eyJ')){let role;try{role=JSON.parse(Buffer.from(value.split('.')[1],'base64url')).role;}catch{fail('public value for '+name);}if(role!=='anon')fail('public value for '+name);}
 }
 const environment=env.VITE_APP_ENV;
 if(!['local','preview','production'].includes(environment))fail('VITE_APP_ENV');
 if(env.VERCEL_ENV==='production'&&environment!=='production')fail('VITE_APP_ENV for production');
 if(env.VERCEL_ENV==='production'&&env.VITE_ALLOW_DEMO!=='false')fail('VITE_ALLOW_DEMO=false for production');
 const raw=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLIC_KEY;
 if(!raw)fail('VITE_SUPABASE_URL');
 if(!key||key.startsWith('sb_secret_'))fail('VITE_SUPABASE_PUBLIC_KEY');
 if(key.startsWith('eyJ')){try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')fail('VITE_SUPABASE_PUBLIC_KEY');}catch{fail('VITE_SUPABASE_PUBLIC_KEY');}}
 if(environment==='local'){
  if(!['http://127.0.0.1:54321','http://127.0.0.1:54321/','/local-supabase','/local-supabase/'].includes(raw))fail('VITE_SUPABASE_URL for local staging');
 }else{
  let endpoint;try{endpoint=new URL(raw);}catch{fail('VITE_SUPABASE_URL');}
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)fail('VITE_SUPABASE_URL');
 }
};
