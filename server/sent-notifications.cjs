const crypto=require('node:crypto')
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const pattern=value=>{const text=String(value??'').trim().slice(0,200);return text?'%'+text.replace(/[\\%_]/g,'\\$&')+'%':''}
const SENT_SQL=`with matched as materialized (
 select n.id from public.notifications n
 left join mobile_private.notification_links l on l.notification_id=n.id
 left join mobile_private.notification_events e on e.id=n.event_id
 where ($1::boolean or n.archived_at is null)
 and ($2::text='' or n.title ilike $2 or n.body ilike $2)
 and (cardinality($3::uuid[])=0 or n.audience='all' or n.target_user_ids && $3::uuid[] or n.created_by=any($3::uuid[]) or e.actor_id=any($3::uuid[])
  or exists(select 1 from public.profiles b where b.id=any($3::uuid[]) and b.role='user' and
   (lower(b.email)=lower(l.payload->>'email') or lower(b.email)=lower(e.payload->>'email')
    or (nullif(b.borrower_account_number,'') is not null and (b.borrower_account_number=l.payload->>'account_number' or b.borrower_account_number=e.payload->>'account_number')))))
 and ($4::text='' or n.category::text=$4)
 and ($5::text='' or n.title ilike $5)
), page as (
 select n.id,n.category,n.title,n.body,n.audience,n.target_user_ids,n.created_by,n.created_at,n.archived_at,n.edited_at,
 n.rule_id,n.rule_version,n.event_id,n.delivery_surface,n.display_duration,n.xmin::text as edit_version,l.rule_id as linked_rule_id,l.event_type,l.provenance,
 (select count(*)::int from public.notification_reads r where r.notification_id=n.id) as read_count
 from public.notifications n join matched m on m.id=n.id left join mobile_private.notification_links l on l.notification_id=n.id
 order by n.created_at desc,n.id limit 50 offset $6
) select coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id) from page p),'[]'::jsonb) items,(select count(*)::int from matched) total`

function sentFilters(body={}){
 const ids=body.borrowerIds??[]
 if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!uuid(id)))throw Error('Choose valid borrower filters.')
 const category=String(body.category??'').trim();if(category.length>80)throw Error('Choose a valid notification category.')
 const value=Number(body.offset)
 return [body.includeArchived===true,pattern(body.query),[...new Set(ids)],category,pattern(body.subject),Number.isFinite(value)?Math.max(0,Math.min(100000,Math.floor(value))):0]
}
module.exports=({db,authorize})=>{
 const admin=async req=>{const user=await authorize(req);if(user.role!=='admin')throw Object.assign(Error('Only an active lender can manage sent notifications.'),{status:403});return user}
 async function sent(req,body){await admin(req);return (await db.query(SENT_SQL,sentFilters(body))).rows[0]}
 async function deleteSent(req,body){
  const user=await admin(req),ids=body.ids,expected=body.expected
  if(body.reviewed!==true||!uuid(body.key)||!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length)throw Error('Review between 1 and 50 selected notifications before deleting.')
  if(!Array.isArray(expected)||expected.length!==ids.length||expected.some(item=>!item||typeof item!=='object'||!uuid(item.id)||typeof item.version!=='string'||!/^\d+$/.test(item.version)||!ids.includes(item.id))||new Set(expected.map(item=>item.id)).size!==ids.length)throw Error('Refresh and review the selected notifications again.')
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({ids:[...ids].sort(),expected:[...expected].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex')
  const client=await db.connect()
  try{
   await client.query('begin')
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[user.id+body.key])
   const prior=(await client.query('select action,payload_hash,result from mobile_private.operation_keys where actor_id=$1 and key=$2',[user.id,body.key])).rows[0]
   if(prior){if(prior.action!=='notification-bulk-delete'||prior.payload_hash!==fingerprint)throw Error('Retry details changed. Close this review and select the notifications again.');await client.query('commit');return prior.result}
   const rows=(await client.query('select id,xmin::text as edit_version,archived_at from public.notifications where id=any($1::uuid[]) order by id for update',[ids])).rows
   if(rows.length!==ids.length||rows.some(row=>row.archived_at||expected.find(item=>item.id===row.id)?.version!==row.edit_version))throw Error('A selected notification changed or was deleted. Refresh and review the selection again.')
   await client.query('update public.notifications set archived_at=clock_timestamp(),edited_at=clock_timestamp() where id=any($1::uuid[])',[ids])
   await client.query("insert into mobile_private.notification_rule_audit(actor_id,operation,notification_id,detail) select $1,'notification.deleted',n.id,jsonb_build_object('batchKey',$2::text,'batchSize',$4::int,'audience',n.audience,'targets',n.target_user_ids) from public.notifications n where n.id=any($3::uuid[])",[user.id,body.key,ids,ids.length])
   const result={deleted:rows.length}
   await client.query('insert into mobile_private.operation_keys(actor_id,key,action,payload_hash,result) values($1,$2,$3,$4,$5)',[user.id,body.key,'notification-bulk-delete',fingerprint,result])
   await client.query('commit');return result
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 return {sent,deleteSent}
}
module.exports.SENT_SQL=SENT_SQL
module.exports.sentFilters=sentFilters
