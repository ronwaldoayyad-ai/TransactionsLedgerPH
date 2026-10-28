import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
const require = createRequire(import.meta.url)
const { db, localAuth } = require('../fixtures/service.cjs')
let user
const password = 'Fixture!' + crypto.randomUUID()
test.beforeAll(async () => {
  const email = 'admin-refresh-' + crypto.randomUUID() + '@test.invalid'
  const created = await localAuth('admin/users', 'POST', { email, password, email_confirm: true })
  user = { id: created.id, email }
  await db.query("update profiles set name='Admin Refresh Fixture',role='admin',status='active' where id=$1", [user.id])
})
test.afterAll(async () => {
  try { if (user) {
    await db.query('delete from wallet_cards where owner_id=$1', [user.id])
    await localAuth('admin/users/' + user.id, 'DELETE'); await db.query('delete from profiles where id=$1', [user.id])
  } } finally { await db.end() }
})
async function signIn(page) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/login')
  const ui = page.frameLocator('iframe[title="LoanLedger PH · v4.12.24"]')
  await ui.locator('#email').fill(user.email)
  await ui.locator('#password').fill(password)
  await ui.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Good .*Admin/ })).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1500)
}
test('TEST-ADMIN-REFRESH-001: idle and refocus do not reload records; manual refresh loads once', async ({ page }) => {
  await signIn(page)
  const reads = []
  page.on('request', req => { if (req.method() === 'GET' && req.url().includes('/rest/v1/')) reads.push(new URL(req.url()).pathname.split('/').pop()) })
  const origin = await page.evaluate(() => performance.timeOrigin)
  await page.waitForTimeout(12500)
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
  await page.waitForTimeout(1000)
  expect(reads, 'An idle or refocused workspace must not refetch records').toEqual([])
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh records', exact: true })).toBeEnabled()
  expect(reads.filter(x => x === 'tracked_loans')).toHaveLength(1)
  expect(reads.filter(x => x === 'loans')).toHaveLength(1)
  expect(reads.filter(x => x === 'messages')).toHaveLength(1)
  expect(reads.filter(x => x === 'invoices')).toHaveLength(1)
  expect(reads.filter(x => x === 'notification_templates')).toHaveLength(1)
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(origin)
})
test('TEST-ADMIN-DATA-001: Loan Portfolio Dashboard shows every stored tracked loan', async ({ page }) => {
  await signIn(page)
  const count = (await db.query('select count(*)::int n from tracked_loans')).rows[0].n
  expect(count, 'Staging must contain the production tracked-loan copy').toBeGreaterThan(0)
  await page.getByRole('link', { name: 'Loan tracker', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Loan Portfolio Dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete tracked loan', exact: true })).toHaveCount(count)
})

test('TEST-ADMIN-DATA-002: lender wallet renders owned records and keeps production ownership intact', async ({ page }) => {
  await db.query("insert into wallet_cards(owner_id,bank_name,first6,last4,credit_limit,available_limit) values($1,'Verification Bank','123456','9876',10000,10000)", [user.id])
  await signIn(page)
  await page.getByRole('link', { name: 'Cards & bills', exact: true }).click()
  await expect(page.getByText('Verification Bank', { exact: true }).first()).toBeVisible()
  expect((await db.query('select count(*)::int n from wallet_cards where owner_id<>$1', [user.id])).rows[0].n).toBeGreaterThanOrEqual(12)
})
