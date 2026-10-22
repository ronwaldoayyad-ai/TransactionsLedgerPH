const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const create=require('../../server/support-tracking.cjs');
test('support availability reports only whether verification delivery is configured',()=>{
 assert.deepEqual(create({}).capabilities(),{emailTracking:false});
 assert.deepEqual(create({sendVerification:async()=>{}}).capabilities(),{emailTracking:true});
});
test('support navigation hides deferred email tracking and exposes it only after capability confirmation',async()=>{
 let receiver,renders=0,calls=0;const parent={},context={parent,location:{origin:'https://fixture.example'},window:{addEventListener:(event,handler)=>{if(event==='message')receiver=handler}},supportNavigation:()=>'<nav></nav>',supportSubmenu:()=>'<section></section>',helpIcon:()=>'',page:'more',render:()=>renders++,mobileCall:async()=>{calls++;return {emailTracking:true}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/v41224-support-tracking.js','utf8'),context);
 assert.doesNotMatch(context.supportNavigation(),/Track request/);assert.doesNotMatch(context.supportSubmenu(),/Track request/);
 await receiver({origin:'https://foreign.example',source:parent,data:{channel:'loanledger-v41224',type:'session'}});assert.equal(calls,0);
 await receiver({origin:context.location.origin,source:parent,data:{channel:'loanledger-v41224',type:'session'}});await Promise.resolve();await Promise.resolve();assert.equal(calls,1);assert.match(context.supportNavigation(),/Track request/);assert.match(context.supportSubmenu(),/Track request/);assert.equal(renders,1);
 await receiver({origin:context.location.origin,source:parent,data:{channel:'loanledger-v41224',type:'snapshot'}});assert.equal(calls,1);
});
