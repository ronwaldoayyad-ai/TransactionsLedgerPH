const {test}=require('node:test'),assert=require('node:assert/strict');
const {transport,message,nonceHash}=require('../../server/telegram-api.cjs'),create=require('../../server/telegram.cjs'),handler=require('../../server/telegram-http.cjs'),{Readable}=require('node:stream');
const token='123456:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',origin='https://fixture.example';
const reply=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
test('Telegram formats only approved fields with a protected admin review link',()=>{
 const r=message({kind:'proof',destination:'12345',payment_id:'proof-id',payload:{borrower:'Jane\n<b>Borrower</b>',amount:'1234.56',reference:'ACK-12',submittedAt:'2026-10-25T01:30:00Z',file_path:'private-proof',bank:'private-bank'}},origin);
 assert.equal(r.chat_id,'12345');assert.match(r.text,/Jane <b>Borrower<\/b>/);assert.match(r.text,/1,234.56/);assert.match(r.text,/9:30/);assert.match(r.text,/Philippine time/);assert.doesNotMatch(JSON.stringify(r),/private-proof|private-bank/);assert.equal(r.parse_mode,undefined);assert.equal(r.protect_content,true);assert.equal(r.link_preview_options.is_disabled,true);assert.equal(r.reply_markup.inline_keyboard[0][0].url,origin+'/admin/queue?proof=proof-id');
 assert.throws(()=>message({kind:'test'},'http://unsafe.example'),/HTTPS/);
});
test('transport sends secrets only to the fixed Telegram host and does not follow redirects',async()=>{
 let sent;const api=transport({token,fetchImpl:async(url,options)=>{sent={url,options};return reply({ok:true,result:{id:1}})}});
 assert.deepEqual(await api('getMe'),{id:1});assert.equal(sent.url,'https://api.telegram.org/bot'+token+'/getMe');assert.equal(sent.options.redirect,'error');assert.equal(sent.options.method,'POST');
 await assert.rejects(api('../other'),/Unsupported/);
});
test('provider errors never expose token or raw response details; rate limits schedule bounded retries',async()=>{
 const api=transport({token,fetchImpl:async()=>reply({ok:false,error_code:429,description:token,parameters:{retry_after:99}},429)});
 await assert.rejects(api('sendMessage'),e=>e.retryable&&e.retryAfter===99&&!e.message.includes(token));
 const bad=transport({token,fetchImpl:async()=>reply({ok:false,error_code:401,description:'private-response-'+token},401)});
 await assert.rejects(bad('getMe'),e=>!e.message.includes(token)&&!e.retryable&&/credential/.test(e.message));
});
test('uncertain send outcomes are not automatically retried; definite connection failures are',async()=>{
 const api=transport({token,fetchImpl:async()=>{throw new Error('secret-url-'+token)}});
 await assert.rejects(api('sendMessage'),e=>e.uncertain&&!e.retryable&&!e.message.includes(token));
 const dns=transport({token,fetchImpl:async()=>{throw Object.assign(new Error('private'),{cause:{code:'ENOTFOUND'}})}});
 await assert.rejects(dns('sendMessage'),e=>e.retryable&&!e.uncertain);
});
test('Telegram admin actions authorize before querying data or contacting Telegram',async()=>{
 let accesses=0;const service=create({db:{query(){accesses++}},active:async(req,admin)=>{assert.equal(admin,true);throw Object.assign(Error('Admin only'),{status:403})},origin,token,fetchImpl:async()=>{accesses++}});
 for(const action of ['list','begin','connect','save','test','retry'])await assert.rejects(service[action]({},{}),/Admin only/);
 assert.equal(accesses,0);
});
test('private chat pairing requires the exact one-time challenge and matching private sender',async()=>{
 const nonce='a'.repeat(32),connection={nonce_hash:nonceHash(nonce),bot_id:'1'},base={message:{text:'/start ll_'+nonce,chat:{type:'private',id:123,first_name:'Owner'},from:{id:123,is_bot:false}}};
 for(const update of [{...base,message:{...base.message,chat:{type:'group',id:123}}},{...base,message:{...base.message,from:{id:999}}},{...base,message:{...base.message,text:'/start ll_'+'b'.repeat(32)}}]){
  const db={query:async()=>({rows:[connection]})};
  const service=create({db,active:async()=>({id:'admin'}),origin,token,fetchImpl:async url=>reply({ok:true,result:url.endsWith('/getMe')?{id:1,is_bot:true,username:'PayTrack_payment_bot'}:url.endsWith('/getWebhookInfo')?{url:''}:[update]})});
  await assert.rejects(service.connect({}),/Press Start/);
 }
});
test('existing bot webhook is preserved and prevents automatic pairing',async()=>{
 let readUpdates=false;
 const service=create({db:{query:async()=>({rows:[]})},active:async()=>({id:'admin'}),origin,token,fetchImpl:async url=>{if(url.endsWith('/getUpdates'))readUpdates=true;return reply({ok:true,result:url.endsWith('/getMe')?{id:1,is_bot:true,username:'PayTrack_payment_bot'}:{url:'https://existing.invalid'}})}});
 await assert.rejects(service.begin({}),/existing webhook/);assert.equal(readUpdates,false);
});
test('disabled environments do not deliver or query the queue',async()=>{
 const service=create({db:{connect(){throw Error('must not connect')}},active:async()=>({}),origin,token,deliveryEnabled:false});
 assert.deepEqual(await service.run(),{telegramProcessed:0});
});
test('Telegram HTTP endpoints enforce origin, method and bounded input',async()=>{
 let calls=0;const h=handler({origin,service:{list:async()=>{calls++;return {configured:false}}}});
 async function request(url,method,body,requestOrigin){const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{url,method,headers:requestOrigin?{origin:requestOrigin}:{}});let status=200,output='';const res={setHeader(){},writeHead(s){status=s},end(s){output=s||''}};await h(req,res);return {status,output}}
 assert.equal((await request('/telegram/list','POST','{}','https://foreign.invalid')).status,403);
 assert.equal((await request('/telegram/list','GET')).status,400);
 assert.equal((await request('/telegram/list','POST','x'.repeat(4097))).status,400);
 assert.equal(calls,0);assert.equal((await request('/telegram/list','POST','{}',origin)).status,200);assert.equal(calls,1);
});

test('borrower message alerts contain a bounded plain-text preview and a signed-in conversation link',()=>{
 const borrowerId='00000000-0000-4000-8000-000000000001';
 const r=message({kind:'message',destination:'12345',payload:{borrower:'Jane',borrowerId,preview:'<b>Hello</b> '+ '🙂'.repeat(250),sentAt:'2026-10-25T01:30:00Z',attachment_path:'private-file',fullBody:'unshared-full-body'}},origin);
 assert.match(r.text,/New borrower message/);assert.match(r.text,/<b>Hello<\/b>/);assert.equal(r.parse_mode,undefined);assert.doesNotMatch(JSON.stringify(r),/private-file|unshared-full-body/);
 const preview=r.text.match(/\nMessage: (.*)\nSent:/)[1];assert.equal(Array.from(preview).length,201);assert.ok(preview.endsWith('…'));
 assert.equal(r.reply_markup.inline_keyboard[0][0].url,origin+'/admin/messages?borrower='+borrowerId);assert.equal(r.reply_markup.inline_keyboard[0][0].text,'Open conversation');
});
test('message-test alerts are clearly labelled and do not open an unrelated borrower conversation',()=>{
 const r=message({kind:'test',destination:'12345',payload:{testType:'message',borrower:'QA Test Borrower',preview:'Synthetic alert only',sentAt:'2026-10-25T01:30:00Z'}},origin);
 assert.match(r.text,/Message alert test/);assert.match(r.text,/No borrower message was created/);assert.equal(r.reply_markup.inline_keyboard[0][0].url,origin+'/admin/messages');
});
test('idle Telegram queues do not contact the provider',async()=>{
 let providerCalls=0;
 const client={query:async()=>({rows:[],rowCount:0}),release(){}};
 const service=create({db:{connect:async()=>client},active:async()=>({}),origin,token,deliveryEnabled:true,fetchImpl:async()=>{providerCalls++;throw Error('should not call')}});
 assert.deepEqual(await service.run(),{telegramProcessed:0});assert.equal(providerCalls,0);
});
