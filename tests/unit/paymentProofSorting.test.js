import test from 'node:test';
import assert from 'node:assert/strict';
import {sortPaymentProofs} from '../../src/lib/paymentProofSorting.js';
const users=[{id:'a',name:'Ana'},{id:'z',name:'Zoe'}],rows=[{id:'old',userId:'z',submittedAt:'2026-10-20T09:00:00+08:00',amount:500},{id:'new',userId:'a',submittedAt:'2026-10-20T02:00:00Z',amount:100},{id:'bad',userId:'a',submittedAt:null,amount:200}];
test('proof date sorting uses actual timestamps, puts missing dates last, and preserves saved records',()=>{const before=JSON.stringify(rows);assert.deepEqual(sortPaymentProofs(rows,users).map(r=>r.id),['new','old','bad']);assert.deepEqual(sortPaymentProofs(rows,users,'date','asc').map(r=>r.id),['old','new','bad']);assert.equal(JSON.stringify(rows),before);});
test('proof sorting supports borrower A–Z/Z–A and amount without mixing pagination into order',()=>{assert.deepEqual(sortPaymentProofs(rows,users,'borrower','asc').map(r=>r.id),['new','bad','old']);assert.deepEqual(sortPaymentProofs(rows,users,'borrower','desc').map(r=>r.id),['old','new','bad']);assert.deepEqual(sortPaymentProofs(rows,users,'amount','asc').map(r=>r.id),['new','bad','old']);});
