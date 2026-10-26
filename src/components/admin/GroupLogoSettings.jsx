import {useEffect,useRef,useState} from 'react'
import {useRetailBrands} from '../../context/RetailBrandsContext'
import {GROUP_LOGOS,groupLogoUrl} from '../../lib/groupLogos'
import {groupLogoRequest} from '../../lib/groupLogoRequest'
import {Button} from '../ui'
import './GroupLogoSettings.css'
const noop=()=>{}
export default function GroupLogoSettings({initialGroup='cash_loan',onBusyChange=noop}){
 const brands=useRetailBrands(),[group,setGroup]=useState(initialGroup),[draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[reviewed,setReviewed]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),fileInput=useRef(null),retry=useRef(null)
 const row=brands.groupLogos.find(r=>r.group_key===group),label=GROUP_LOGOS.find(g=>g.key===group)?.label,currentUrl=groupLogoUrl(row?.svg),previewUrl=groupLogoUrl(draft?.svg)
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false)},[busy,onBusyChange])
 function select(value){setGroup(value);setDraft(null);setReviewed(false);setError('');setNotice('');retry.current=null}
 async function choose(file){
  if(!file||busy)return
  setError('');setNotice('');setReviewed(false);setDraft(null);retry.current=null
  if(!/\.svg$/i.test(file.name)||!['','image/svg+xml'].includes(file.type)){setError('Choose an SVG file. PNG, JPG and other image formats are not supported for group logos.');return}
  if(!file.size||file.size>131072){setError('Choose an SVG file up to 128 KB.');return}
  if(!row?.version){setError('Reload group logos before choosing a file.');return}
  setBusy(true)
  try{const result=await groupLogoRequest('preview',{group,svg:await file.text()});setDraft({svg:result.svg,filename:file.name,expectedVersion:row.version})}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function save(){
  if(busy||!draft||!reviewed)return
  setBusy(true);setError('');setNotice('')
  const base={group,...draft,reviewed:true},signature=JSON.stringify(base),payload=retry.current?.signature===signature?retry.current.payload:{...base,key:crypto.randomUUID()};retry.current={signature,payload}
  try{await groupLogoRequest('save',payload);retry.current=null;setDraft(null);setReviewed(false);await brands.refreshGroups();setNotice(label+' logo '+(payload.svg?'saved':'removed')+'. Matching records use the shared setting automatically.')}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section id="group-logos" className="group-logo-settings" aria-labelledby="group-logo-title">
  <header><h2 id="group-logo-title">Transaction group logos</h2><p>Upload one shared SVG for Cash Loan, Fees or Adjustments. Retail logos continue to use Brandfetch.</p></header>
  <div className="group-logo-tabs" role="group" aria-label="Choose a transaction group">{GROUP_LOGOS.map(g=><button type="button" key={g.key} disabled={busy} aria-pressed={group===g.key} onClick={()=>select(g.key)}>{g.label}<small>{brands.groupLogos.some(r=>r.group_key===g.key&&r.svg)?'Logo uploaded':'Default icon'}</small></button>)}</div>
  {(brands.groupError||!brands.groupsReady)&&<div className="group-logo-error" role="status">{brands.groupError||'Loading shared group logos…'} <button type="button" disabled={busy} onClick={brands.refreshGroups}>Reload group logos</button></div>}
  <p className="group-logo-scope">Shared by all {label} transaction logos, including borrower cards, lists, breakdowns, recent activity and history.{group==='cash_loan'?' Includes PayPal Send installments grouped as Cash Loan.':''} This changes artwork only.</p>
  <div className="group-logo-previews"><div><span>Current logo</span>{currentUrl?<img src={currentUrl} alt={label+' current group logo'}/>:<p>Default icon / artwork</p>}<small>{row?.filename||'No uploaded SVG'}</small></div>{draft&&<div><span>After saving</span>{previewUrl?<img src={previewUrl} alt={label+' selected SVG preview'}/>:<p>Default icon / artwork</p>}<small>{draft.filename||'Uploaded logo will be removed'}</small></div>}</div>
  <input ref={fileInput} type="file" accept="image/svg+xml,.svg" aria-label={'Upload '+label+' SVG logo'} disabled={busy||!brands.groupsReady} onChange={e=>{const file=e.target.files[0];e.target.value='';choose(file)}} className="group-logo-file-input"/>
  <div className="group-logo-actions"><Button variant="secondary" disabled={busy||!brands.groupsReady} onClick={()=>fileInput.current?.click()}>{busy?'Working…':currentUrl?'Replace SVG':'Upload SVG'}</Button><Button variant="secondary" disabled={busy||!row?.svg} onClick={()=>{setDraft({svg:null,filename:null,expectedVersion:row.version});setReviewed(false);setError('');setNotice('');retry.current=null}}>Remove uploaded logo</Button></div>
  <p className="group-logo-help">SVG only · up to 128 KB uploaded / 64 KB after validation. Use vector paths, fills and local gradients; convert text to outlines. External images, links, scripts and style sheets are not supported.</p>
  {draft&&<div className="group-logo-review"><label><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/><span>I reviewed this shared logo change for all {label} records.</span></label>{row?.version!==draft.expectedVersion&&<p role="alert">The shared logo changed while you were reviewing. Choose the file again to review the current version.</p>}<div className="group-logo-actions"><Button disabled={busy||!reviewed||row?.version!==draft.expectedVersion} onClick={save}>{busy?'Saving…':'Save '+label+' logo'}</Button><Button variant="secondary" disabled={busy} onClick={()=>{setDraft(null);setReviewed(false);retry.current=null}}>Discard change</Button></div></div>}
  {error&&<p className="group-logo-error" role="alert">{error}</p>}{notice&&<p className="group-logo-notice" role="status">{notice}</p>}
 </section>
}
