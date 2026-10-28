// Invoked through the rule service's active-admin and live-session gate.
const icons=['bell','wallet','file','users','alert','mail','check','clock']
const colors=['slate','blue','emerald','violet','amber','rose']
const slug=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(value)
module.exports=({db,authorize,audit,revision})=>{
 async function list(req){await authorize(req);return {categories:(await db.query('select * from public.notification_categories order by deleted_at nulls first,lower(label),value')).rows}}
 async function save(req,body){
  const user=await authorize(req),value=body.value,label=typeof body.label==='string'?body.label.trim():'',filipino=typeof body.filipinoLabel==='string'?body.filipinoLabel.trim():''
  if(!slug(value)||label.length<2||label.length>60||filipino.length>60||!icons.includes(body.icon)||!colors.includes(body.color))throw Error('Complete the category name, icon and color. Use 2–60 characters for its name.')
  const client=await db.connect()
  try{
   await client.query('begin')
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['notification-category:'+value])
   const old=(await client.query('select * from public.notification_categories where value=$1 for update',[value])).rows[0]
   if(old&&body.version==null)throw Error('That category identifier already exists. Choose another name.')
   if(old&&(!Number.isInteger(body.version)||old.version!==body.version||old.deleted_at))throw Error('This category changed or was deleted. Refresh the categories before saving.')
   if(!old&&body.version!=null)throw Error('Category unavailable. Refresh the categories.')
   const row=(await client.query(`insert into public.notification_categories(value,label,filipino_label,icon,color,updated_by)
    values($1,$2,$3,$4,$5,$6) on conflict(value) do update set label=excluded.label,filipino_label=excluded.filipino_label,icon=excluded.icon,color=excluded.color,version=notification_categories.version+1,updated_at=now(),updated_by=excluded.updated_by returning *`,[value,label,filipino,body.icon,body.color,user.id])).rows[0]
   await audit(client,user,old?'category.edited':'category.created',null,null,{value,before:old?{label:old.label,filipinoLabel:old.filipino_label,icon:old.icon,color:old.color}:null,after:{label,filipinoLabel:filipino,icon:body.icon,color:body.color}})
   await revision(client);await client.query('commit');return {category:row}
  }catch(error){await client.query('rollback');if(error.code==='23505')throw Error('A category with that identifier already exists. Choose another name or refresh the list.');throw error}finally{client.release()}
 }
 async function remove(req,body){
  const user=await authorize(req)
  if(!slug(body.value)||!Number.isInteger(body.version))throw Error('Choose a category to delete.')
  if(body.value==='general')throw Error('General is the fallback category and cannot be deleted.')
  const client=await db.connect()
  try{
   await client.query('begin')
   const row=(await client.query('update public.notification_categories set deleted_at=now(),version=version+1,updated_at=now(),updated_by=$3 where value=$1 and version=$2 and deleted_at is null returning *',[body.value,body.version,user.id])).rows[0]
   if(!row)throw Error('This category changed or was deleted. Refresh the categories.')
   await audit(client,user,'category.deleted',null,null,{value:row.value,label:row.label,preserveExisting:true});await revision(client);await client.query('commit');return {deleted:true}
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function validate(graph,previous,client=db){
  const values=[...new Set(graph.nodes.filter(n=>n.type==='send').map(n=>n.data.category))]
  const allowed=new Set((await client.query('select value from public.notification_categories where value=any($1::text[]) and deleted_at is null',[values])).rows.map(row=>row.value))
  const retained=new Set((previous?.nodes||[]).filter(n=>n.type==='send').map(n=>n.data.category))
  if(values.some(value=>!allowed.has(value)&&!retained.has(value)))throw Error('Choose an available category. Deleted categories are retained only on existing rules.')
 }
 return {list,save,remove,validate}
}
