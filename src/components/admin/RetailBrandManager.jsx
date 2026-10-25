import {useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from '../../context/AppContext'
import {useRetailBrands} from '../../context/RetailBrandsContext'
import {brandDomain,uniqueRetailTargets} from '../../lib/retailBrands'
import RetailBrandLogo from '../RetailBrandLogo'
import {Button,Modal,inputClass} from '../ui'
import './RetailBrandManager.css'

export default function RetailBrandManager({transactions,onClose}){
 const app=useApp(),brands=useRetailBrands(),targets=useMemo(()=>uniqueRetailTargets(transactions,app.loans),[transactions,app.loans])
 const [selected,setSelected]=useState(()=>new Set(targets.length===1?[targets[0].key]:[])),[filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[results,setResults]=useState([]),[searching,setSearching]=useState(false),[choice,setChoice]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reviewed,setReviewed]=useState(false),[ruleAlias,setRuleAlias]=useState(''),[rulesOpen,setRulesOpen]=useState(false)
 const retry=useRef(null),sequence=useRef(0)
 useEffect(()=>{const seq=++sequence.current,controller=new AbortController();if(query.trim().length<2||!brands.clientId)return()=>controller.abort()
  const timer=setTimeout(async()=>{setSearching(true);try{const response=await fetch('https://api.brandfetch.io/v2/search/'+encodeURIComponent(query.trim())+'?c='+encodeURIComponent(brands.clientId),{signal:controller.signal});if(!response.ok)throw Error(response.status===429?'Brand search is busy. Wait a moment and try again.':'Brand search is unavailable. Please retry.');const list=await response.json();if(seq===sequence.current){setResults(Array.isArray(list)?list.filter(b=>brandDomain(b.domain)).slice(0,5):[]);setError('')}}catch(e){if(e.name!=='AbortError'&&seq===sequence.current)setError(e.message)}finally{if(seq===sequence.current)setSearching(false)}},350)
  return()=>{clearTimeout(timer);controller.abort()}
 },[query,brands.clientId])
 const rows=targets.map(t=>({...t,brand:brands.resolve(t.transaction,t.loan)})),visible=rows.filter(t=>filter==='all'||filter==='review'&&t.brand.status==='review'||filter==='unmatched'&&t.brand.status==='unmatched'||filter==='assigned'&&['manual','automatic'].includes(t.brand.status))
 const chosen=rows.filter(t=>selected.has(t.key)),names=new Map(app.users.map(u=>[u.id,u.name]))
 const reviewSignature=JSON.stringify({choice,targets:chosen.map(t=>({key:t.key,user:t.userId,description:t.description,version:t.brand.version}))}),isReviewed=reviewed===reviewSignature
 const toggle=key=>{retry.current=null;setReviewed(false);setSelected(old=>{const next=new Set(old);if(next.has(key))next.delete(key);else next.add(key);return next})}
 async function apply(mode){
  if(busy||!chosen.length||!isReviewed)return
  if(chosen.length>200){setError('Select at most 200 retail items at a time.');return}
  setBusy(true);setError('');setNotice('')
  const base={mode,domain:mode==='manual'?choice?.domain:null,name:mode==='manual'?choice?.name:null,reviewed:true,targets:chosen.map(t=>({scope:t.scope,id:t.id,expectedUserId:t.userId,expectedDescription:t.description,expectedVersion:t.brand.version}))}
  const signature=JSON.stringify(base),payload=retry.current?.signature===signature?retry.current.payload:{...base,key:crypto.randomUUID()};retry.current={signature,payload}
  try{const result=await brands.assign(payload);if(result.error)throw Error(result.error);retry.current=null;setNotice('Logo choice saved for '+chosen.length+' item'+(chosen.length===1?'':'s')+'.');setReviewed(false)}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function rememberRule(){if(!choice||!ruleAlias.trim())return;setBusy(true);const result=await brands.saveRule({key:crypto.randomUUID(),alias:ruleAlias.trim(),domain:choice.domain,name:choice.name,active:true});setBusy(false);if(result.error)setError(result.error);else{setRuleAlias('');setNotice('Matching keyword saved. Conflicting brand matches still require review.')}}
 return <Modal open title="Retail brand logos" onClose={()=>{if(!busy)onClose()}} footer={<Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button>}>
  <div className="retail-brand-manager">
   <p className="text-xs text-slate-500">Logos are shared with borrowers. Installment choices apply to the whole loan.</p>
   {(!brands.ready||brands.error)&&<div className="brand-notice" role="status">{brands.error||'Loading saved logo choices…'}<button onClick={brands.refresh}>Retry</button></div>}
   {!brands.clientId&&<p role="alert" className="brand-error">Brandfetch search is not configured for this build.</p>}
   <div className="brand-filters" role="group" aria-label="Filter logo assignments">{[['all','All'],['review','Needs review'],['unmatched','Unmatched'],['assigned','Assigned']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label} <small>{rows.filter(t=>value==='all'||value==='review'&&t.brand.status==='review'||value==='unmatched'&&t.brand.status==='unmatched'||value==='assigned'&&['manual','automatic'].includes(t.brand.status)).length}</small></button>)}</div>
   <div className="flex items-center justify-between text-xs"><span>{selected.size} selected</span><button className="text-blue-700" disabled={busy} onClick={()=>{setSelected(new Set(visible.map(t=>t.key)));setReviewed(false);retry.current=null}}>Select shown</button><button disabled={busy} onClick={()=>{setSelected(new Set());setReviewed(false);retry.current=null}}>Clear</button></div>
   <div className="brand-target-list">{visible.map(t=><label className="brand-target" key={t.key}><input type="checkbox" checked={selected.has(t.key)} disabled={busy} onChange={()=>toggle(t.key)}/><span className="min-w-0"><b>{t.description}</b><small>{names.get(t.userId)||'Borrower'} · {t.scope==='loan'?'Whole installment loan':t.transaction.type==='Installment'?'Standalone installment':'Straight retail'}</small>{t.brand.status==='review'&&<small className="text-amber-700">Choose between {t.brand.candidates.map(c=>c.name).join(' / ')}</small>}</span><RetailBrandLogo transaction={t.transaction} loan={t.loan}/></label>)}{!visible.length&&<p className="py-5 text-center text-xs text-slate-500">No matching retail items.</p>}</div>
   <label className="block text-xs font-semibold" htmlFor="brand-search">Search Brandfetch</label><input id="brand-search" type="search" value={query} disabled={busy} onChange={e=>{++sequence.current;setQuery(e.target.value);setResults([]);setChoice(null);setReviewed(false);setSearching(e.target.value.trim().length>=2)}} className={inputClass} placeholder="Brand or merchant name, e.g. Power Mac Center" autoComplete="off"/>
   <div aria-live="polite" className="text-xs text-slate-500">{searching?'Searching…':query.trim().length>=2&&!results.length?'No brands found yet. Try another name.':''}</div>
   <div className="brand-search-results">{results.map(r=><button type="button" key={r.brandId||r.domain} disabled={busy} aria-pressed={choice?.domain===r.domain} onClick={()=>{setChoice({domain:r.domain,name:r.name});setReviewed(false);retry.current=null}}><img src={r.icon} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onError={e=>{e.currentTarget.hidden=true}}/><span><b>{r.name}</b><small>{r.domain}</small></span><span aria-hidden="true">{choice?.domain===r.domain?'✓':'+'}</span></button>)}</div>
   {choice&&<div className="brand-notice">Assign <b>{choice.name}</b> ({choice.domain}) to <b>{chosen.length}</b> selected {chosen.length===1?'item':'items'}.</div>}
   <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={isReviewed} disabled={busy||!chosen.length||!brands.ready} onChange={e=>setReviewed(e.target.checked?reviewSignature:false)}/><span>I reviewed the selected items and logo change.</span></label>
   <div className="brand-action-buttons"><Button onClick={()=>apply('manual')} disabled={busy||!isReviewed||!choice||!brands.ready}>Assign selected logo</Button><Button variant="secondary" onClick={()=>apply('none')} disabled={busy||!isReviewed||!brands.ready}>Remove logo</Button><Button variant="secondary" onClick={()=>apply('auto')} disabled={busy||!isReviewed||!brands.ready}>Use automatic</Button></div>
   {error&&<p role="alert" className="brand-error">{error}</p>}{notice&&<p role="status" className="brand-success">{notice}</p>}
   <button type="button" className="text-xs text-blue-700" onClick={()=>setRulesOpen(v=>!v)}> {rulesOpen?'Hide':'Manage'} matching keywords</button>
   {rulesOpen&&<div className="brand-rules"><p className="text-xs text-slate-500">Add a merchant or product keyword for the selected brand. Multiple matching brands always go to review.</p><input aria-label="Matching brand keyword" value={ruleAlias} maxLength={80} onChange={e=>setRuleAlias(e.target.value)} className={inputClass} placeholder="Merchant keyword only"/><Button variant="secondary" disabled={busy||!choice||!ruleAlias.trim()} onClick={rememberRule}>Save keyword for {choice?.name||'selected brand'}</Button>{brands.rules.filter(r=>r.active).map(r=><div key={r.id}><span>{r.alias} → {r.name}</span><button disabled={busy} onClick={async()=>{setBusy(true);const result=await brands.saveRule({key:crypto.randomUUID(),id:r.id,expectedVersion:r.version,alias:r.alias,domain:r.domain,name:r.name,active:false});setBusy(false);if(result.error)setError(result.error)}}>Remove</button></div>)}</div>}
  </div>
 </Modal>
}
