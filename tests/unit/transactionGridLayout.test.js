import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {clampColumnWidth,gridLayoutKey,moveGridColumn,normalizeGridLayout,readGridLayout,TRANSACTION_GRID_COLUMNS,writeGridLayout} from '../../src/lib/transactionGridLayout.js'
const keys=TRANSACTION_GRID_COLUMNS.map(column=>column.key)
test('grid restores only known unique columns and clamps saved widths',()=>{
  const layout=normalizeGridLayout({order:['status','status','unknown','amount'],widths:{amount:-3,status:10000,type:'broken',borrower:170.4}})
  assert.deepEqual(layout.order,['status','amount',...keys.filter(key=>!['status','amount'].includes(key))]);assert.equal(new Set(layout.order).size,8)
  assert.equal(layout.widths.amount,116);assert.equal(layout.widths.status,800);assert.equal(layout.widths.type,130);assert.equal(layout.widths.borrower,170)
  assert.equal(clampColumnWidth('description',600),600);assert.throws(()=>clampColumnWidth('unknown',600))
})
test('reordering moves column keys without changing widths or transaction values',()=>{
  const original=normalizeGridLayout(null),next=moveGridColumn(original,'description','borrower')
  assert.deepEqual(next.order.slice(0,3),['description','borrower','txnDate']);assert.deepEqual(original.order,keys);assert.deepEqual(next.widths,original.widths)
  assert.deepEqual(moveGridColumn(original,'unknown','amount'),original);assert.deepEqual(moveGridColumn(original,'amount','amount'),original)
})
test('column layout persists per account, handles corrupt versions and blocked storage',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},one=gridLayoutKey('one'),two=gridLayoutKey('two')
  const layout=moveGridColumn(normalizeGridLayout(null),'status','borrower');layout.widths.description=550
  assert.equal(writeGridLayout(storage,one,layout),true);assert.equal(readGridLayout(storage,one).widths.description,550);assert.deepEqual(readGridLayout(storage,two).order,keys)
  values.set(one,'broken JSON');assert.deepEqual(readGridLayout(storage,one).order,keys)
  values.set(one,JSON.stringify({...layout,version:99}));assert.deepEqual(readGridLayout(storage,one).order,keys)
  assert.deepEqual(readGridLayout(null,one).order,keys);assert.equal(writeGridLayout(null,one,layout),false)
})
test('grid keeps header and row order aligned, uses bounded resize handles and keyboard alternatives',()=>{
  const source=readFileSync('src/components/admin/TransactionGrid.jsx','utf8')
  assert.match(source,/layout\.order\.map\(key=><td/);assert.match(source,/layout\.order\.map\(key=>\{const column/)
  assert.match(source,/setPointerCapture/);assert.match(source,/onPointerCancel/);assert.match(source,/onLostPointerCapture/);assert.match(source,/requestAnimationFrame/)
  assert.match(source,/role="separator" tabIndex=\{0\}/);assert.match(source,/event\.altKey/);assert.match(source,/onDrop=/);assert.match(source,/commitLayout\(normalizeGridLayout\(null\)\)/)
  assert.doesNotMatch(source,/setInterval|supabase|fetch\(/)
})
test('borrower login styles no longer strip ordinary field borders or keyboard outlines',()=>{
  const css=readFileSync('public/v41224-login.css','utf8')
  assert.doesNotMatch(css,/(?:^|\n)input:not\([^\n]*border:0!important/)
  assert.doesNotMatch(css,/html body #app [^\n]*border:0!important/)
  assert.match(css,/\.settings-form \.field input:disabled\{border-color:var\(--line\)/)
  assert.match(css,/\.login-field-control input,\.support-input-control input,\.notification-search input/)
  assert.match(css,/\.field input:focus-visible,\.field textarea:focus-visible/)
  const grid=readFileSync('src/components/admin/TransactionGrid.css','utf8');assert.match(grid,/\.tg-cell input:focus,\.tg-cell select:focus/)
})
