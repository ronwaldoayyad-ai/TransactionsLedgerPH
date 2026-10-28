import {test,expect} from '@playwright/test'
import {createRequire} from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
const require=createRequire(import.meta.url)
const {db,localAuth}=require('../fixtures/service.cjs')
let user
const password='Fixture!'+crypto.randomUUID()
test.beforeAll(async()=>{const email='continuity-'+crypto.randomUUID()+'@test.invalid';const created=await localAuth('admin/users','POST',{email,password,email_confirm:true});user={id:created.id,email};await db.query("update profiles set name='Session Continuity',role='user',status='active' where id=$1",[user.id])})
test.afterAll(async()=>{try{if(user){await localAuth('admin/users/'+user.id,'DELETE');await db.query('delete from profiles where id=$1',[user.id])}}finally{await db.end()}})
async function open(page){await page.goto('/login');const iframe=page.locator('iframe[title="LoanLedger PH · v4.12.24"]');await iframe.waitFor();const ui=await(await iframe.elementHandle()).contentFrame();await ui.waitForFunction(()=>!document.body.inert&&!!document.querySelector('#email'));return ui}
test('Validation has room above the password field at narrow widths',async({page},info)=>{
 const ui=await open(page)
 expect(await ui.evaluate(()=>document.querySelector('#email').closest('.login-field-control').getBoundingClientRect().top-document.querySelector('.login-methods').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(24)
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await ui.locator('#email').fill('valid@example.com');await expect(ui.locator('#loginEmailFeedback')).toHaveText('Email format looks valid.')
  const gap=()=>ui.evaluate(()=>document.querySelector('#password').closest('.login-field-control').getBoundingClientRect().top-document.querySelector('#loginEmailFeedback').getBoundingClientRect().bottom)
  expect(await gap()).toBeGreaterThanOrEqual(17)
  await ui.locator('#email').fill('invalid');await ui.locator('#password').focus();await expect(ui.locator('#loginEmailFeedback')).not.toHaveText('');expect(await gap()).toBeGreaterThanOrEqual(17)
  expect(await ui.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()
 }
 const dir=path.resolve(process.env.SESSION_EVIDENCE_DIR||'test-results/session-continuity');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,info.project.name+'-validation.png')})
})
test('Session renewal and focus preserve the screen and draft without bulk polling',async({page})=>{
 test.setTimeout(160000)
 let documents=0,profileLoads=0
 page.on('framenavigated',()=>documents++)
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname.endsWith('/rest/v1/profiles')&&u.searchParams.has('id'))profileLoads++})
 const ui=await open(page);await ui.locator('#email').fill(user.email);await ui.locator('#password').fill(password);await ui.getByRole('button',{name:/Sign In/i}).click();await ui.waitForFunction(id=>stagingData?.user.id===id,user.id)
 await page.evaluate(()=>{window.continuityEvents=[];window.addEventListener('message',e=>{if(e.data?.channel==='loanledger-v41224'&&e.data.type==='session')continuityEvents.push(e.data.state)})})
 await ui.evaluate(()=>{go('payment');document.querySelector('#ref').value='Keep this draft';window.continuityMarker=crypto.randomUUID()})
 const marker=await ui.evaluate(()=>continuityMarker),beforeDocuments=documents,beforeProfiles=profileLoads
 await page.evaluate(async()=>{const {supabase}=await import('/src/supabaseClient.js');const renewed=await supabase.auth.refreshSession();if(renewed.error)throw Error('Fixture token renewal failed');const {data}=await supabase.auth.getSession();const result=await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});if(result.error)throw Error('Fixture session reconfirmation failed');window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))})
 // Covers more than one minute; bulk background polling is intentionally absent.
 await page.waitForTimeout(75000)
 expect(documents).toBe(beforeDocuments);expect(profileLoads).toBe(beforeProfiles)
 expect(await ui.evaluate(()=>continuityMarker)).toBe(marker);expect(await ui.evaluate(()=>page)).toBe('payment');await expect(ui.locator('#ref')).toHaveValue('Keep this draft');expect(await page.evaluate(()=>continuityEvents.includes('signed-out'))).toBeFalsy()
 await page.evaluate(async()=>{const {supabase}=await import('/src/supabaseClient.js');await supabase.auth.signOut({scope:'local'})});await ui.waitForFunction(()=>page==='login'&&!stagingData);await expect(ui.locator('#email')).toBeVisible()
 await page.waitForTimeout(1000);expect(await ui.evaluate(()=>page)).toBe('login')
})
test('Publishing an asset does not reload an open sign-in draft',async({page})=>{
 const appRoot=process.env.CONTINUITY_APP_ROOT
 test.skip(!appRoot,'Requires the explicitly selected app asset directory.')
 const root=path.resolve(appRoot,'public'),probe=path.resolve(root,'continuity-'+crypto.randomUUID()+'.txt')
 if(path.dirname(probe)!==root)throw Error('Probe must stay inside the selected public directory.')
 const ui=await open(page);await ui.locator('#email').fill('draft@example.com');await ui.evaluate(()=>window.publicationMarker=crypto.randomUUID());const marker=await ui.evaluate(()=>publicationMarker)
 expect(await ui.evaluate(()=>document.querySelector('#email').closest('.login-field-control').getBoundingClientRect().top-document.querySelector('.login-methods').getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(24)
 try{fs.writeFileSync(probe,'Asset publication continuity check',{flag:'wx'});await page.waitForTimeout(2000);expect(await ui.evaluate(()=>publicationMarker)).toBe(marker);await expect(ui.locator('#email')).toHaveValue('draft@example.com')}
 finally{if(fs.existsSync(probe))fs.unlinkSync(probe)}
})
