import {test,expect} from '@playwright/test'
async function fixture(page){
 await page.goto('/borrower-v4.12.24.html')
 await page.waitForFunction(()=>typeof decorateBorrowerActivityLinks==='function')
 await page.evaluate(()=>{
  document.body.inert=false;document.body.removeAttribute('data-integration-loading')
  stagingData={user:{id:'activity-owner',name:'Activity Test',email:'fixture@test.invalid',creditBalance:0},transactions:[{id:'activity-installment',loanId:'activity-loan',description:'Fixture installment',type:'Installment',status:'paid',amount:500,txnDate:'2026-10-01',datePaid:'2026-11-01',dueDate:'2026-11-01',n:1}],loans:[{id:'activity-loan',label:'Fixture loan',principal:1000,durationMonths:2,txnDate:'2026-10-01',monthlyRate:0,firstPaymentDate:'2026-11-01',dst:0,processingFee:0,notarialFee:0}],payments:[{id:'activity-proof',userId:'activity-owner',status:'approved',amount:500,reference:'TEST-REF',submittedAt:'2026-11-02T00:00:00Z',paidDate:'2026-11-02',method:'gcash',fileType:'image',fileName:'fixture.png',receiptNumber:'AR-TEST',allocations:[]}],overrides:[],messages:[],requests:[],notifications:[],disbursements:[],invoices:[],statements:[],tickets:[],preferences:{},paymentAdjustments:[]}
  recentPayments=stagingData.payments.map(p=>({...mobilePaymentRecord(p),acknowledgement:stagingAcknowledgement(p)}));page='dashboard';render()
 })
}
test('proof activity in Dashboard and History opens the exact Recent Payments card with all document actions',async({page})=>{
 await fixture(page)
 for(const screen of ['dashboard','history']){
  await page.evaluate(screen=>go(screen),screen)
  const item=page.locator('[data-payment-proof-id="activity-proof"]');await expect(item).toHaveAttribute('role','button')
  if(screen==='history')await item.press('Enter');else await item.click()
  const card=page.locator('.activity-payment-target');await expect(card).toBeFocused();await expect(card).toContainText('TEST-REF')
  for(const name of ['Proof','Receipt','Confirmation'])await expect(card.getByRole('button',{name:new RegExp(name,'i')}).first()).toBeVisible()
 }
})
test('installment activity opens its own Loan Schedule with keyboard activation',async({page})=>{
 await fixture(page);await page.locator('[data-staging-transaction-id="activity-installment"]').press(' ')
 await expect(page.locator('#app')).toContainText('Fixture loan');await expect(page.locator('#app')).toContainText('Installment Schedule')
})
test('fan brand line and description share the same center across phone sizes',async({page})=>{
 await fixture(page)
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.locator('#nav button[data-page="payment"]').click();await expect(page.locator('#paymentFanDialog')).toHaveAttribute('data-phase','open')
  const alignment=await page.locator('.payment-fan-brand').evaluate(el=>{const a=el.firstElementChild.getBoundingClientRect(),b=el.querySelector('p').getBoundingClientRect(),img=el.querySelector('img').getBoundingClientRect(),text=el.querySelector('strong').getBoundingClientRect();return {center:Math.abs(a.left+a.width/2-b.left-b.width/2),vertical:Math.abs(img.top+img.height/2-text.top-text.height/2)}})
  expect(alignment.center).toBeLessThan(1);expect(alignment.vertical).toBeLessThan(1)
  await page.locator('.payment-fan-close').click();await expect(page.locator('#paymentFanDialog')).not.toBeVisible()
 }
})
