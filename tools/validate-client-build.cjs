// Reject incomplete public configuration before Vite produces an unusable build.
// Errors name the setting only; supplied keys and endpoints are never logged.
module.exports=function validateClientBuild(env){
 const fail=name=>{throw new Error('Configure '+name+' before building LoanLedger.');};
 const environment=env.VITE_APP_ENV;
 if(!['local','preview','production'].includes(environment))fail('VITE_APP_ENV');
 if(env.VERCEL_ENV==='production'&&environment!=='production')fail('VITE_APP_ENV for production');
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
