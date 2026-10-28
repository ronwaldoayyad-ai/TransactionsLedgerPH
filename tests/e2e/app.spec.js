import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const { db, localAuth } = require('../fixtures/service.cjs')
let user
const password = 'Fixture!' + crypto.randomUUID()
test.beforeAll(async () => {
  const email = 'pw-' + crypto.randomUUID() + '@test.invalid'
  const result = await localAuth('admin/users', 'POST', { email, password, email_confirm: true })
  user = { id: result.id, email }
  await db.query("update profiles set name='Browser Verification',role='user',status='active' where id=$1", [user.id])
})
test.afterAll(async () => {
  try { if (user) { await localAuth('admin/users/' + user.id, 'DELETE'); await db.query('delete from profiles where id=$1', [user.id]) } } finally { await db.end() }
})
async function frame(page) {
  await page.goto('/login')
  const iframe = page.locator('iframe[title="LoanLedger PH · v4.12.24"]')
  await iframe.waitFor()
  const ui = await (await iframe.elementHandle()).contentFrame()
  await ui.waitForFunction(() => document.body && !document.body.inert && typeof openTransferAccounts === 'function')
  return ui
}
async function signIn(page) {
  const ui = await frame(page)
  await ui.locator('#email').fill(user.email)
  await ui.locator('#password').fill(password)
  await ui.getByRole('button', { name: /Sign In/i }).click()
  await ui.waitForFunction(id => stagingData?.user.id === id, user.id)
  return ui
}
test('Guest login, legal pages, FAQ and compact input', async ({ page }) => {
  const ui = await frame(page)
  await ui.locator('#email').fill('invalid')
  await expect(ui.locator('#loginSignIn')).toBeDisabled()
  for (const screen of ['privacy', 'terms', 'support', 'faq']) {
    await ui.evaluate(screen => go(screen), screen)
    await expect(ui.locator('#app')).not.toBeEmpty()
  }
  await ui.locator('#faqSearch').fill('payment')
  await expect(ui.locator('#faqResults')).toContainText(/payment/i)
  await expect(ui.locator('#pawQuestion')).toHaveCSS('font-size', '12px')
  await expect(ui.locator('#pawUseAI')).toBeDisabled()
})
test('Signed-in screens, default AI choice and separate Messages modes', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const ui = await signIn(page)
  for (const screen of ['dashboard', 'transactions', 'installment', 'payment', 'history', 'notifications', 'messages', 'loan', 'invoices', 'disbursements', 'profile', 'personalInfo', 'changePassword', 'notificationSettings', 'languageSettings', 'support', 'faq', 'privacy', 'terms', 'about', 'more']) {
    await ui.evaluate(screen => go(screen), screen)
    await expect(ui.locator('#app')).not.toBeEmpty()
    await expect(ui.locator('#app')).not.toContainText('This screen could not be loaded')
  }
  await ui.evaluate(() => { go('messages'); setPawMessagesMode('assistant') })
  await expect(ui.locator('#pawUseAI')).toBeChecked()
  await ui.locator('#pawUseAI').uncheck()
  await ui.locator('#pawQuestion').fill('Unsent assistant question')
  await ui.getByRole('button', { name: 'Message lender', exact: true }).first().click()
  await ui.locator('#chatDraft').fill('Unsent lender message')
  await ui.getByRole('button', { name: 'Ask Pawcheebels', exact: true }).click()
  await expect(ui.locator('#pawQuestion')).toHaveValue('Unsent assistant question')
  await expect(ui.locator('#pawUseAI')).not.toBeChecked()
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await ui.locator('#app').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy()
  expect(errors).toEqual([])
})
test('Every transfer destination downloads its verified bank QR', async ({ page }, testInfo) => {
  test.setTimeout(120000)
  const ui = await signIn(page)
  const banks = ['maribank', 'bpi', 'security', 'bdo', 'gcash']
  for (let index = 0; index < banks.length; index++) {
    await ui.locator('[data-transfer-bank="' + banks[index] + '"]').click()
    await expect(ui.locator('.transfer-card.active')).toHaveAttribute('data-bank', banks[index])
    expect(await ui.locator('.transfer-card.active .transfer-bank-label').count()).toBe(banks[index] === 'gcash' ? 1 : 0)
    await ui.locator('.transfer-card.active .transfer-qr').evaluate(img => img.decode())
    const pending = page.waitForEvent('download')
    await ui.locator('.transfer-save').click()
    const file = await pending
    expect(await file.failure()).toBeNull()
    const dir = path.resolve(process.env.QR_VERIFICATION_DIR || 'test-results/qr-scan/downloads')
    fs.mkdirSync(dir, { recursive: true })
    await file.saveAs(path.join(dir, testInfo.project.name + '-' + banks[index] + '.png'))
    await expect(ui.locator('.download-result-toast')).toBeVisible()
    await ui.locator('.transfer-close').click()
  }
  await ui.locator('[data-transfer-bank="gcash"]').click()
  expect(await ui.locator('.transfer-card.active .transfer-logo img').evaluate(img => getComputedStyle(img).objectPosition)).toContain('0%')
  await ui.locator('.transfer-stage').focus()
  await ui.locator('.transfer-stage').press('ArrowRight')
  await expect(ui.locator('.transfer-card.active')).toHaveAttribute('data-bank', 'maribank')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(ui.locator('.transfer-card.active')).toHaveCSS('transition-duration', '0s')
  await ui.locator('.transfer-close').press('Escape')
  await expect(ui.locator('#transferAccountsDialog')).toHaveCount(0)
})
test('Pawcheebels uses the pop-up space without horizontal scrolling', async ({ page }, testInfo) => {
  const ui = await signIn(page)
  await ui.evaluate(() => { go('dashboard'); pawMode='assistant'; pawHistory=[{role:'assistant',text:'A readable assistant message. '.repeat(35),mode:'ai'}]; chatWidgetOpen=true; render(); document.querySelector('.chat-widget-panel').style.height='550px' })
  const log = ui.locator('#chatWidgetMount .paw-conversation')
  await expect(log).toHaveCSS('max-height','none')
  expect(await log.evaluate(el=>el.clientHeight)).toBeGreaterThan(200)
  expect(await ui.locator('.paw-widget-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
  expect(await ui.locator('.paw-composer').evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('.chat-widget-panel').getBoundingClientRect().bottom)).toBeTruthy()
  await page.screenshot({path:testInfo.outputPath('chat-space.png')})
  await ui.locator('.chat-widget-panel').evaluate(el=>el.style.height='320px')
  await expect(ui.locator('#chatWidgetMount .paw-intro')).toBeHidden()
  await expect(ui.locator('#chatWidgetMount #pawQuestion')).toBeVisible()
})

test('Both chat destinations share the animated composer and compact text', async ({ page }) => {
  const ui = await signIn(page)
  for (const surface of ['messages', 'popup']) {
    await ui.evaluate(surface => {
      go(surface === 'messages' ? 'messages' : 'dashboard')
      if (surface === 'messages') setPawMessagesMode('lender')
      else { pawMode='lender'; chatWidgetOpen=true; render() }
    }, surface)
    const host = surface === 'popup' ? '#chatWidgetMount' : '#app'
    const lender = ui.locator(host + ' .chat-composer')
    await expect(lender).toBeVisible()
    const size = await lender.evaluate(el => ({width:el.offsetWidth,height:el.offsetHeight}))
    const border = await lender.evaluate(el => getComputedStyle(el, '::before').animationName)
    expect(border).toBe('finderBorderOrbit')
    await expect(ui.locator(host + ' #chatDraft')).toHaveCSS('font-size', '12px')
    await ui.evaluate(surface => surface === 'messages' ? setPawMessagesMode('assistant') : setPawMode('assistant'), surface)
    const assistant = ui.locator(host + ' .paw-composer')
    await expect(assistant).toBeVisible()
    const assistantSize = await assistant.evaluate(el => ({width:el.offsetWidth,height:el.offsetHeight}))
    expect(Math.abs(assistantSize.height - size.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(assistantSize.width - size.width)).toBeLessThanOrEqual(1)
    expect(await assistant.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe(border)
    await expect(ui.locator(host + ' #pawQuestion')).toHaveCSS('font-size', '12px')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await assistant.evaluate(el => getComputedStyle(el, '::before').animationName)).toBe('none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
})

test('Receiving accounts folds toward its trigger and respects reduced motion', async ({ page }) => {
  const ui = await signIn(page)
  await ui.locator('.transfer-view').click()
  expect(await ui.locator('#transferAccountsDialog').evaluate(el => el.transferAnimation.effect.target.classList.contains('transfer-dialog-shell'))).toBeTruthy()
  const stable = await ui.locator('#transferAccountsDialog').evaluate(async el => {
    const initial={x:el.offsetLeft,y:el.offsetTop,w:el.offsetWidth,h:el.offsetHeight}
    let moved=false
    while(el.transferAnimation.playState==='running') {
      await new Promise(requestAnimationFrame)
      if(el.offsetLeft!==initial.x||el.offsetTop!==initial.y||el.offsetWidth!==initial.w||el.offsetHeight!==initial.h)moved=true
    }
    return !moved
  })
  expect(stable).toBeTruthy()
  expect(await ui.locator('#transferAccountsDialog').evaluate(el => el.transferAnimation.effect.getTiming().direction)).toBe('normal')
  await ui.locator('.transfer-close').click()
  await expect(ui.locator('#transferAccountsDialog')).toHaveCount(0)
  await expect(ui.locator('.transfer-view')).toBeFocused()
  const reversal = await ui.evaluate(async () => {
    openTransferAccounts('bpi')
    const dialog=transferDialog
    const animation=dialog.transferAnimation
    animation.currentTime=120
    closeTransferAccounts()
    await animation.ready
    return {same:animation===dialog.transferAnimation,reverse:animation.playbackRate<0}
  })
  expect(reversal).toEqual({same:true,reverse:true})
  await expect(ui.locator('#transferAccountsDialog')).toHaveCount(0)
  await ui.locator('.transfer-view').click()
  await ui.evaluate(() => go('messages'))
  await expect(ui.locator('#transferAccountsDialog')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ui.evaluate(() => { go('dashboard'); openTransferAccounts('gcash') })
  expect(await ui.locator('#transferAccountsDialog').evaluate(el => !el.transferAnimation)).toBeTruthy()
  await ui.locator('.transfer-close').press('Escape')
  await expect(ui.locator('#transferAccountsDialog')).toHaveCount(0)
})
