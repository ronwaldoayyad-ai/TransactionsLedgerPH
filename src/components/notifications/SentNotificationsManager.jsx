import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from '../../context/AppContext'
import {useNotifications} from '../../context/NotificationsContext'
import {Button,Modal,Switch,inputClass} from '../ui'
import {notificationRuleRequest as request} from '../../lib/notificationRules'
import {categoryMeta} from '../../lib/notifications'
import {EVENTS,FIELDS} from '../../../public/notification-rule-core'

const defaults={borrowerIds:[],category:'',subject:'',includeArchived:false,hideAdmin:false,offset:0}
const Field=({label,children})=><label className="nr-field"><span>{label}</span>{children}</label>
const Text=({value,onChange,...props})=><input className={inputClass} value={value??''} onChange={e=>onChange(e.target.value)} {...props}/>
const Select=({value,onChange,options,...props})=><select className={inputClass} value={value} onChange={e=>onChange(e.target.value)} {...props}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>

export default function SentNotificationsManager(){
 const {users}=useApp(),{categoriesAll,refreshNotifications}=useNotifications()
 const [items,setItems]=useState([]),[total,setTotal]=useState(0),[rules,setRules]=useState([]),[filters,setFilters]=useState(defaults),[subject,setSubject]=useState(''),[borrowerQuery,setBorrowerQuery]=useState(''),[selected,setSelected]=useState(()=>new Set()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[linking,setLinking]=useState(null),[reviewed,setReviewed]=useState(false),[deleting,setDeleting]=useState(null)
 const generation=useRef(0),mutation=useRef(false)
 const borrowers=useMemo(()=>users.filter(u=>u.role==='user').sort((a,b)=>a.name.localeCompare(b.name)),[users])
 const visibleBorrowers=borrowers.filter(b=>filters.borrowerIds.includes(b.id)||[b.name,b.email,b.borrowerAccountNumber].join(' ').toLowerCase().includes(borrowerQuery.toLowerCase()))
 const changeFilters=patch=>{setFilters(previous=>({...previous,...patch,offset:0}));setSelected(new Set());setNotice('')}
 const load=useCallback(async()=>{
  const current=++generation.current;setBusy(true);setError('');setSelected(new Set())
  try{const result=await request('sent',filters);if(current!==generation.current)return
   const lastOffset=result.total?Math.floor((result.total-1)/50)*50:0
   if(filters.offset>lastOffset){setFilters(previous=>({...previous,offset:lastOffset}));return}
   setItems(result.items);setTotal(result.total)
  }catch(failure){if(current===generation.current){setError(failure.message);setItems([]);setTotal(0)}}finally{if(current===generation.current)setBusy(false)}
 },[filters])
 const invalidate=useCallback(()=>{generation.current++},[])
 useEffect(()=>{
  // Reads follow deliberate filters/pagination, never a timer or each subject keystroke.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  load();return invalidate
 },[load,invalidate])
 useEffect(()=>{let active=true;request('list').then(result=>{if(active)setRules(result.rules)}).catch(failure=>{if(active)setError(failure.message)});return()=>{active=false}},[])
 const selectable=items.filter(item=>!item.archived_at),allSelected=selectable.length>0&&selectable.every(item=>selected.has(item.id))
 const toggle=id=>setSelected(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next})
 const reviewDelete=rows=>{setError('');setDeleting({rows,key:crypto.randomUUID(),expected:rows.map(item=>({id:item.id,version:item.edit_version}))})}
 async function mutate(action,payload){
  if(mutation.current)return;mutation.current=true;setBusy(true);setError('');setNotice('')
  try{await request(action,payload);setEditing(null);setLinking(null);await Promise.all([load(),refreshNotifications().catch(()=>{})])}
  catch(failure){setError(failure.message)}finally{mutation.current=false;setBusy(false)}
 }
 async function confirmDelete(){
  if(mutation.current)return;mutation.current=true;setBusy(true);setError('')
  try{const result=await request('sent-delete',{key:deleting.key,ids:deleting.rows.map(item=>item.id),expected:deleting.expected,reviewed:true});setDeleting(null);setSelected(new Set());setNotice(`${result.deleted} notification${result.deleted===1?'':'s'} deleted. Use “Include deleted” to restore them.`);await Promise.all([load(),refreshNotifications().catch(()=>{})])}
  catch(failure){setError(failure.message)}finally{mutation.current=false;setBusy(false)}
 }
 const linkRule=rules.find(rule=>rule.id===linking?.ruleId)
 const recipientNames=item=>item.audience==='all'?'All borrowers':(item.target_user_ids||[]).map(id=>users.find(u=>u.id===id)?.name||'Account').join(', ')||'No recipients'
 return <section className="nr-sent" aria-label="Sent notifications management" aria-busy={busy}>
  <div className="ns-heading"><div><h2>Sent notifications</h2><p>Filter, link and manage delivered messages.</p></div><span className="ns-count">{total} matching</span></div>
  <div className="ns-filters">
   <div className="ns-borrower-head"><span>Borrower</span><input type="search" aria-label="Find borrower filter" placeholder="Find a borrower…" value={borrowerQuery} onChange={e=>setBorrowerQuery(e.target.value)} className={inputClass}/></div>
   <div className="ns-pills" role="group" aria-label="Filter notifications by borrower">
    <button type="button" disabled={busy} aria-pressed={!filters.borrowerIds.length} onClick={()=>changeFilters({borrowerIds:[]})}>All borrowers</button>
    {visibleBorrowers.map(b=><button type="button" key={b.id} disabled={busy} aria-pressed={filters.borrowerIds.includes(b.id)} onClick={()=>changeFilters({borrowerIds:filters.borrowerIds.includes(b.id)?filters.borrowerIds.filter(id=>id!==b.id):[...filters.borrowerIds,b.id]})}><span aria-hidden="true">{b.name.slice(0,1)}</span>{b.name}</button>)}
    {!visibleBorrowers.length&&<p className="nr-muted">No matching borrowers.</p>}
   </div>
   <p className="nr-muted">Includes shared notices and messages sent to, sent by, or associated with the selected borrowers.</p>
   <form className="ns-filter-row" onSubmit={e=>{e.preventDefault();if(subject.trim()===filters.subject&&filters.offset===0)load();else changeFilters({subject:subject.trim()})}}>
    <Field label="Category"><Select aria-label="Filter sent notifications by category" disabled={busy} value={filters.category} onChange={category=>changeFilters({category})} options={[{value:'',label:'All categories'},...categoriesAll.map(c=>({value:c.value,label:c.label+(c.deleted?' (deleted category)':'')}))]}/></Field>
    <Field label="Subject"><Text type="search" aria-label="Filter sent notifications by subject" placeholder="Search subject…" maxLength={200} value={subject} onChange={setSubject}/></Field>
    <Button type="submit" disabled={busy}>Apply / refresh</Button>
    <button type="button" className="ns-clear" disabled={busy} onClick={()=>{setSubject('');setBorrowerQuery('');setSelected(new Set());setFilters({...defaults})}}>Clear filters</button>
   </form>
   <div className="ns-display-options"><label className="ns-include"><input type="checkbox" checked={filters.includeArchived} disabled={busy} onChange={e=>changeFilters({includeArchived:e.target.checked})}/> Include deleted</label><div className="ns-hide-admin"><Switch label="Hide admin notifications" checked={filters.hideAdmin} disabled={busy} onChange={hideAdmin=>changeFilters({hideAdmin})}/><span>Hide admin notifications</span></div></div>
   {filters.hideAdmin&&<p className="nr-muted">Admin-only messages are hidden. Shared notices addressed to borrowers remain visible.</p>}
  </div>
  {notice&&<p className="nr-success" role="status">{notice}</p>}{error&&!deleting&&!editing&&!linking&&<p className="nr-error" role="alert">{error}</p>}
  <div className="ns-selection"><label><input type="checkbox" aria-label="Select all notifications on this page" disabled={busy||!selectable.length} checked={allSelected} ref={e=>{if(e)e.indeterminate=selected.size>0&&!allSelected}} onChange={()=>setSelected(allSelected?new Set():new Set(selectable.map(item=>item.id)))}/> Select page</label><span>{selected.size} selected on this page</span>{selected.size>0&&<button type="button" disabled={busy} className="ns-clear" onClick={()=>setSelected(new Set())}>Clear selection</button>}<Button variant="danger" disabled={busy||!selected.size} onClick={()=>reviewDelete(items.filter(item=>selected.has(item.id)))}>Delete selected{selected.size?` (${selected.size})`:''}</Button></div>
  {busy&&<p role="status" className="nr-muted">Loading / saving notifications…</p>}
  <div className="nr-sent-grid">{items.map(item=><article key={item.id} className={'nr-sent-card'+(selected.has(item.id)?' ns-is-selected':'')} data-notification-id={item.id}>
   <div className="ns-card-head"><label><input type="checkbox" disabled={busy||!!item.archived_at} checked={selected.has(item.id)} aria-label={'Select notification '+(item.title||'Notification')} onChange={()=>toggle(item.id)}/><small>{categoryMeta(item.category).label} · {item.read_count>0?'Read':'Unread'}{item.archived_at?' · Deleted':''}</small></label><span className="ns-audience">{item.audience==='all'?'Shared':(item.target_user_ids||[]).length+' recipient(s)'}</span></div>
   <h3>{item.title||'Notification'}</h3><p>{item.body}</p><small className="ns-recipients">To: {recipientNames(item)}</small><small>{item.linked_rule_id?'Linked: '+(rules.find(rule=>rule.id===item.linked_rule_id)?.name||'Deleted rule'):'Legacy / unlinked'} · {new Date(item.created_at).toLocaleString('en-PH')}</small>
   <div className="nr-inline"><button disabled={busy} onClick={()=>setEditing({id:item.id,title:item.title,body:item.body})}>Edit text</button><button disabled={busy||!!item.linked_rule_id} onClick={()=>{setReviewed(false);setLinking({id:item.id,ruleId:'',eventType:'',payload:{},title:item.title})}}>Link to rule</button>{item.linked_rule_id&&<button disabled={busy} onClick={()=>mutate('unlink',{id:item.id})}>Unlink</button>}{item.archived_at?<button disabled={busy} onClick={()=>mutate('archive',{id:item.id,restore:true})}>Restore</button>:<button className="ns-delete" disabled={busy} onClick={()=>reviewDelete([item])}>Delete</button>}</div>
  </article>)}</div>
  {!busy&&!items.length&&<p className="ns-empty">No notifications match these filters.</p>}
  <div className="nr-pagination"><Button variant="secondary" disabled={busy||filters.offset===0} onClick={()=>{setSelected(new Set());setFilters(previous=>({...previous,offset:Math.max(0,previous.offset-50)}))}}>Previous</Button><span>{total?filters.offset+1:0}–{filters.offset+items.length} of {total}</span><Button variant="secondary" disabled={busy||filters.offset+items.length>=total} onClick={()=>{setSelected(new Set());setFilters(previous=>({...previous,offset:previous.offset+50}))}}>Next</Button></div>
  {deleting&&<Modal open title={deleting.rows.length===1?'Delete notification':'Delete selected notifications'} onClose={()=>{if(!busy){setDeleting(null);setError('')}}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>{setDeleting(null);setError('')}}>Cancel</Button><Button variant="danger" disabled={busy} onClick={confirmDelete}>{busy?'Deleting…':`Delete ${deleting.rows.length} notification${deleting.rows.length===1?'':'s'}`}</Button></>}>
   <p className="text-sm text-slate-700">Delete {deleting.rows.length} selected notification{deleting.rows.length===1?'':'s'} from recipients’ inboxes? You can restore them using “Include deleted.” Read history and links are retained.</p>
   {deleting.rows.some(item=>item.audience==='all'||(item.target_user_ids||[]).length>1)&&<p role="note" className="nr-error">This selection contains shared notifications. Deletion applies to every recipient, including borrowers outside your current filter.</p>}
   <ul className="ns-delete-list">{deleting.rows.map(item=><li key={item.id}><strong>{item.title||'Notification'}</strong><small>{recipientNames(item)}</small></li>)}</ul>{error&&<p className="nr-error" role="alert">{error}</p>}
  </Modal>}
  {editing&&<Modal open title="Edit sent notification" onClose={()=>{if(!busy){setEditing(null);setError('')}}} footer={<Button disabled={busy} onClick={()=>mutate('sent-edit',{id:editing.id,notification:{title:editing.title,body:editing.body}})}>Save text</Button>}><Field label="Title"><Text value={editing.title} onChange={title=>setEditing({...editing,title})} maxLength={500}/></Field><Field label="Message"><textarea className={inputClass} rows={7} maxLength={20000} value={editing.body} onChange={e=>setEditing({...editing,body:e.target.value})}/></Field><p className="nr-muted">Recipients, read state and discussions are retained.</p>{error&&<p className="nr-error" role="alert">{error}</p>}</Modal>}
  {linking&&<Modal open title="Review and link legacy notification" onClose={()=>{if(!busy){setLinking(null);setError('')}}} footer={<Button disabled={busy||!reviewed||!linking.ruleId||!linking.eventType} onClick={()=>mutate('link',{...linking,reviewed})}>Link without changing text</Button>}><strong>{linking.title}</strong><Field label="Rule"><Select value={linking.ruleId} onChange={ruleId=>{const rule=rules.find(item=>item.id===ruleId),event=rule?.graph.nodes.find(node=>node.type==='when'&&!EVENTS.find(item=>item.value===node.data.event)?.presentation)?.data.event;setLinking({...linking,ruleId,eventType:event||''})}} options={[{value:'',label:'Choose a rule'},...rules.map(rule=>({value:rule.id,label:rule.name}))]}/></Field><Field label="Actual source event"><Select value={linking.eventType} onChange={eventType=>setLinking({...linking,eventType})} options={[{value:'',label:'Choose the event'},...(linkRule?.graph.nodes.filter(node=>node.type==='when'&&!EVENTS.find(item=>item.value===node.data.event)?.presentation).map(node=>({value:node.data.event,label:EVENTS.find(e=>e.value===node.data.event)?.label||node.data.event}))||[])]}/></Field><p className="nr-muted">Enter only values you can confirm from the original submission or ledger. Blank values are not inferred.</p><div className="nr-sample-fields">{FIELDS.filter(field=>['amount','status','reference','date','due_date','remaining_balance','funds_applied','note','period','name','email','account_number','source_id'].includes(field)).map(field=><Field key={field} label={field}><Text value={linking.payload[field]} onChange={value=>setLinking({...linking,payload:{...linking.payload,[field]:value}})}/></Field>)}</div><label className="nr-retro"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed these source values and selected the correct rule.</label>{error&&<p className="nr-error" role="alert">{error}</p>}</Modal>}
 </section>
}
