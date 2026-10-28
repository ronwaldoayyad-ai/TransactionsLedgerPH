import {test} from 'node:test'
import assert from 'node:assert/strict'
import {subscribeToInvalidations} from '../../src/lib/realtimeInvalidation.js'
const wait=()=>new Promise(resolve=>setTimeout(resolve,25))
function fixture(onChange=async()=>{}){let event,status,filter,removed=0;const channel={on(kind,f,cb){filter=f;event=cb;return this},subscribe(cb){status=cb;return this}};const client={channel:()=>channel,removeChannel:()=>{removed++}};const errors=[];const stop=subscribeToInvalidations({client,name:'fixture',table:'message_change_signals',ownerId:'borrower-1',isAdmin:false,onChange,onError:e=>errors.push(e.message),delay:1});return {event:()=>event(),status:s=>status(s),filter:()=>filter,removed:()=>removed,errors,stop,client}}
test('borrower invalidations subscribe only to their own signal metadata',()=>{const f=fixture();assert.deepEqual(f.filter(),{event:'*',schema:'public',table:'message_change_signals',filter:'borrower_id=eq.borrower-1'});f.stop();assert.equal(f.removed(),1)})

test('notification invalidations use the authenticated recipient column, including admins',()=>{
 let filter;const channel={on(_event,value){filter=value;return this},subscribe(){return this}};
 const stop=subscribeToInvalidations({client:{channel:()=>channel,removeChannel(){}},name:'notifications',table:'notification_change_signals',ownerId:'recipient',ownerColumn:'user_id',isAdmin:false,onChange:async()=>{}});
 assert.equal(filter.filter,'user_id=eq.recipient');stop();
})
test('bursts coalesce and idle time causes no recurring reads',async()=>{let calls=0;const f=fixture(async()=>{calls++});f.event();f.event();f.event();await wait();assert.equal(calls,1);await wait();assert.equal(calls,1);f.stop()})
test('initial join and reconnect reconcile missed events once each',async()=>{let calls=0;const f=fixture(async()=>{calls++});f.status('SUBSCRIBED');await wait();f.status('SUBSCRIBED');await wait();assert.equal(calls,2);f.stop()})
test('events during a read request one follow-up without concurrent reads',{timeout:5000},async()=>{
 let release,firstRead,secondRead,calls=0,active=0,maxActive=0;
 const held=new Promise(r=>release=r),started=new Promise(r=>firstRead=r),followedUp=new Promise(r=>secondRead=r);
 const f=fixture(async()=>{calls++;active++;maxActive=Math.max(maxActive,active);if(calls===1){firstRead();await held}else secondRead();active--});
 try{f.event();await started;f.event();f.event();assert.equal(calls,1);release();await followedUp;assert.equal(calls,2);assert.equal(maxActive,1)}finally{release();f.stop()}
})
test('unmount cancels queued reads and ignores later channel callbacks',async()=>{let calls=0;const f=fixture(async()=>{calls++});f.event();f.stop();f.event();f.status('SUBSCRIBED');await wait();assert.equal(calls,0);assert.equal(f.removed(),1)})
test('failed refreshes and channel errors are reported without a retry loop',async()=>{let calls=0;const f=fixture(async()=>{calls++;throw Error('Read failed')});f.status('CHANNEL_ERROR');f.event();await wait();assert.deepEqual(f.errors,['Live updates are reconnecting.','Read failed']);await wait();assert.equal(calls,1);f.stop()})
