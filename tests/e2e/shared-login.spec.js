import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
const require = createRequire(import.meta.url)
const { db, localAuth } = require('../fixtures/service.cjs')
const users = []
const password = 'Fixture!' + crypto.randomUUID()
test.beforeAll(async () => {
  for (const role of ['user', 'admin']) {
    const email = 'shared-role-' + crypto.randomUUID() + '@test.invalid'
    const created = await localAuth('admin/users', 'POST', { email, password, email_confirm: true })
    users.push({ id: created.id, email, role })
    await db.query("update profiles set name=$2,role=$3,status='active' where id=$1", [created.id, role === 'admin' ? 'Shared Role Admin' : 'Shared Role Borrower', role])
  }
})
test.afterAll(async () => {
  try { for (const user of users) { await localAuth('admin/users/' + user.id, 'DELETE'); await db.query('delete from profiles where id=$1', [user.id]) } } finally { await db.end() }
})
async function open(page, url = '/login') {
  await page.goto(url)
  const ui = page.frameLocator('iframe[title="LoanLedger PH · v4.12.24"]')
  await expect(ui.locator('#loginSignIn')).toBeVisible()
  return ui
}
async function submit(ui, user) {
  await ui.locator('#email').fill('  ' + user.email.toUpperCase() + '  ')
  await ui.locator('#password').fill(password)
  await ui.getByRole('button', { name: 'Sign In', exact: true }).click()
}
test('TEST-AUTH-ROLE-001: one sign-in screen opens the correct role from either entry URL', async ({ page }) => {
  test.setTimeout(90000)
  for (const user of users) {
    const ui = await open(page, user.role === 'user' ? '/admin' : '/portal')
    await submit(ui, user)
    await expect(page).toHaveURL(user.role === 'admin' ? /\/admin$/ : /\/portal$/, { timeout: 30000 })
    await expect(page.locator('#authenticatedMatrix')).toHaveCount(0, { timeout: 15000 })
    if (user.role === 'user') {
      await expect(ui.locator('#balance')).toBeVisible()
      expect(await page.locator('.admin-workspace').count()).toBe(0)
    } else {
      await expect(page.getByRole('heading', { name: /Good .*Shared/ })).toBeVisible()
    }
    await page.goto(user.role === 'user' ? '/admin' : '/portal')
    await expect(page).toHaveURL(user.role === 'admin' ? /\/admin$/ : /\/portal$/, { timeout: 30000 })
    await expect(page.locator('#authenticatedMatrix')).toHaveCount(0)
    await page.evaluate(async () => { const { supabase } = await import('/src/supabaseClient.js'); await supabase.auth.signOut({ scope: 'local' }) })
  }
})
test('TEST-AUTH-RETRY-002: invalid credentials leave the shared form usable', async ({ page }) => {
  const ui = await open(page)
  await ui.locator('#email').fill(users[0].email)
  await ui.locator('#password').fill('Incorrect-fixture-password!')
  await ui.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(ui.locator('#loginError')).not.toBeEmpty({ timeout: 24000 })
  await expect(ui.locator('#loginSignIn')).toBeEnabled()
  await submit(ui, users[0])
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30000 })
})
test('TEST-AUTH-RETRY-001: an unresponsive sign-in returns an error and allows a successful retry', async ({ page }) => {
  test.setTimeout(60000)
  let held
  await page.route('**/auth/v1/token?grant_type=password', async route => { held = route; await new Promise(resolve => { page.once('close', resolve) }) })
  const ui = await open(page)
  await submit(ui, users[0])
  await expect(ui.locator('#loginError')).toContainText(/timed out|connection|try again/i, { timeout: 24000 })
  await expect(ui.locator('#loginSignIn')).toBeEnabled()
  expect(held).toBeTruthy()
  await page.unroute('**/auth/v1/token?grant_type=password')
  await submit(ui, users[0])
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30000 })
})
test('TEST-AUTH-RETRY-003: a stalled profile lookup also clears authentication and permits retry', async ({ page }) => {
  test.setTimeout(90000)
  const matcher = '**/rest/v1/profiles?*'
  let profileStarted
  const requested = new Promise(resolve => { profileStarted = resolve })
  await page.route(matcher, async route => {
    if (!new URL(route.request().url()).searchParams.has('id')) return route.continue()
    profileStarted()
    await new Promise(resolve => { page.once('close', resolve) })
  })
  const ui = await open(page)
  await submit(ui, users[0])
  // Start the profile deadline after credential verification has completed.
  await requested
  await expect(ui.locator('#loginError')).toContainText(/account|try.*again/i, { timeout: 24000 })
  await expect(ui.locator('#loginSignIn')).toBeEnabled()
  await page.unroute(matcher)
  await submit(ui, users[0])
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30000 })
})
