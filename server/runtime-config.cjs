const fs=require('node:fs');
module.exports=function runtimeConfig(env=process.env){
 if(!env.APP_ORIGIN&&env.VERCEL_URL)env={...env,APP_ORIGIN:'https://'+env.VERCEL_URL};
 const required=['APP_ORIGIN','SUPABASE_URL','SUPABASE_PUBLIC_KEY','SUPABASE_SERVICE_KEY','DATABASE_URL','LOGIN_CODE_SECRET'];
 for(const name of required)if(!env[name])throw Error('Missing server configuration: '+name);
 const origin=new URL(env.APP_ORIGIN),api=new URL(env.SUPABASE_URL),database=new URL(env.DATABASE_URL);
 if(origin.protocol!=='https:'||origin.origin!==env.APP_ORIGIN||api.protocol!=='https:'||api.pathname!=='/')throw Error('Hosted origins must use HTTPS, without paths.');
 if(!/^[a-z0-9-]+\.supabase\.co$/.test(api.hostname))throw Error('Use the authoritative hosted Supabase project.');
 if(!['postgres:','postgresql:'].includes(database.protocol)||['localhost','127.0.0.1','[::1]'].includes(database.hostname))throw Error('Use the hosted database connection.');
 // Login serialization and the notification listener use session-level features.
 if(database.port==='6543')throw Error('Use the session pooler (5432), not the transaction pooler.');
 if(env.LOGIN_CODE_SECRET.length<32||env.LOGIN_CODE_SECRET===env.SUPABASE_SERVICE_KEY)throw Error('Use a dedicated Login Code secret of at least 32 characters.');
 if(env.SUPABASE_PUBLIC_KEY===env.SUPABASE_SERVICE_KEY)throw Error('Public and privileged keys must differ.');
 if(!env.NOTIFICATION_WORKER_SECRET||env.NOTIFICATION_WORKER_SECRET.length<32||env.NOTIFICATION_WORKER_SECRET===env.LOGIN_CODE_SECRET)throw Error('Use a separate notification worker secret of at least 32 characters.');
 const dbUrl=new URL(database);dbUrl.searchParams.delete('sslmode');dbUrl.searchParams.delete('sslrootcert');
 return {origin:origin.origin,api:api.origin,databaseUrl:dbUrl.href,
  ssl:{rejectUnauthorized:true,...(env.DATABASE_CA_CERT?{ca:env.DATABASE_CA_CERT}:env.DATABASE_CA_FILE?{ca:fs.readFileSync(env.DATABASE_CA_FILE,'utf8')}:{})},
  publicKey:env.SUPABASE_PUBLIC_KEY,serviceKey:env.SUPABASE_SERVICE_KEY,secret:env.LOGIN_CODE_SECRET,
  workerSecret:env.NOTIFICATION_WORKER_SECRET};
};
