import { useState } from 'react'
import { useNotifications } from '../../context/NotificationsContext'
import { notificationRuleRequest as request } from '../../lib/notificationRules'
import { CATEGORY_COLORS, categoryMeta } from '../../lib/notifications'
import { Button, Field, Modal, inputClass } from '../ui'
import Icon from '../Icon'

const empty={label:'',filipinoLabel:'',icon:'bell',color:'slate'}
const slug=text=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)

export default function CategoriesManager(){
 const {categoriesAll,refreshCategories,categoryError}=useNotifications()
 const [editing,setEditing]=useState(null),[deleting,setDeleting]=useState(null),[form,setForm]=useState(empty),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const start=row=>{setEditing(row||{});setForm(row?{label:row.label,filipinoLabel:row.filipinoLabel||'',icon:row.icon,color:row.color}:empty);setError('')}
 async function mutate(action,body){setBusy(true);setError('');try{await request(action,body);await refreshCategories();setEditing(null);setDeleting(null);setNotice(action==='category-delete'?'Category removed from new choices. Existing messages and rules are retained.':'Category saved.')}catch(failure){setError(failure.message)}finally{setBusy(false)}}
 const ready=categoriesAll.some(row=>Number.isInteger(row.version))
 const set=patch=>setForm(old=>({...old,...patch})),value=editing?.value||slug(form.label)
 return <section className="nr-categories"><div className="nr-section-head"><div><h2>Notification categories</h2><p className="nr-muted">Used by rules, messages, templates and borrower notifications.</p></div><Button disabled={!ready} onClick={()=>start(null)}>+ New category</Button></div>
  {notice&&<p className="nr-success" role="status">{notice}</p>}{error&&!editing&&!deleting&&<p className="nr-error" role="alert">{error}</p>}
  {categoryError&&<p className="nr-error" role="alert">{categoryError} <button type="button" onClick={refreshCategories}>Refresh categories</button></p>}
  {!ready&&!categoryError&&<p className="nr-muted" role="status">Loading the category catalog… <button type="button" onClick={refreshCategories}>Refresh categories</button></p>}
  <div className="nr-category-grid">{categoriesAll.filter(row=>!row.deleted).map(row=><article className="nr-category-card" key={row.value}><span className={'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm '+row.tone}><Icon name={row.icon} className="h-4 w-4"/>{row.label}</span>{row.filipinoLabel&&<p>{row.filipinoLabel}</p>}<small>{row.value}</small><div className="nr-inline"><Button variant="secondary" disabled={busy||!ready} onClick={()=>start(row)}>Edit</Button><Button variant="secondary" disabled={busy||!ready||row.value==='general'} onClick={()=>{setError('');setDeleting(row)}}>Delete</Button></div>{row.value==='general'&&<small>Required fallback category</small>}</article>)}</div>
  <p className="nr-muted">Deleting removes a category from new choices. Existing notifications keep their category label, and existing rules keep working. General is retained as the fallback.</p>
  {editing&&<Modal open title={editing.value?'Edit notification category':'New notification category'} onClose={()=>{if(!busy)setEditing(null)}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancel</Button><Button disabled={busy||form.label.trim().length<2||!value||!/^[a-z][a-z0-9-]{1,39}$/.test(value)} onClick={()=>mutate('category-save',{...form,value,version:editing.version})}>{busy?'Saving…':'Save category'}</Button></>}>
   <Field label="Name · English" htmlFor="notification-category-name"><input id="notification-category-name" className={inputClass} maxLength={60} value={form.label} onChange={event=>set({label:event.target.value})}/></Field><Field label="Name · Filipino (optional)" htmlFor="notification-category-filipino"><input id="notification-category-filipino" className={inputClass} maxLength={60} value={form.filipinoLabel} onChange={event=>set({filipinoLabel:event.target.value})}/></Field><p className="nr-muted">Identifier: {value||'Generated from the name'}. This stays fixed when renamed.</p>
   <Field label="Icon" htmlFor="notification-category-icon"><select id="notification-category-icon" className={inputClass} value={form.icon} onChange={event=>set({icon:event.target.value})}>{['bell','wallet','file','users','alert','mail','check','clock'].map(icon=><option key={icon} value={icon}>{icon}</option>)}</select></Field><Field label="Color" htmlFor="notification-category-color"><select id="notification-category-color" className={inputClass} value={form.color} onChange={event=>set({color:event.target.value})}>{Object.keys(CATEGORY_COLORS).map(color=><option key={color} value={color}>{color}</option>)}</select></Field><span className={'inline-flex items-center gap-2 rounded-full px-3 py-1 '+CATEGORY_COLORS[form.color]}><Icon name={form.icon} className="h-4 w-4"/>{form.label||'Category preview'}</span>{error&&<p className="nr-error" role="alert">{error}</p>}
  </Modal>}
  {deleting&&<Modal open title="Delete notification category?" onClose={()=>{if(!busy)setDeleting(null)}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</Button><Button variant="danger" disabled={busy} onClick={()=>mutate('category-delete',{value:deleting.value,version:deleting.version})}>{busy?'Deleting…':'Delete category'}</Button></>}><p>Remove “{categoryMeta(deleting.value).label}” from category choices? Existing notifications, read history, replies and rules will be retained.</p>{error&&<p className="nr-error" role="alert">{error}</p>}</Modal>}
 </section>
}
