const crypto=require('node:crypto'),{Pool}=require('pg');
let runtime;
module.exports=function getRuntime(){
 if(runtime)return runtime;
 const config=require('./runtime-config.cjs')();
 const db=new Pool({connectionString:config.databaseUrl,ssl:config.ssl,max:3,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,allowExitOnIdle:true,statement_timeout:20000});
 require('@vercel/functions/db-connections').attachDatabasePool(db);
 db.on('error',()=>console.error('Database connection interrupted.'));
 const protection=require('./request-security.cjs').createRequestSecurity({db,secret:config.secret});
 const service=require('./flow-service.cjs')({db,...config,cookiePath:'/api',backgroundWorkers:false,telegramConfig:{token:process.env.TELEGRAM_BOT_TOKEN,botUsername:process.env.TELEGRAM_BOT_USERNAME||'PayTrack_payment_bot',deliveryEnabled:process.env.TELEGRAM_DELIVERY_ENABLED==='true'},sendSupportVerification:require('./support-mailer.cjs')(),jwt:role=>role==='anon'?config.publicKey:config.serviceKey,hash:code=>crypto.createHmac('sha256',config.secret).update(String(code)).digest('hex')});
 const {createPawcheebelsHandler}=require('./pawcheebels.cjs');
 runtime={service,origin:config.origin,deploymentOrigin:config.deploymentOrigin,workerSecret:config.workerSecret,requestGuard:protection.request,assistant:createPawcheebelsHandler({origin:config.origin,authenticate:service.active,consumeQuota:protection.assistant})};
 // No intervals, LISTEN connections or background daemons in a Vercel function.
 return runtime;
};
