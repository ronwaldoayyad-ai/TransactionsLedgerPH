import {test,expect} from '@playwright/test'
import {createRequire} from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const require=createRequire(import.meta.url)
const {db,localAuth}=require('../fixtures/service.cjs')
let user
const password='Fixture!'+crypto.randomUUID()
test.beforeAll(async()=>{const email='confirmation-'+crypto.randomUUID()+'@test.invalid';const result=await localAuth('admin/users','POST',{email,password,email_confirm:true});user={id:result.id,email};await db.query("update profiles set name='Confirmation Verification',role='user',status='active' where id=$1",[user.id])})
test.afterAll(async()=>{try{if(user){await localAuth('admin/users/'+user.id,'DELETE');await db.query('delete from profiles where id=$1',[user.id])}}finally{await db.end()}})
async function payment(page,ocr=false,total=18946.07){
 await page.goto('/login');const iframe=page.locator('iframe[title="LoanLedger PH · v4.12.24"]');await iframe.waitFor();const ui=await(await iframe.elementHandle()).contentFrame();await ui.waitForFunction(()=>!document.body.inert&&typeof showPaymentConfirmation==='function')
 await ui.locator('#email').fill(user.email);await ui.locator('#password').fill(password);await ui.getByRole('button',{name:/Sign In/i}).click();await ui.waitForFunction(id=>stagingData?.user.id===id,user.id)
 await ui.evaluate(({ocr,total})=>{
  borrowerPayableRecords=()=>[['Selected installment','Installment balance',total,'2026-10-12','confirmation-fixture-item']]
  extractProofText=async()=>{if(!ocr)throw Error('Manual entry fixture');return 'GCash\nAmount paid PHP 18,946.07\nOctober 12, 2026\nReference No. 2026101234567890'}
  go('payment')
 },{ocr,total})
 await ui.locator('#paymentDateToggle').press('Enter');await ui.locator('.due-pill[data-key]').first().click();await ui.locator('#allocationConfirm').check()
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZgFAAAAAASUVORK5CYII=','base64')
 await ui.locator('#proof').setInputFiles({name:'confirmation-fixture.png',mimeType:'image/png',buffer:image});await ui.waitForFunction(()=>!proofScanBusy&&!!file)
 if(!ocr){await ui.locator('#amount').fill(String(total));await ui.locator('#date').fill('2026-10-12');await ui.locator('#paymentMethod').selectOption('GCASH');await ui.locator('#ref').fill('Manual-confirmation-123')}
 return ui
}
async function mockSubmission(ui,fail=false){await ui.evaluate(fail=>{
 window.confirmationSubmitCalls=0
 mobileCall=async(action,payload)=>{if(action!=='payment-submit')throw Error('Unexpected fixture action');confirmationSubmitCalls++;return new Promise((resolve,reject)=>{window.confirmationResolve=()=>fail?reject(Error('The proof could not be saved.')):resolve({id:'confirmation-fixture-payment',user_id:stagingData.user.id,amount:payload.amount,paid_date:payload.paidDate,submitted_at:'2026-10-14T03:47:00Z',reference:payload.reference,method:payload.method,status:'pending',file_type:'image',file_name:payload.file.name,requested_allocations:[{id:'confirmation-fixture-item',title:'Selected installment',amount:borrowerPayableRecords()[0][2],dueDate:'2026-10-12'}],receipt_number:'AR-confirmation-fixture',submission_notes:payload.notes})})}
 },fail)}
test('OCR submission waits for save, then shows captured values and exports PNG',async({page},info)=>{
 const ui=await payment(page,true);await expect(ui.locator('#amount')).toHaveValue('18946.07');await expect(ui.locator('#ref')).toHaveValue('2026101234567890');await mockSubmission(ui)
 await ui.locator('#submitPayment').click();await ui.waitForFunction(()=>typeof confirmationResolve==='function');await expect(ui.locator('#taskLoadingCard')).toContainText('Submitting payment proof');await expect(ui.locator('#paymentConfirmationDialog')).toHaveCount(0);await expect(ui.locator('#submitPayment')).toBeDisabled()
 await expect(ui.locator('#amount')).toBeDisabled();await expect(ui.locator('#amount')).toHaveValue('18946.07');await expect(ui.locator('#submitPayment')).toBeDisabled();await ui.evaluate(()=>submitproof());expect(await ui.evaluate(()=>confirmationSubmitCalls)).toBe(1)
 await ui.evaluate(()=>confirmationResolve());await expect(ui.locator('#paymentConfirmationDialog')).toBeVisible();await expect(ui.locator('.payment-confirmation-amount')).toContainText('18,946.07');await expect(ui.locator('[data-confirmation="reference"]')).toHaveText('2026101234567890');await expect(ui.locator('[data-confirmation="date"]')).toContainText('Oct 12, 2026');await expect(ui.locator('.payment-confirmation-status')).toHaveText('Submitted for review');await expect(ui.locator('.payment-confirmation-coverage')).toContainText('Fully covered');await expect(ui.locator('.payment-confirmation-difference')).toHaveText('PHP 0.00');await expect(ui.locator('#taskLoadingCard')).toHaveCount(0);await expect(ui.locator('#paymentConfirmationDialog')).not.toContainText('RONWALDO');await expect(ui.locator('#submitPayment')).toBeDisabled()
 const pending=page.waitForEvent('download');await ui.getByRole('button',{name:'Save Image',exact:true}).click();const file=await pending;expect(await file.failure()).toBeNull();const dir=path.resolve(process.env.CONFIRMATION_EVIDENCE_DIR||'test-results/payment-confirmation');fs.mkdirSync(dir,{recursive:true});const output=path.join(dir,info.project.name+'-confirmation.png');await file.saveAs(output);const bytes=fs.readFileSync(output);expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1080);await expect(ui.locator('.download-result-toast')).toBeVisible();await page.screenshot({path:path.join(dir,info.project.name+'-modal.png')})
})
test('Manual failures retain the draft and partial/excess amounts remain pending',async({page})=>{
 const ui=await payment(page,false,100);await mockSubmission(ui,true);await ui.locator('#submitPayment').click();await ui.waitForFunction(()=>typeof confirmationResolve==='function');await ui.evaluate(()=>confirmationResolve());await expect(ui.locator('#paymentError')).toContainText('could not be saved');await expect(ui.locator('#amount')).toHaveValue('100');await expect(ui.locator('#ref')).toHaveValue('Manual-confirmation-123');await expect(ui.locator('#paymentConfirmationDialog')).toHaveCount(0);await expect(ui.locator('#taskLoadingCard')).toHaveCount(0);await expect(ui.locator('#submitPayment')).toBeEnabled()
 await mockSubmission(ui);await ui.locator('#amount').fill('75.5');await ui.locator('#submitPayment').click();await ui.waitForFunction(()=>confirmationSubmitCalls===1&&typeof confirmationResolve==='function');await ui.evaluate(()=>confirmationResolve());await expect(ui.locator('.payment-confirmation-coverage')).toHaveText('Partially covered');await expect(ui.locator('.payment-confirmation-difference')).toHaveText('PHP 24.50');await expect(ui.locator('.payment-confirmation-status')).toHaveText('Submitted for review');await ui.locator('.payment-confirmation-close').click()
 await ui.evaluate(()=>showPaymentConfirmation({id:'excess-fixture',amount:125,paidDate:'2026-10-12',reference:'Excess fixture',method:'gcash',allocations:[{amount:100}]}));await expect(ui.locator('.payment-confirmation-coverage')).toHaveText('Excess submitted');await expect(ui.locator('.payment-confirmation-difference')).toHaveText('PHP 25.00');await expect(ui.locator('#paymentConfirmationDialog')).not.toContainText('Fully settled')
})
test('Share keeps user activation, escapes text and clears account-scoped state',async({page})=>{
 const ui=await payment(page,false);await page.emulateMedia({reducedMotion:'reduce'});await ui.evaluate(()=>showPaymentConfirmation({id:'share-fixture',amount:100,paidDate:'2026-10-12',reference:'<img src=x onerror="window.confirmationXSS=true">',method:'bank_transfer',allocations:[{amount:100}]}));await expect(ui.locator('.payment-confirmation-reference')).toContainText('<img');expect(await ui.locator('#paymentConfirmationDialog img').count()).toBe(0);expect(await ui.evaluate(()=>!!window.confirmationXSS)).toBeFalsy();await expect(ui.locator('#paymentConfirmationDialog')).toHaveCSS('animation-name','none')
 await ui.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:data=>{window.confirmationShared={name:data.files[0].name,type:data.files[0].type,size:data.files[0].size};return Promise.resolve()}})})
 await ui.getByRole('button',{name:'Share',exact:true}).click();const shared=await ui.evaluate(()=>confirmationShared);expect(shared.type).toBe('image/png');expect(shared.size).toBeGreaterThan(1000);await expect(ui.getByRole('button',{name:'Share',exact:true})).toBeEnabled()
 await expect(page.locator('iframe[title="LoanLedger PH · v4.12.24"]')).toHaveAttribute('allow','web-share')
 await ui.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});downloadAppFile=async(source,name,type)=>{const blob=await source();window.confirmationShareFallback={name,type,size:blob.size};return true}})
 await ui.getByRole('button',{name:'Share',exact:true}).click();expect((await ui.evaluate(()=>confirmationShareFallback)).type).toBe('image/png');await expect(ui.locator('.download-result-toast')).toContainText('Share it from your device')
 await page.setViewportSize({width:320,height:640});expect(await ui.locator('#paymentConfirmationDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();await ui.locator('.payment-confirmation-close').press('Escape');await expect(ui.locator('#paymentConfirmationDialog')).toHaveCount(0)
 await ui.evaluate(async()=>{await showPaymentConfirmation({id:'owner-fixture',amount:100,reference:'Private fixture'});stagingData=null;render()});await expect(ui.locator('#paymentConfirmationDialog')).toHaveCount(0);expect(await ui.evaluate(()=>paymentConfirmationState)).toBeNull()
})
