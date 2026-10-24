import {useCallback,useEffect,useRef,useState} from 'react'
import {telegramRequest} from '../lib/telegram'
import './telegram-settings.css'
const labels={queued:'Queued',sending:'Sending',retry:'Retry scheduled',delivered:'Sent',failed:'Failed',uncertain:'Delivery uncertain',cancelled:'Cancelled'}
const date=value=>value?new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(value)):'—'
export default function TelegramSettings(){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[connection,setConnection]=useState(null),[testKind,setTestKind]=useState('proof')
 const mounted=useRef(false),sequence=useRef(0)
 const load=useCallback(async(signal)=>{
  const n=++sequence.current
  try{const r=await telegramRequest('list',{},signal);if(mounted.current&&n===sequence.current){setData(r);setError('')}}
  catch(e){if(mounted.current&&!signal?.aborted&&n===sequence.current)setError(e.message)}
 },[])
 useEffect(()=>{mounted.current=true;const controller=new AbortController();queueMicrotask(()=>load(controller.signal));return()=>{mounted.current=false;controller.abort()}},[load])
 async function act(action,payload={}){
  if(busy)return
  setBusy(true);setError('');setNotice('')
  try{
   const result=await telegramRequest(action,payload)
   if(!mounted.current)return
   if(action==='begin')setConnection(result)
   else if(action==='connect'){setConnection(null);setNotice('Private chat connected. Send a test alert, then enable proof alerts when you are ready.')}
   else if(action==='save')setNotice((payload.kind==='message'?'Telegram message alerts':'Telegram proof alerts')+(payload.enabled?' enabled for future activity.':' turned off. Queued alerts of this type were cancelled; an alert already sending may still arrive.'))
   else setNotice(action==='test'?'Test alert queued. Refresh delivery status shortly.':'Delivery queued for retry.')
   await load()
  }catch(e){if(mounted.current)setError(e.message)}
  finally{if(mounted.current)setBusy(false)}
 }
 return <section className="release-card telegram-settings" id="telegram-alerts" aria-labelledby="telegram-heading">
  <div className="release-section-heading"><div><h2 id="telegram-heading">Telegram alerts</h2><p>Get private alerts for proof submissions and new borrower messages. Existing app notifications stay active.</p></div><button type="button" disabled={busy} onClick={()=>load()}>Refresh status</button></div>
  {error&&<p className="release-error" role="alert">{error}</p>}
  {notice&&<p className="release-notice" role="status">{notice}</p>}
  {!data&&!error&&<p role="status">Loading Telegram settings…</p>}
  {data&&<>
   {!data.configured&&<p className="telegram-hint">The bot credential needs to be configured securely on the server. It is never displayed here.</p>}
   {data.configured&&!data.deliveryEnabled&&<p className="telegram-hint">Delivery is disabled for this environment.</p>}
   {data.workerError&&<p className="release-error" role="alert">{data.workerError}</p>}
   <div className="telegram-overview"><div><span>Bot</span><strong>@{data.botUsername}</strong></div><div><span>Private destination</span><strong>{data.settings.destination||'Not connected'}</strong></div><div><span>Proof alerts</span><strong>{data.settings.enabled?'On':'Off'}</strong></div><div><span>Message alerts</span><strong>{data.settings.messageEnabled?'On':'Off'}</strong></div></div>
   <div className="telegram-actions">
    <button type="button" disabled={busy||!data.configured} onClick={()=>act('begin')}>{data.settings.connected?'Reconnect my Telegram':'Connect my Telegram'}</button>
    <label className="telegram-test-type">Test alert type<select aria-label="Test alert type" value={testKind} onChange={e=>setTestKind(e.target.value)} disabled={busy}><option value="proof">Proof submission</option><option value="message">Borrower message</option></select></label><button type="button" disabled={busy||!data.configured||!data.deliveryEnabled||!data.settings.connected} onClick={()=>act('test',{kind:testKind})}>Send test alert</button>
    <label className="release-switch"><input type="checkbox" role="switch" aria-label="Telegram proof alerts" checked={data.settings.enabled} disabled={busy||(!data.settings.enabled&&(!data.configured||!data.deliveryEnabled||!data.settings.connected))} onChange={e=>act('save',{enabled:e.target.checked,version:data.settings.version,kind:'proof'})}/><span>Enable Telegram proof alerts</span></label>
    <label className="release-switch"><input type="checkbox" role="switch" aria-label="Telegram message alerts" checked={!!data.settings.messageEnabled} disabled={busy||(!data.settings.messageEnabled&&(!data.configured||!data.deliveryEnabled||!data.settings.connected))} onChange={e=>act('save',{enabled:e.target.checked,version:data.settings.version,kind:'message'})}/><span>Enable Telegram message alerts</span></label>
   </div>
   {connection&&<div className="telegram-connect" role="status"><strong>Link your private chat</strong><p>Open this link in Telegram, press Start, then return here and confirm. It expires in 10 minutes. Keep the connection link private.</p><a href={connection.url} target="_blank" rel="noopener noreferrer">Open @&#8203;{data.botUsername}</a><button type="button" disabled={busy} onClick={()=>act('connect')}>I pressed Start — check connection</button><button type="button" disabled={busy} onClick={()=>setConnection(null)}>Cancel</button></div>}
   <p className="telegram-hint">Proof alerts show the borrower, amount, reference and submission time. Message alerts show the borrower, the first 200 characters and sent time. Links require admin sign-in. Attachments stay in the app. Each switch applies to new activity after enabling.</p>
   <h3>Recent delivery activity</h3><p className="release-muted">Latest 30 alerts · Philippine time · queued alerts normally process within a minute.</p>
   {!data.deliveries.length?<p className="telegram-empty">No Telegram deliveries yet.</p>:<div className="telegram-table-wrap"><table><caption className="sr-only">Telegram delivery status</caption><thead><tr><th>Alert</th><th>Submitted</th><th>Status</th><th>Details</th></tr></thead><tbody>{data.deliveries.map(row=><tr key={row.id}><td>{row.kind==='test'?(row.test_type==='message'?'Test: borrower message':'Test: proof submission'):row.kind==='message'?'Message from '+(row.borrower||'borrower'):row.reference||'Proof submitted'}</td><td>{date(row.created_at)}</td><td><span className={'telegram-status is-'+row.status}>{labels[row.status]||row.status}</span>{row.delivered_at&&<small>Sent {date(row.delivered_at)}</small>}</td><td>{row.last_error&&<p>{row.last_error}</p>}{['failed','uncertain'].includes(row.status)&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('Check Telegram first: this alert may already have arrived. Retry it now?'))act('retry',{id:row.id,confirm:true})}}>Retry alert</button>}</td></tr>)}</tbody></table></div>}
  </>}
 </section>
}
