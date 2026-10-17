import { useMemo, useState } from 'react'
import { useNotifications } from '../../context/NotificationsContext'
import { categoryMeta } from '../../lib/notifications'

const categoriesOf=rule=>[...new Set((rule.graph?.nodes||[]).filter(node=>node.type==='send').map(node=>node.data.category||'general'))]
export default function RuleDirectory({rules,drafts,draft,query,onQuery,busy,onNew,onRefresh,onDeleted,deletedCount,onChoose,cacheKey}){
 const {categoriesAll}=useNotifications()
 const [category,setCategory]=useState('all'),[sort,setSort]=useState('updated-new'),[grouped,setGrouped]=useState(true)
 const rows=useMemo(()=>rules.filter(rule=>rule.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(category==='all'||categoriesOf(rule).includes(category))).slice().sort((a,b)=>{
  const field=sort.startsWith('created')?'created_at':'updated_at',direction=sort.endsWith('new')?-1:1
  return direction*((Date.parse(a[field]||a.created_at)||0)-(Date.parse(b[field]||b.created_at)||0))||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)
 }),[rules,query,category,sort])
 const categoryKeys=[...new Set([...categoriesAll.map(row=>row.value),...rules.flatMap(categoriesOf)])]
 const groups=grouped?categoryKeys.map(value=>({value,label:categoryMeta(value).label,rows:rows.filter(rule=>categoriesOf(rule).includes(value))})).filter(group=>group.rows.length).sort((a,b)=>a.label.localeCompare(b.label)):[{value:'all',label:'All rules',rows}]
 const dateField=sort.startsWith('created')?'created_at':'updated_at'
 const choice=(rule,local=false)=><button type="button" className={'nr-rule-choice'+(cacheKey(draft)===cacheKey(rule)?' is-selected':'')} key={cacheKey(rule)} onClick={()=>onChoose(rule)}><span className={rule.enabled&&!local?'nr-dot':'nr-dot is-off'}/><span><strong>{rule.name}</strong><small>{local?'Unsaved draft':`v${rule.version} · ${rule.linked||0} linked · ${rule.enabled?'Enabled':'Disabled'}`}</small>{!local&&<time className="nr-rule-date" dateTime={rule[dateField]||rule.created_at}>{sort.startsWith('created')?'Created ':'Updated '}{new Date(rule[dateField]||rule.created_at).toLocaleDateString('en-PH',{dateStyle:'medium',timeZone:'Asia/Manila'})}</time>}</span></button>
 return <aside className="nr-rule-list"><div className="nr-section-head"><h3>Rules</h3><button type="button" aria-label="Create notification rule" disabled={busy} onClick={()=>{setCategory('all');onNew()}}>+ New</button></div><input className="w-full rounded-lg border border-slate-200 p-2 text-sm" value={query} onChange={event=>onQuery(event.target.value)} placeholder="Find a rule" type="search" aria-label="Find a rule"/>
  <div className="nr-list-controls"><label>Category<select className="mt-1 rounded-lg border border-slate-200 p-2" value={category} onChange={event=>setCategory(event.target.value)}><option value="all">All categories</option>{categoryKeys.map(value=><option key={value} value={value}>{categoryMeta(value).label}{categoriesAll.find(row=>row.value===value)?.deleted?' (deleted)':''}</option>)}</select></label><label>Sort by date<select className="mt-1 rounded-lg border border-slate-200 p-2" value={sort} onChange={event=>setSort(event.target.value)}><option value="updated-new">Updated · newest first</option><option value="updated-old">Updated · oldest first</option><option value="created-new">Created · newest first</option><option value="created-old">Created · oldest first</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={grouped} onChange={event=>setGrouped(event.target.checked)}/>Group by category</label></div>
  <button type="button" className="nr-refresh" onClick={onRefresh} disabled={busy}>Refresh rules</button><button type="button" className="nr-refresh nr-deleted-toggle" disabled={busy} onClick={onDeleted}>Deleted rules ({deletedCount})</button>
  {drafts.length>0&&<><h4 className="nr-rule-group-title">Local drafts</h4>{drafts.map(rule=>choice(rule,true))}</>}
  {grouped&&<p className="nr-muted">Rules with several categories appear in each group.</p>}
  {groups.map(group=><section key={group.value} aria-label={group.label+' rules'}>{grouped&&<h4 className="nr-rule-group-title">{group.label} · {group.rows.length}</h4>}{group.rows.map(rule=>choice(rule))}</section>)}
  {!rows.length&&<p className="nr-muted">No saved rules match these filters.</p>}
 </aside>
}
