import { serviceEndpoint } from '../lib/serviceEndpoint'
import { guestSupportPayload } from '../lib/guestSupportPayload'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useMessages } from '../context/MessagesContext'
import { useNotifications } from '../context/NotificationsContext'
import { useInvoices } from '../context/InvoicesContext'
import { useDisbursements } from '../context/DisbursementsContext'
import { useLoanRequests } from '../context/LoanRequestsContext'
import { mobileEnabled, supabase, setLoginPersistence } from '../supabaseClient'
import { buildRequestSchedule, monthlyInstallment } from '../lib/loanRequest'
import { executeMobileCall, loadMobileExtras, clearMobileAttachmentCache } from '../lib/mobileLocalFlow'
import { useRecordRefresh } from '../lib/recordRefresh'
import { useLocation, useNavigate } from 'react-router-dom'
import { sessionDestination } from '../lib/sessionDestination'
import { useReleaseAccess } from '../context/ReleaseAccessContext'

// The approved HTML owns presentation. React owns authenticated data and never
// sends credentials, auth tokens or server keys into the presentation frame.
export default function VersionedBorrower({ children }) {
  const { enabled: releaseEnabled, borrower } = useReleaseAccess()
  const app = useApp()
  const messages = useMessages()
  const notifications = useNotifications()
  const invoices = useInvoices()
  const disbursements = useDisbursements()
  const requests = useLoanRequests()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const frame = useRef(null)
  const [ready, setReady] = useState(false)
  const [frameGeneration,setFrameGeneration]=useState(0)
  const lastDelivery=useRef(null)
  const [preference, setPreference] = useState(null)
  const [extras,setExtras]=useState(null)
  const [extrasError,setExtrasError]=useState('')
  const extrasGeneration=useRef(0)
  const current = useRef(null)
  useLayoutEffect(() => { current.current = { app, messages, notifications, invoices, disbursements, requests } })
  const refreshExtras=useCallback(async()=>{
    const owner=current.current?.app.session?.user.id
    if(!owner)return
    const generation=++extrasGeneration.current
    try{const loaded=await loadMobileExtras(owner);if(generation===extrasGeneration.current&&current.current?.app.session?.user.id===owner){setExtras(loaded);setPreference(loaded.preference);setExtrasError('')}}
    catch{if(generation===extrasGeneration.current)setExtrasError('Some account details could not be loaded. Please retry.')}
  },[])
  const preferenceOwner = mobileEnabled && releaseEnabled && borrower.ready && borrower.interface === 'new' && app.session?.user.role !== 'admin' ? app.session?.user.id : undefined
  useRecordRefresh(refreshExtras, !!preferenceOwner)
  useEffect(() => {
    clearMobileAttachmentCache()
    let active = true
    const generation = extrasGeneration
    queueMicrotask(() => { if (active) { setPreference(null); if (preferenceOwner) refreshExtras() } })
    if (!preferenceOwner) return () => { active = false; ++generation.current }
    let channel=supabase.channel('mobile-extras-'+preferenceOwner)
    for(const table of ['support_tickets','support_ticket_events','message_hidden','borrower_statements','notification_reactions'])channel=channel.on('postgres_changes',{event:'*',schema:'public',table},refreshExtras)
    channel=channel.subscribe()
    const profileChannel=supabase.channel('borrower-profile-'+preferenceOwner)
      .on('postgres_changes',{event:'*',schema:'public',table:'borrower_preferences',filter:'user_id=eq.'+preferenceOwner},()=>{
        current.current?.app.refreshOwnProfile().catch(()=>setExtrasError('Your profile could not be refreshed. Please retry.'))
        refreshExtras()
      }).subscribe()
    // Only actual changes to borrower details trigger a targeted update.
    // Bulk records are refreshed explicitly; tab focus must never reset work.
    return () => {active = false; ++generation.current;supabase.removeChannel(channel);supabase.removeChannel(profileChannel)}
  },[preferenceOwner,refreshExtras])
  const active = mobileEnabled && app.session?.user.role !== 'admin' && !app.session?.needsPasswordSetup && (!app.session || (releaseEnabled && borrower.ready && borrower.interface === 'new'))
  const destination = sessionDestination(app.session)
  useEffect(() => {
    if (active && app.session && !app.authLoading && (pathname === '/login' || pathname === '/admin' || pathname.startsWith('/admin/'))) {
      navigate(destination, { replace: true })
    }
  }, [active, app.session, app.authLoading, pathname, destination, navigate])
  const post = (payload) => frame.current?.contentWindow?.postMessage({ channel: 'loanledger-v41224', ...payload }, location.origin)
  useEffect(()=>{const changed=()=>frame.current?.contentWindow?.postMessage({channel:'loanledger-v41224',type:'notification-rules-updated'},location.origin);window.addEventListener('loanledger-notification-rules-changed',changed);return()=>window.removeEventListener('loanledger-notification-rules-changed',changed)},[])
  useEffect(() => {
    if (!active) return
    const receive = async (event) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== 'loanledger-v41224') return
      const { type, email, password, id } = event.data
      const { app: latest } = current.current
      if (type === 'ready') { lastDelivery.current=null;setReady(true);setFrameGeneration(n=>n+1);return }
      if(type==='language'){const language=event.data.language==='Filipino'?'Filipino':'English';window.dispatchEvent(new CustomEvent('loanledger-language',{detail:language}));return}
      if (type === 'login') {
        try { setLoginPersistence(event.data.remember!==false);const result = await latest.signInWithPassword(String(email || ''), String(password || '')); if (result.error) post({type:'error', message:result.error, authFailure:true, login:result.login}) }
        catch { post({type:'error', message:'Unable to sign in. Check your connection and try again.'}) }
      }
      if (type === 'logout') await latest.signOut()
      if (type === 'refresh') await latest.refreshData()
      if(type==='mobile-call'){
        const requestId=event.data.requestId,action=event.data.action,payload=event.data.payload||{},owner=latest.session?.user
        try{
          let result
          if(['support-submit','guest-support'].includes(action)&&(typeof payload.description!=='string'||payload.description.trim().length<10||payload.description.length>2000))throw Error('Describe the issue in 10 to 2,000 characters.')
          if(action==='notification-presentation'){
            const headers={'Content-Type':'application/json'}
            if(owner){const {data}=await supabase.auth.getSession();if(data.session?.access_token)headers.Authorization='Bearer '+data.session.access_token}
            const response=await fetch(serviceEndpoint('notification-rules/presentation'),{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(12000)})
            const answer=await response.json();if(!response.ok)throw Error(answer.error||'Unable to load notification presentation.');result=answer
          }else if(action==='login-status'){
            const response=await fetch(serviceEndpoint('login-status'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:payload.email,reference:payload.reference}),signal:AbortSignal.timeout(10000)})
            const answer=await response.json();if(!response.ok)throw Error(answer.error||'Unable to check sign-in access.');result=answer
          }else if(action==='token-login'){
            const response=await fetch(serviceEndpoint('redeem'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:payload.code}),signal:AbortSignal.timeout(20000)})
            const answer=await response.json();if(!response.ok)throw Object.assign(Error(answer.error||'Unable to use this code.'),{login:answer.login})
            const verified=await latest.signInWithLoginCode(answer.tokenHash);if(verified.error)throw Error(verified.error)
            result={signedIn:true}
          }else if(action==='faq-ask'){
            const headers={'Content-Type':'application/json'}
            if(owner){const {data}=await supabase.auth.getSession();if(data.session?.access_token)headers.Authorization='Bearer '+data.session.access_token}
            const response=await fetch(serviceEndpoint('pawcheebels/ask'),{method:'POST',headers,body:JSON.stringify({question:payload.question,useAI:payload.useAI===true,language:payload.language})})
            const answer=await response.json();if(!response.ok)throw Error(answer.error||'Unable to answer. Please retry.');result=answer
          }else if(action==='guest-support'){
            if(owner)throw Error('Use the signed-in Support form.')
            const response=await fetch(serviceEndpoint('guest-support'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(await guestSupportPayload(payload)),signal:AbortSignal.timeout(30000)})
            const answer=await response.json();if(!response.ok)throw Error(answer.error||'Unable to submit Support request.');result=answer
          }else{
            if(!owner||owner.status==='disabled')throw Error('An active sign-in is required.')
            if(action==='password'){
              if(String(payload.next||'').length<8||payload.next!==payload.confirm)throw Error('Enter matching passwords with at least 8 characters.')
              const response=await fetch(import.meta.env.VITE_SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'apikey':import.meta.env.VITE_SUPABASE_PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:owner.email,password:payload.current})})
              const verified=await response.json();if(!response.ok||verified.user?.id!==owner.id)throw Error('The current password is incorrect.')
              await fetch(import.meta.env.VITE_SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLIC_KEY,Authorization:'Bearer '+verified.access_token}})
              const updated=await supabase.auth.updateUser({password:payload.next});if(updated.error)throw Error(updated.error.message)
              result={saved:true}
            }else if(action==='attachment-url'){
              const row=current.current.messages.messagesFor(owner.id).find(m=>m.id===payload.id)
              if(!row?.attachmentPath)throw Error('Attachment not found.')
              const signed=await supabase.storage.from('mobile-attachments').createSignedUrl(row.attachmentPath,900);if(signed.error)throw Error(signed.error.message)
              result={url:signed.data.signedUrl}
            }else if(action==='proof-download'){
              const proof=latest.payments.find(p=>p.id===payload.id&&p.userId===owner.id)
              if(!proof)throw Error('Proof not found.')
              result={url:await latest.getProofUrl(proof),name:proof.fileName}
            }else if(action==='issued-invoice'){
              const invoice=current.current.invoices.invoices.find(i=>i.id===payload.id&&i.userId===owner.id)
              if(!invoice)throw Error('Invoice not found.')
              const {buildInvoiceDoc}=await import('../lib/invoicePdf');result={url:buildInvoiceDoc(invoice).output('bloburl'),id:invoice.invoiceNumber}
            }else{
              const allowed=['profile','preferences','avatar-upload','payment-submit','payment-retract','support-submit','notification-reply','notification-react','message-send','message-react','message-read','message-hide','message-restore','loan-submit','loan-cancel','loan-bank','disbursement-accept','statement-create','statement-delete']
              if(!allowed.includes(action))throw Error('Unsupported action.')
              result=await executeMobileCall(action,payload,owner)
              // Refresh only the records this action changed. Chat and profile
              // updates must not reload the full ledger or clear retained forms.
              if(['support-submit','notification-react','statement-create','statement-delete'].includes(action))await refreshExtras()
              else if(['profile','preferences','avatar-upload'].includes(action))await Promise.all([latest.refreshOwnProfile(),refreshExtras()])
              else if(['message-send','message-react','message-read','notification-reply'].includes(action))await current.current.messages.refreshMessages()
              else if(['message-hide','message-restore'].includes(action))await Promise.all([current.current.messages.refreshMessages(),refreshExtras()])
              else if(['loan-submit','loan-cancel','loan-bank'].includes(action))await current.current.requests.refreshRequests()
              else if(action==='disbursement-accept')await current.current.disbursements.refreshDisbursements()
              else if(['payment-submit','payment-retract'].includes(action))await latest.refreshData({preservePageState:true})
            }
          }
          if(action!=='token-login'&&current.current.app.session?.user.id!==owner?.id)throw Error('The account changed before this request completed.')
          post({type:'mobile-result',requestId,ok:true,result})
        }catch(error){post({type:'mobile-result',requestId,ok:false,error:error.message||'Unable to save. Please retry.',login:error.login})}
        return
      }
      if (type === 'avatar') {
        if (!latest.session?.user || latest.session.user.status === 'disabled') return
        const allowed=['rosie-cat','sunny-fox','bamboo-panda','astro-bot','cloud-bunny','ocean-owl','honey-bear','little-penguin']
        if (id!==null && !allowed.includes(id)) return
        const row={user_id:latest.session.user.id,avatar_id:id,use_profile_photo:event.data.usePhoto===true,updated_at:new Date().toISOString()}
        const {error}=await supabase.from('borrower_preferences').upsert(row,{onConflict:'user_id'})
        if (error) post({type:'error',message:'Avatar could not be saved. Please retry.'})
        else {setPreference(old=>({...old,...row}));await refreshExtras();post({type:'avatar-saved'})}
      }
      if (type === 'notification-read') {
        const inbox=current.current.notifications
        if (!inbox.notifications.some(n=>n.id===id)) return
        if (event.data.read) await inbox.markRead(id);else await inbox.markUnread(id)
      }
      if (type === 'proof') {
        const proof = latest.payments.find(p => p.id === id && p.userId === latest.session?.user.id)
        if (!proof) return
        try { post({type:'proof', id, url:await latest.getProofUrl(proof), mime:proof.fileType}) }
        catch { post({type:'error', message:'Unable to open this proof. Please retry.'}) }
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [active,refreshExtras])
  useEffect(() => {
    if (!active || !ready || (app.session && releaseEnabled && !borrower.ready)) return
    const session=state=>{const key='session:'+state;if(lastDelivery.current===key)return;lastDelivery.current=key;post({type:'session',state})}
    const user = app.users.find(u=>u.id===app.session?.user.id)||app.session?.user
    if (!user) { session(app.authLoading?'loading':'signed-out');if(!app.authLoading&&app.syncError)post({type:'error',message:app.syncError});return }
    if (user.status === 'disabled') { session('blocked'); return }
    if (!app.dataReady || app.syncError) { session(app.syncError?'error':'loading'); return }
    const own = rows => rows.filter(row => row.userId === user.id)
    // Proof previews request a fresh signed URL on demand. Background URL
    // renewal does not change payment details and must not redraw the frame.
    const ownPayments=own(app.payments).map(payment=>{const row={...payment};delete row.fileUrl;return row})
    // Every payload is borrower-scoped even if a provider carries cached data.
    const extra=extras?.userId===user.id?extras:null
    const data={user, integrationError:extrasError, tickets:extra?.tickets||[],notificationReactions:extra?.notificationReactions||[],ticketEvents:extra?.ticketEvents||[],hiddenMessages:extra?.hiddenMessages||[],statements:extra?.statements||[],requestRates:requests.rates,canRequest:requests.canRequest,requestEvents:own(requests.requests).flatMap(r=>requests.eventsFor(r.id)),preference:preference?.user_id===user.id?preference:null, loans:own(app.loans), transactions:own(app.transactions), payments:ownPayments, paymentLogs:own(app.paymentLogs), overrides:app.paymentDueOverrides.filter(o=>o.borrowerId===user.id), messages:messages.messagesFor(user.id), notifications:notifications.notifications.map(n=>({...n,isRead:notifications.isRead(n.id)})), invoices:own(invoices.invoices), disbursements:own(disbursements.disbursements), requests:own(requests.requests).map(r=>({...r,schedule:buildRequestSchedule(r),monthly:monthlyInstallment(r.amount,r.monthlyRate,r.termMonths)}))}
    data.notificationCategories=notifications.categoriesAll
    const key=JSON.stringify(data)
    if(lastDelivery.current===key)return
    if(!lastDelivery.current||lastDelivery.current.startsWith('session:')){
      lastDelivery.current=key;post({type:'snapshot',data});return
    }
    // Group closely arriving provider updates and skip identical snapshots.
    const timer=setTimeout(()=>{lastDelivery.current=key;post({type:'snapshot',data})},80)
    return ()=>clearTimeout(timer)
  }, [active, ready, releaseEnabled, borrower.ready, frameGeneration, preference, extras,extrasError,app.users,app.session, app.authLoading, app.dataReady, app.syncError, app.loans, app.transactions, app.payments, app.paymentLogs, app.paymentDueOverrides, messages, notifications, invoices.invoices, disbursements.disbursements, requests])
  if (!active) return children
  return <iframe ref={frame} onLoad={()=>setReady(true)} title="LoanLedger PH · v4.12.24" allow="web-share" src="/borrower-v4.12.24.html" style={{position:'fixed',inset:0,width:'100%',height:'100%',border:0,background:'#101a31',zIndex:100}} />
}
