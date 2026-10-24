const crypto=require('node:crypto'),{transport,message,nonceHash,TelegramFailure}=require('./telegram-api.cjs');
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'');
module.exports=({db,active,origin,token,botUsername='PayTrack_payment_bot',deliveryEnabled=false,fetchImpl})=>{
 const api=transport({token,fetchImpl}),configured=/^\d+:[A-Za-z0-9_-]{25,}$/.test(token||'');
 const settings=async(client=db)=>(await client.query('select * from mobile_private.telegram_settings where singleton')).rows[0];
 const audit=(client,user,operation,detail={})=>client.query('insert into mobile_private.telegram_audit(actor_id,operation,detail) values($1,$2,$3)',[user.id,operation,detail]);
 const requireConfigured=()=>{if(!configured)throw Error('The Telegram bot credential is not configured.');};
 async function identify(){requireConfigured();const bot=await api('getMe');if(!bot.is_bot||String(bot.username).toLowerCase()!==botUsername.toLowerCase())throw Error('The configured bot does not match the approved Telegram bot.');return bot;}
 async function list(req){
  await active(req,true);const s=await settings();
  const rows=(await db.query('select id,kind,payment_id,status,attempts,created_at,delivered_at,last_error,payload->>\'reference\' as reference from mobile_private.telegram_deliveries order by created_at desc,id desc limit 30')).rows;
  const counts=(await db.query('select status,count(*)::int as count from mobile_private.telegram_deliveries group by status')).rows;
  return {configured,deliveryEnabled,botUsername,workerError:s.last_worker_error||null,settings:{version:s.version,enabled:s.enabled,connected:!!s.chat_id,destination:s.chat_label||null,updatedAt:s.updated_at},deliveries:rows,counts};
 }
 async function begin(req){
  const user=await active(req,true),bot=await identify(),hook=await api('getWebhookInfo');
  if(hook.url)throw Error('This bot has an existing webhook. Use a dedicated bot or remove that integration before connecting.');
  const nonce=crypto.randomBytes(24).toString('base64url');
  await db.query("insert into mobile_private.telegram_connections(actor_id,nonce_hash,bot_id,expires_at) values($1,$2,$3,now()+interval '10 minutes') on conflict(actor_id) do update set nonce_hash=excluded.nonce_hash,bot_id=excluded.bot_id,expires_at=excluded.expires_at",[user.id,nonceHash(nonce),String(bot.id)]);
  return {url:'https://t.me/'+bot.username+'?start=ll_'+nonce,expiresIn:600};
 }
 async function connect(req){
  const user=await active(req,true),connection=(await db.query('select * from mobile_private.telegram_connections where actor_id=$1 and expires_at>now()',[user.id])).rows[0];
  if(!connection)throw Error('The connection link expired. Choose Connect my Telegram again.');
  const bot=await identify();if(String(bot.id)!==connection.bot_id)throw Error('The configured bot changed. Create a new connection link.');
  const hook=await api('getWebhookInfo');if(hook.url)throw Error('This bot has an existing webhook. Use the dedicated LoanLedger bot.');
  const updates=await api('getUpdates',{limit:100,timeout:0});
  const candidates=updates.filter(update=>{
   const m=update.message,match=/^\/start(?:@[A-Za-z0-9_]+)? ll_([A-Za-z0-9_-]{32})$/.exec(m?.text||'');
   return m?.chat?.type==='private'&&!m.from?.is_bot&&String(m.from?.id)===String(m.chat.id)&&match&&nonceHash(match[1])===connection.nonce_hash;
  });
  const chat=candidates.at(-1)?.message.chat;
  if(!chat||!/^[1-9][0-9]{0,19}$/.test(String(chat.id)))throw Error('Press Start using your connection link in Telegram, then check again.');
  const client=await db.connect();try{
   await client.query('begin');const live=(await client.query('select * from mobile_private.telegram_connections where actor_id=$1 and expires_at>now() for update',[user.id])).rows[0];
   if(!live||live.nonce_hash!==connection.nonce_hash)throw Error('The connection link expired or was replaced.');
   await client.query('select singleton from mobile_private.telegram_settings where singleton for update');
   await client.query("update mobile_private.telegram_deliveries set status='cancelled',last_error='Private chat connection changed.' where status in ('queued','retry')");
   await client.query('update mobile_private.telegram_settings set chat_id=$1,chat_label=$2,bot_id=$3,connected_by=$4,enabled=false,version=version+1,updated_at=now() where singleton',[String(chat.id),String(chat.first_name||chat.username||'Private chat').slice(0,80)+' · '+String(chat.id).slice(-4),String(bot.id),user.id]);
   await client.query('delete from mobile_private.telegram_connections where actor_id=$1',[user.id]);
   await audit(client,user,'connected');await client.query('commit');
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
  return {connected:true};
 }
 async function save(req,body){
  const user=await active(req,true);if(typeof body.enabled!=='boolean'||!Number.isInteger(body.version))throw Error('Refresh Telegram settings before saving.');
  if(body.enabled){requireConfigured();if(!deliveryEnabled)throw Error('Telegram delivery is not enabled in this environment.');}
  const client=await db.connect();try{
   await client.query('begin');const s=await settings(client);const r=await client.query('update mobile_private.telegram_settings set enabled=$1,version=version+1,updated_at=now() where singleton and version=$2 and ($1=false or chat_id is not null) returning version',[body.enabled,body.version]);
   if(!r.rowCount)throw Error('Settings changed or a private chat has not been connected. Refresh and try again.');
   if(body.enabled){const bot=await identify();if(String(bot.id)!==s.bot_id)throw Error('The bot changed. Reconnect your private chat.');}
   await client.query("update mobile_private.telegram_deliveries set status='cancelled',last_error='Telegram settings changed.' where status in ('queued','retry')");
   await audit(client,user,body.enabled?'enabled':'disabled');await client.query('commit');
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
  return {saved:true};
 }
 async function test(req){
  const user=await active(req,true);requireConfigured();if(!deliveryEnabled)throw Error('Telegram delivery is not enabled in this environment.');
  const client=await db.connect();try{
   await client.query('begin');await client.query('select singleton from mobile_private.telegram_settings where singleton for update');const s=await settings(client);if(!s.chat_id)throw Error('Connect your private chat first.');
   const recent=await client.query("select 1 from mobile_private.telegram_deliveries where kind='test' and created_at>now()-interval '30 seconds'");
   if(recent.rowCount)throw Error('Please wait 30 seconds before sending another test alert.');
   const bot=await identify();if(String(bot.id)!==s.bot_id)throw Error('The bot changed. Reconnect your private chat.');
   const job=(await client.query("insert into mobile_private.telegram_deliveries(kind,destination,bot_id,settings_version,payload) values('test',$1,$2,$3,'{}') returning id",[s.chat_id,s.bot_id,s.version])).rows[0];
   await audit(client,user,'test_requested',{deliveryId:job.id});await client.query('commit');return {queued:true,id:job.id};
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function retry(req,body){
  const user=await active(req,true);if(!deliveryEnabled)throw Error('Telegram delivery is not enabled in this environment.');if(!uuid(body.id)||body.confirm!==true)throw Error('Review the delivery before retrying.');requireConfigured();
  const r=await db.query("update mobile_private.telegram_deliveries d set status='queued',attempts=0,next_at=now(),last_error=null from mobile_private.telegram_settings s where s.singleton and s.chat_id=d.destination and s.bot_id=d.bot_id and s.version=d.settings_version and (s.enabled or d.kind='test') and d.id=$1 and d.status in ('failed','uncertain') returning d.id",[body.id]);
  if(!r.rowCount)throw Error('This delivery is no longer retryable. Check the current settings and delivery status.');
  await audit(db,user,'retry_requested',{deliveryId:body.id});return {queued:true};
 }
 async function run(){
  if(!configured||!deliveryEnabled)return {telegramProcessed:0};
  const client=await db.connect();let processed=0;
  try{
   const bot=await identify();
   await client.query("update mobile_private.telegram_deliveries set status='uncertain',last_error='Delivery was interrupted. Check Telegram before retrying.' where status='sending' and sending_at<now()-interval '2 minutes'");
   for(let index=0;index<3;index++){
    let job;try{
     await client.query('begin');
     const s=await settings(client);
     job=(await client.query("select * from mobile_private.telegram_deliveries where status in ('queued','retry') and next_at<=now() order by next_at,created_at limit 1 for update skip locked")).rows[0];
     if(!job){await client.query('commit');break}
     const payment=job.kind==='proof'?(await client.query('select retracted_at from public.payments where id=$1',[job.payment_id])).rows[0]:{};
     if(s.bot_id!==String(bot.id))throw Error('The configured bot changed. Reconnect the approved bot.');
     if(!s.chat_id||s.chat_id!==job.destination||s.bot_id!==job.bot_id||s.version!==job.settings_version||(!s.enabled&&job.kind!=='test')||!payment||payment.retracted_at){
      await client.query("update mobile_private.telegram_deliveries set status='cancelled',last_error='Delivery is no longer applicable.' where id=$1",[job.id]);await client.query('commit');continue;
     }
     await client.query("update mobile_private.telegram_deliveries set status='sending',sending_at=now(),attempts=attempts+1 where id=$1",[job.id]);await client.query('commit');
    }catch(error){await client.query('rollback');throw error}
    try{
     const result=await api('sendMessage',message(job,origin));
     await client.query("update mobile_private.telegram_deliveries set status='delivered',delivered_at=now(),message_id=$2,last_error=null where id=$1 and status='sending'",[job.id,String(result.message_id)]);processed++;
    }catch(error){
     const retryable=error.retryable&&job.attempts<4,status=error.uncertain?'uncertain':retryable?'retry':'failed',delay=Math.max(error.retryAfter||0,Math.min(3600,60*2**job.attempts));
     await client.query("update mobile_private.telegram_deliveries set status=$2,next_at=now()+($3::int*interval '1 second'),last_error=$4 where id=$1 and status='sending'",[job.id,status,delay,error instanceof TelegramFailure?error.message:'Delivery failed. Check Telegram before retrying.']);
    }
   }
   await client.query('update mobile_private.telegram_settings set last_worker_error=null where singleton');
   return {telegramProcessed:processed};
  }catch(error){await client.query('update mobile_private.telegram_settings set last_worker_error=$1 where singleton',[error instanceof TelegramFailure?error.message:'Telegram delivery is temporarily unavailable. Check the bot configuration and retry.']).catch(()=>{});throw error}finally{client.release()}
 }
 return {list,begin,connect,save,test,retry,run};
};
