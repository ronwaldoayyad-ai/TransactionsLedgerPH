const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/v41224-local-flows.js','utf8');
const helper=source.slice(source.indexOf('let mobileReadPending='),source.indexOf('const flowGo=go;'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const calls=[],errors=[];let finish,fail;
 const c={document:{visibilityState:'visible'},page:'dashboard',chatWidgetOpen:false,pawMode:'lender',stagingData:{user:{id:'a'},messages:[{id:'one',borrowerId:'a',fromAdmin:true,readAt:null}],hiddenMessages:[]},toast:e=>errors.push(e),mobileCall:action=>{calls.push(action);return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});}};
 vm.createContext(c);vm.runInContext(helper,c);return {c,calls,errors,finish:()=>finish(),fail:()=>fail(Error('Unavailable'))};
}
test('incoming messages are marked read only in a visible lender conversation',()=>{
 const f=fixture();f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,0);
 f.c.chatWidgetOpen=true;f.c.pawMode='assistant';f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,0);
 f.c.pawMode='lender';f.c.document.visibilityState='hidden';f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,0);
 f.c.document.visibilityState='visible';f.c.mobileReadVisibleMessages();assert.deepEqual(f.calls,['message-read']);assert.equal(f.c.stagingData.messages[0].readAt,null);
});
test('full Messages page acknowledges incoming messages without opening the widget',()=>{const f=fixture();f.c.page='messages';f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,1);});
test('outgoing, read, hidden and other borrowers messages cannot trigger an acknowledgement',()=>{
 const f=fixture();f.c.page='messages';f.c.stagingData.messages=[{id:'out',borrowerId:'a',fromAdmin:false},{id:'read',borrowerId:'a',fromAdmin:true,readAt:'now'},{id:'other',borrowerId:'b',fromAdmin:true},{id:'hidden',borrowerId:'a',fromAdmin:true}];f.c.stagingData.hiddenMessages=['hidden'];f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,0);
});
test('repeated renders coalesce and a new message during a request queues one follow-up',async()=>{
 const f=fixture();f.c.page='messages';f.c.mobileReadVisibleMessages();f.c.mobileReadVisibleMessages(true);assert.equal(f.calls.length,1);
 f.c.stagingData.messages.push({id:'two',borrowerId:'a',fromAdmin:true});f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,1);f.finish();await tick();assert.equal(f.calls.length,2);f.finish();await tick();f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,2);
});
test('failure does not poll or falsely mark read; explicit reopening can retry',async()=>{
 const f=fixture();f.c.page='messages';f.c.mobileReadVisibleMessages();f.fail();await tick();f.c.mobileReadVisibleMessages();assert.equal(f.calls.length,1);assert.deepEqual(f.errors,['Unavailable']);assert.equal(f.c.stagingData.messages[0].readAt,null);f.c.mobileReadVisibleMessages(true);assert.equal(f.calls.length,2);
});
test('a response after sign-out never acknowledges another account or shows its error',async()=>{
 const f=fixture();f.c.page='messages';f.c.mobileReadVisibleMessages();f.c.stagingData=null;f.fail();await tick();assert.equal(f.calls.length,1);assert.deepEqual(f.errors,[]);
});
