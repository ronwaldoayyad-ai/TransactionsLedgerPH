import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBillTrackerModel, defaultBillMonth } from '../../src/lib/billPresentation.js'

const bill = (id, dueDate, amountDue = 1000) => ({ id, cardId: 'card', dueDate, amountDue })
const payment = (billId, amount, paidOn = '2026-10-29') => ({ id: billId + '-' + amount, billId, amount, paidOn })

test('status totals use unpaid balances and actual payments on settled bills', () => {
  const model = buildBillTrackerModel([bill('today', '2026-10-29'), bill('late', '2026-10-10'), bill('settled', '2026-09-10')], [payment('today', 250), payment('late', 400), payment('settled', 600), payment('settled', 500), payment('other', 9999)], '2026-10-29')
  assert.deepEqual(model.summary.pending, { count: 1, billed: 1000, paid: 250, remaining: 750, amount: 750 })
  assert.deepEqual(model.summary.past_due, { count: 1, billed: 1000, paid: 400, remaining: 600, amount: 600 })
  assert.deepEqual(model.summary.paid, { count: 1, billed: 1000, paid: 1100, remaining: 0, amount: 1100 })
})

test('paid bills stay in their due month even when paid over several other months', () => {
  const model = buildBillTrackerModel([bill('settled', '2026-09-10')], [payment('settled', 100, '2026-08-01'), payment('settled', 900, '2026-11-01')], '2026-12-01')
  assert.equal(model.groups.paid[0].key, '2026-09')
  assert.equal(model.groups.paid[0].rows[0].lastPaid.paidOn, '2026-11-01')
  assert.equal(model.groups.paid[0].summary.amount, 1000)
})

test('months separate years and category totals equal summed monthly amounts without floating drift', () => {
  const model = buildBillTrackerModel([bill('a', '2026-12-10', .1), bill('b', '2026-12-20', .2), bill('c', '2027-12-10', .3)], [], '2026-10-29')
  assert.deepEqual(model.groups.pending.map(g => g.key), ['2026-12', '2027-12'])
  assert.equal(model.groups.pending[0].summary.amount, .3)
  assert.equal(model.summary.pending.amount, .6)
  assert.equal(model.groups.pending.reduce((sum, g) => sum + Math.round(g.summary.amount * 100), 0), 60)
})

test('default open month prefers current then nearest due month, with deterministic ties', () => {
  const groups = ['2027-01', '2026-09', '2026-11'].map(key => ({ key }))
  assert.equal(defaultBillMonth([...groups, { key: '2026-10' }], '2026-10-29'), '2026-10')
  assert.equal(defaultBillMonth(groups, '2026-10-29'), '2026-09')
  assert.equal(defaultBillMonth([{ key: '2027-01' }, { key: '2026-09' }], '2026-12-01'), '2027-01')
  assert.equal(defaultBillMonth([], '2026-10-29'), undefined)
})

test('presentation never mutates bill or payment inputs and handles empty/unassigned dates', () => {
  const bills = Object.freeze([Object.freeze(bill('z', '2026-11-10')), Object.freeze(bill('a', '2026-11-10')), Object.freeze(bill('missing', null))])
  const payments = Object.freeze([Object.freeze(payment('z', 100))])
  const before = JSON.stringify({ bills, payments })
  const model = buildBillTrackerModel(bills, payments, '2026-10-29')
  assert.deepEqual(model.groups.pending[0].rows.map(r => r.id), ['a', 'z'])
  assert.equal(model.groups.pending[1].key, 'undated')
  assert.equal(defaultBillMonth(model.groups.pending, '2026-10-29'), '2026-11')
  assert.equal(JSON.stringify({ bills, payments }), before)
  assert.deepEqual(buildBillTrackerModel([], [], '2026-10-29').summary.paid, { count: 0, billed: 0, paid: 0, remaining: 0, amount: 0 })
})

test('a newly recorded settlement moves the bill and its totals without altering its due month', () => {
  const bills = [bill('bill', '2026-11-10')]
  const before = buildBillTrackerModel(bills, [payment('bill', 200)], '2026-10-29')
  const after = buildBillTrackerModel(bills, [payment('bill', 200), payment('bill', 800)], '2026-10-29')
  assert.equal(before.summary.pending.amount, 800)
  assert.equal(after.summary.pending.amount, 0)
  assert.equal(after.summary.paid.amount, 1000)
  assert.equal(after.groups.paid[0].key, '2026-11')
})
