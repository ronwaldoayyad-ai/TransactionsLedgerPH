import test from 'node:test'
import assert from 'node:assert/strict'
import {savePendingFee,loadPendingFee,listPendingFees,clearPendingFee} from '../../src/lib/combinedFeeDraft.js'
const actor='00000000-0000-4000-8000-000000000001',borrower='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003'
const store=()=>{const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
const draft=()=>({createdAt:'2026-10-24T00:00:00Z',fingerprint:'reviewed',payload:{key:'00000000-0000-4000-8000-000000000004',borrowerId:borrower,asOfDate:'2026-11-10',sourceDueDates:['2026-07-10'],reviewed:true,selections:[{id:'actual-row'}]},summary:{totalCents:363810}})
test('reviewed request survives navigation/reload with exact original key and payload',()=>{const s=store(),d=draft();savePendingFee(actor,d,s);assert.deepEqual(loadPendingFee(actor,borrower,s).payload,d.payload);assert.equal(listPendingFees(actor,s).length,1);clearPendingFee(actor,borrower,s);assert.equal(loadPendingFee(actor,borrower,s),null)})
test('pending request cannot be shown to another actor or borrower',()=>{const s=store();savePendingFee(actor,draft(),s);assert.equal(loadPendingFee(other,borrower,s),null);assert.equal(loadPendingFee(actor,other,s),null);assert.deepEqual(listPendingFees(other,s),[])})
test('corrupt storage is ignored and unavailable storage blocks a new send',()=>{const s=store();savePendingFee(actor,draft(),s);s.setItem(s.key(0),'{bad');assert.equal(loadPendingFee(actor,borrower,s),null);const bad={setItem(){throw Error('blocked')},getItem(){throw Error('blocked')}};assert.throws(()=>savePendingFee(actor,draft(),bad),e=>e.code==='DRAFT_STORAGE_UNAVAILABLE')})
