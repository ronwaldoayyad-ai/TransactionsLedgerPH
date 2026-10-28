import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const source=readFileSync(new URL('../../src/context/AppContext.jsx',import.meta.url),'utf8')
function harness(error,role='admin'){const updates=[],rows=[{id:'row',amount:100,status:'unpaid'}],ctx={session:{user:{role}},transactions:rows,isLive:true,supabase:{from:()=>({update:()=>({in:async()=>({error})})})},toISODate:()=> '2026-10-28',reportDbError:()=>updates.push('error'),setArchivedTransactions:()=>updates.push('archive'),setTransactions:()=>updates.push('remove'),log:()=>updates.push('log'),actor:'fixture'};const body=source.match(/const archiveTransactions = useCallback\(\s*(async \(ids\) => \{[\s\S]*?)\n {4}\},\n {4}\[isLive, log, actor, transactions, session\]/);assert.ok(body);return {run:vm.runInNewContext('('+body[1]+'\n})',ctx),updates};}
test('failed archive writes leave records visible and do not record a successful archive',async()=>{const h=harness({message:'fixture failure'});assert.equal(await h.run(['row']),false);assert.deepEqual(h.updates,['error']);});
test('successful archive writes update the view only after persistence succeeds',async()=>{const h=harness(null);assert.equal(await h.run(['row']),true);assert.deepEqual(h.updates,['archive','remove','log']);});
test('borrowers cannot initiate admin archiving even before the database policy check',async()=>{const h=harness(null,'user');assert.equal(await h.run(['row']),false);assert.deepEqual(h.updates,[]);});

