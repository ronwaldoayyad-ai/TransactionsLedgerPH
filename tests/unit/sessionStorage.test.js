import test from 'node:test'
import assert from 'node:assert/strict'
import {sessionStorageKey,migrateSessionStorage} from '../../src/lib/sessionStorage.js'
const endpoint='https://example.supabase.co',key=sessionStorageKey(endpoint,'production')
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
function value(iss=endpoint+'/auth/v1'){return JSON.stringify({access_token:'x.'+btoa(JSON.stringify({iss}))+'.x',refresh_token:'fixture'})}
test('hosted key matches Classic Supabase default; local stays isolated',()=>{
 assert.equal(key,'sb-example-auth-token');assert.equal(sessionStorageKey(endpoint,'local'),'loanledger-local-auth')
})
test('migration preserves remember=false and never overwrites a current session',()=>{
 const local=store(),session=store();local.setItem('loanledger-production-auth-remember','false');session.setItem('loanledger-production-auth',value())
 assert.equal(migrateSessionStorage({local,session,endpoint,environment:'production',key}),true)
 assert.equal(local.getItem(key),null);assert.ok(session.getItem(key));assert.equal(session.getItem('loanledger-production-auth'),null)
 session.setItem('loanledger-production-auth',value());assert.equal(migrateSessionStorage({local,session,endpoint,environment:'production',key}),false)
})
test('another Supabase project and malformed legacy values are never imported',()=>{
 for(const legacy of [value('https://other.supabase.co/auth/v1'),'invalid']){
  const local=store(),session=store();local.setItem('loanledger-production-auth',legacy)
  assert.equal(migrateSessionStorage({local,session,endpoint,environment:'production',key}),false);assert.equal(local.getItem(key),null)
 }
})
