const {test}=require('node:test'),assert=require('node:assert/strict')
const plan=require('../../server/notification-planning.cjs')
const event={id:'event',occurred_at:'2026-11-11T01:00:00Z'},rule={id:'rule',version:3}
const action={nodeId:'send',channel:'inbox',delay:60,language:'all'}
function fixture(preferences=[]){
 const reads=[],inserts=[]
 return {reads,inserts,client:{async query(sql,args){
  if(sql.startsWith('select ')){reads.push(args[0]);return {rows:preferences.filter(p=>args[0].includes(p.user_id))}}
  assert.match(sql,/on conflict\(event_id,rule_id,node_id,recipient_id\) do nothing$/)
  const placeholders=[...sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]))
  assert.deepEqual(placeholders,Array.from({length:args.length},(_,i)=>i+1))
  for(let i=0;i<args.length;i+=10)inserts.push(args.slice(i,i+10))
  return {rows:[]}
 }}}
}
test('250 recipients use six bounded database calls instead of 500 and retain delivery metadata',async()=>{
 const ids=Array.from({length:250},(_,i)=>'recipient-'+i),f=fixture([{user_id:ids[1],ui_options:{language:'Filipino'}}])
 await plan(f.client,event,rule,action,ids)
 assert.deepEqual(f.reads.map(ids=>ids.length),[100,100,50]);assert.equal(f.inserts.length,250)
 for(const [i,row] of f.inserts.entries())assert.deepEqual(row,[event.id,rule.id,rule.version,action.nodeId,ids[i],action.channel,event.occurred_at,action.delay,action,i===1?'Filipino':'English'])
})
test('language targeting preserves Filipino, English and missing-preference behavior',async()=>{
 for(const language of ['Filipino','English']){
  const f=fixture([{user_id:'a',ui_options:{language:'Filipino'}},{user_id:'b',ui_options:{language:'unexpected'}}])
  await plan(f.client,event,rule,{...action,language},['a','b','c'])
  assert.deepEqual(f.inserts.map(row=>row[4]),language==='Filipino'?['a']:['b','c'])
 }
})
test('empty and language-ineligible recipient sets do not insert deliveries',async()=>{
 const f=fixture();await plan(f.client,event,rule,action,[]);assert.equal(f.reads.length,0)
 await plan(f.client,event,rule,{...action,language:'Filipino'},['a']);assert.equal(f.inserts.length,0)
})
test('database failure propagates to the event transaction for rollback and retry',async()=>{
 const error=new Error('fixture database failure')
 await assert.rejects(plan({query:async()=>{throw error}},event,rule,action,['a']),e=>e===error)
})
