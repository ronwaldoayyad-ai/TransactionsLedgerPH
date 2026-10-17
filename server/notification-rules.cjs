const crypto=require('node:crypto'),path=require('node:path'),{pathToFileURL}=require('node:url')
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value||'')
const corePromise=import(pathToFileURL(path.join(__dirname,'../public/notification-rule-core.js')).href)
module.exports=({db,active,wakeEnabled=true})=>{
 let running=false,listener=null,stopped=false,timer=null
 async function actor(req,admin=false){
  const user=await active(req,admin);let id
  try{id=JSON.parse(Buffer.from(req.headers.authorization.split('.')[1],'base64url')).session_id}catch{}
  if(!uuid(id)||!(await db.query('select 1 from auth.sessions where id=$1 and user_id=$2',[id,user.id])).rowCount)throw Error('Your session has ended. Sign in again.')
  return user
 }
 const audit=(client,user,operation,ruleId=null,notificationId=null,detail={})=>client.query('insert into mobile_private.notification_rule_audit(actor_id,operation,rule_id,notification_id,detail) values($1,$2,$3,$4,$5)',[user?.id||null,operation,ruleId,notificationId,detail])
 const revision=client=>client.query("insert into public.notification_change_signals(user_id) select id from public.profiles where status='active' on conflict(user_id) do update set revision=gen_random_uuid()")
 const categories=require('./notification-categories.cjs')({db,authorize:req=>actor(req,true),audit,revision})
 async function rules(client=db){return (await client.query('select * from mobile_private.notification_rules where deleted_at is null order by created_at,id')).rows}
 async function list(req,body={}){await actor(req,true);const result=await rules();const counts=(await db.query('select l.rule_id,count(*)::int as linked,count(*) filter(where n.archived_at is null)::int as visible from mobile_private.notification_links l join public.notifications n on n.id=l.notification_id group by l.rule_id')).rows;const deletedRules=body.includeDeleted===true?(await db.query('select id,name,version,deleted_at from mobile_private.notification_rules where deleted_at is not null order by deleted_at desc,id')).rows:undefined;return {rules:result.map(rule=>({...rule,...counts.find(count=>count.rule_id===rule.id)})),deletedRules,catalog:(await corePromise).EVENTS}}
 async function previewChange(client,rule,remove=false){
  const core=await corePromise,links=(await client.query('select l.*,n.archived_at,n.title,n.body,(select count(*)::int from public.notification_reads r where r.notification_id=n.id) as read_count from mobile_private.notification_links l join public.notifications n on n.id=l.notification_id where l.rule_id=$1 order by n.created_at desc',[rule.id])).rows
  const changes=links.map(link=>{
   const actions=!remove&&rule.enabled?core.evaluateGraph(rule.graph,link.event_type,link.payload,link.payload.schedule_root).filter(action=>['inbox','banner','popup','paw'].includes(action.channel)):[]
   const action=actions.find(item=>item.nodeId===link.node_id)||actions[0],message=action?core.messageFor(action,link.payload,link.language):null
   return {id:link.notification_id,read:link.read_count>0,archive:!message,nodeId:action?.nodeId,category:action?.category,invalid:!!message&&!message.body.trim(),title:message?.title||'',body:message?.body||'',oldTitle:link.title,oldBody:link.body,alreadyArchived:!!link.archived_at}
  })
  const pending=(await client.query("select count(*)::int as count from mobile_private.notification_deliveries where rule_id=$1 and status='waiting'",[rule.id])).rows[0].count;
  return {total:changes.length,read:changes.filter(item=>item.read).length,unread:changes.filter(item=>!item.read).length,updates:changes.filter(item=>!item.archive).length,archives:changes.filter(item=>item.archive&&!item.alreadyArchived).length,invalid:changes.filter(item=>item.invalid).length,pending,changes}
 }
 function validateRule(input){
  if(!input||typeof input.name!=='string'||!input.name.trim()||input.name.length>120||typeof input.enabled!=='boolean')throw Error('Enter a rule name and enabled state.')
  if(JSON.stringify(input.graph).length>80000)throw Error('The rule is too large.')
 }
 async function preview(req,body){await actor(req,true);const core=await corePromise;validateRule(body.rule);core.validateGraph(body.rule.graph);if(!body.rule.id)return {total:0,read:0,unread:0,updates:0,archives:0,changes:[]};if(!uuid(body.rule.id))throw Error('Choose a rule.');const result=await previewChange(db,body.rule,body.remove===true);return {...result,changes:result.changes.slice(0,5)}}
 async function save(req,body){
  const user=await actor(req,true),core=await corePromise;validateRule(body.rule);core.validateGraph(body.rule.graph)
  const client=await db.connect();try{
   await client.query('begin');const id=body.rule.id||crypto.randomUUID();if(!uuid(id))throw Error('Choose a rule.')
   const existing=(await client.query('select * from mobile_private.notification_rules where id=$1 for update',[id])).rows[0]
   if(existing&&(existing.deleted_at||existing.version!==body.rule.version))throw Error('This rule changed. Refresh it before saving.')
   if(!existing&&body.rule.id)throw Error('Rule unavailable.')
   await categories.validate(body.rule.graph,existing?.graph,client)
   const version=existing?existing.version+1:1
   const result=(await client.query('insert into mobile_private.notification_rules(id,name,enabled,version,graph,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6) on conflict(id) do update set name=excluded.name,enabled=excluded.enabled,version=excluded.version,graph=excluded.graph,updated_by=excluded.updated_by,updated_at=now() returning *',[id,body.rule.name.trim(),body.rule.enabled,version,body.rule.graph,user.id])).rows[0]
   await client.query('insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph,actor_id) values($1,$2,$3,$4,$5,$6)',[id,version,result.name,result.enabled,result.graph,user.id])
   let affected=0
   if(existing&&body.retroactive===true){const plan=await previewChange(client,result);if(plan.invalid)throw Error('Some linked messages would be empty. Add fallback text or save for future notifications only.');for(const change of plan.changes){
    if(change.archive)await client.query('update public.notifications set archived_at=coalesce(archived_at,now()),edited_at=now(),rule_version=$2 where id=$1',[change.id,version])
    else await client.query('update public.notifications set title=$2,body=$3,edited_at=now(),rule_version=$4,category=$5 where id=$1',[change.id,change.title,change.body,version,change.category])
    await client.query('update mobile_private.notification_links set rule_version=$2,node_id=coalesce($3,node_id) where notification_id=$1',[change.id,version,change.nodeId]);affected++
   }
    const pending=(await client.query("select d.*,e.event_type,e.payload,e.occurred_at from mobile_private.notification_deliveries d join mobile_private.notification_events e on e.id=d.event_id where d.rule_id=$1 and d.status='waiting' for update of d",[id])).rows;
    for(const job of pending){const actions=result.enabled?core.evaluateGraph(result.graph,job.event_type,job.payload,job.payload.schedule_root):[],action=actions.find(item=>item.nodeId===job.action.nodeId)||actions[0];if(!action){await client.query("update mobile_private.notification_deliveries set status='archived' where id=$1",[job.id]);continue}await client.query("update mobile_private.notification_deliveries set action=$2,rule_version=$3,channel=$4,due_at=$5::timestamptz+($6*interval '1 second') where id=$1",[job.id,action,version,action.channel,job.occurred_at,action.delay]);}
   }
   if(!result.enabled)await client.query("update mobile_private.notification_deliveries set status='archived' where rule_id=$1 and status='waiting'",[id]);
   await audit(client,user,'rule.saved',id,null,{version,retroactive:body.retroactive===true,affected});await revision(client);await client.query('commit');wake();return {rule:result,affected}
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function remove(req,body){const user=await actor(req,true);if(!uuid(body.id))throw Error('Choose a rule.');const client=await db.connect();try{
  await client.query('begin');const rule=(await client.query('select * from mobile_private.notification_rules where id=$1 and deleted_at is null for update',[body.id])).rows[0];if(!rule||rule.version!==body.version)throw Error('Rule changed or unavailable. Refresh and retry.')
  const changed=await client.query('update mobile_private.notification_rules set deleted_at=now(),enabled=false,updated_by=$2,updated_at=now() where id=$1',[body.id,user.id]);let affected=0
  if(body.retroactive===true)affected=(await client.query('update public.notifications n set archived_at=coalesce(n.archived_at,now()),edited_at=now() from mobile_private.notification_links l where l.notification_id=n.id and l.rule_id=$1 and n.archived_at is null',[body.id])).rowCount
  await client.query("update mobile_private.notification_deliveries set status='archived' where rule_id=$1 and status='waiting'",[body.id]);await audit(client,user,'rule.deleted',body.id,null,{affected});await revision(client);await client.query('commit');return {deleted:changed.rowCount>0,affected}
 }catch(error){await client.query('rollback');throw error}finally{client.release()}}
 async function restore(req,body){
  const user=await actor(req,true);if(!uuid(body.id)||!Number.isInteger(body.version)||body.version<1)throw Error('Choose a deleted rule.')
  const client=await db.connect();try{
   await client.query('begin');const previous=(await client.query('select * from mobile_private.notification_rules where id=$1 for update',[body.id])).rows[0]
   if(!previous?.deleted_at||previous.version!==body.version)throw Error('This rule changed or was already restored. Refresh the rules and try again.')
   // Recovery never replays old deliveries or silently resumes future sends.
   const rule=(await client.query('update mobile_private.notification_rules set deleted_at=null,enabled=false,version=version+1,updated_by=$2,updated_at=now() where id=$1 returning *',[body.id,user.id])).rows[0]
   await client.query('insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph,actor_id) values($1,$2,$3,$4,$5,$6)',[rule.id,rule.version,rule.name,rule.enabled,rule.graph,user.id])
   await audit(client,user,'rule.restored',rule.id,null,{version:rule.version,deletedAt:previous.deleted_at,enabled:false});await revision(client);await client.query('commit');return {rule}
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function activity(req,body){await actor(req,true);const limit=50,offset=Math.max(0,Math.min(10000,Number(body.offset)||0));return {events:(await db.query('select id,event_type,occurred_at,processed_at,tries,last_error from mobile_private.notification_events order by occurred_at desc limit $1 offset $2',[limit,offset])).rows,deliveries:(await db.query('select id,rule_id,node_id,channel,due_at,status,last_error,delivered_at from mobile_private.notification_deliveries order by due_at desc limit 50')).rows,audit:(await db.query('select id,operation,rule_id,notification_id,detail,created_at from mobile_private.notification_rule_audit order by id desc limit 50')).rows}}
 async function retry(req,body){const user=await actor(req,true);if(!uuid(body.id))throw Error('Choose an event or delivery.');if(body.delivery)await db.query("update mobile_private.notification_deliveries set tries=0,due_at=now(),last_error=null where id=$1 and status='waiting'",[body.id]);else await db.query('update mobile_private.notification_events set tries=0,retry_at=now(),last_error=null where id=$1 and processed_at is null',[body.id]);await audit(db,user,body.delivery?'delivery.retry':'event.retry',null,null,{id:body.id});wake();return {queued:true}}
 async function sent(req,body){await actor(req,true);const offset=Math.max(0,Math.min(100000,Number(body.offset)||0)),query=String(body.query||'').slice(0,200);return {items:(await db.query("select n.*,l.rule_id as linked_rule_id,l.event_type,l.provenance,(select count(*)::int from public.notification_reads r where r.notification_id=n.id) as read_count from public.notifications n left join mobile_private.notification_links l on l.notification_id=n.id where ($1 or n.archived_at is null) and (n.title ilike $2 or n.body ilike $2) order by n.created_at desc,n.id limit 50 offset $3",[body.includeArchived===true,'%'+query+'%',offset])).rows}}
 async function sentEdit(req,body){const user=await actor(req,true);if(!uuid(body.id))throw Error('Choose a notification.');const value=body.notification;if(typeof value?.body!=='string'||!value.body.trim()||value.body.length>20000||typeof value.title!=='string'||value.title.length>500)throw Error('Enter a title and message within their limits.');const client=await db.connect();try{
  await client.query('begin');const item=(await client.query('select * from public.notifications where id=$1 for update',[body.id])).rows[0];if(!item)throw Error('Notification unavailable.')
  // Existing audience/attachment edits remain available, validated with the same bounds.
  const audience=value.audience||item.audience,targets=value.targetUserIds||item.target_user_ids,attachments=value.attachments||item.attachments,category=value.category||item.category
  if(!['all','targeted'].includes(audience)||!Array.isArray(targets)||targets.length>100||targets.some(id=>!uuid(id))||!Array.isArray(attachments)||JSON.stringify(attachments).length>12000000||!(await client.query('select 1 from public.notification_categories where value=$1',[category])).rowCount)throw Error('Invalid notification details.')
  await client.query('update public.notifications set title=$2,body=$3,category=$4,audience=$5,target_user_ids=$6,attachments=$7,edited_at=now() where id=$1',[body.id,value.title,value.body,category,audience,audience==='all'?[]:targets,JSON.stringify(attachments)]);await audit(client,user,'notification.edited',null,body.id);await client.query('commit');return {saved:true}
 }catch(error){await client.query('rollback');throw error}finally{client.release()}}
 async function archive(req,body){const user=await actor(req,true);if(!uuid(body.id))throw Error('Choose a notification.');const client=await db.connect();try{await client.query('begin');const r=await client.query('update public.notifications set archived_at=case when $2 then null else coalesce(archived_at,now()) end,edited_at=now() where id=$1 returning id',[body.id,body.restore===true]);if(!r.rowCount)throw Error('Notification unavailable.');await audit(client,user,body.restore?'notification.restored':'notification.archived',null,body.id);await client.query('commit');return {saved:true}}catch(error){await client.query('rollback');throw error}finally{client.release()}}
 async function link(req,body){
  const user=await actor(req,true),core=await corePromise;if(body.reviewed!==true)throw Error('Review the source values before linking.');if(!uuid(body.id)||!uuid(body.ruleId)||!core.EVENTS.some(event=>event.value===body.eventType&&!event.presentation))throw Error('Choose a notification, rule and saved app event.')
  const payload=body.payload||{};if(typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>10000||Object.keys(payload).some(key=>!core.FIELDS.includes(key)))throw Error('Use only the listed event fields.')
  const client=await db.connect();try{await client.query('begin');const item=(await client.query('select * from public.notifications where id=$1 for update',[body.id])).rows[0],rule=(await client.query('select * from mobile_private.notification_rules where id=$1 and deleted_at is null',[body.ruleId])).rows[0];if(!item||!rule)throw Error('Notification or rule unavailable.')
   if((await client.query('select 1 from mobile_private.notification_links where notification_id=$1',[body.id])).rowCount)throw Error('This notification is already linked.')
   const context={...payload,original_title:item.title,original_body:item.body,event_type:body.eventType},action=core.evaluateGraph(rule.graph,body.eventType,context).find(action=>['inbox','banner','popup','paw'].includes(action.channel));if(!action)throw Error('The reviewed values do not match an inbox/banner action in this rule.')
   if(!core.messageFor(action,context).body.trim())throw Error('The reviewed values leave this message empty. Add the captured values or update the rule.');
   await client.query('insert into mobile_private.notification_links(notification_id,rule_id,rule_version,node_id,event_type,payload,provenance,linked_by) values($1,$2,$3,$4,$5,$6,\'manual_review\',$7)',[item.id,rule.id,rule.version,action.nodeId,body.eventType,context,user.id]);await client.query('update public.notifications set rule_id=$2,rule_version=$3 where id=$1',[item.id,rule.id,rule.version]);await audit(client,user,'notification.linked',rule.id,item.id,{eventType:body.eventType,provenance:'manual_review'});await client.query('commit');return {linked:true}
  }catch(error){await client.query('rollback');throw error}finally{client.release()}
 }
 async function unlink(req,body){const user=await actor(req,true);if(!uuid(body.id))throw Error('Choose a notification.');const client=await db.connect();try{await client.query('begin');const previous=(await client.query('delete from mobile_private.notification_links where notification_id=$1 returning *',[body.id])).rows[0];if(!previous)throw Error('This notification is not linked.');await client.query('update public.notifications set rule_id=null,rule_version=null where id=$1',[body.id]);await audit(client,user,'notification.unlinked',previous.rule_id,body.id,{previous});await client.query('commit');return {unlinked:true}}catch(error){await client.query('rollback');throw error}finally{client.release()}}
 async function presentation(req){
  let user=null;if(req.headers.authorization)user=await actor(req)
  const all=await rules(),core=await corePromise,guest=new Set(['popup.login_code_invalid','popup.password_invalid','popup.login_locked','popup.login_error','popup.support_submitted','ui.notice'])
  const result=[]
  for(const rule of all){const roots=rule.graph.nodes.filter(node=>node.type==='when'&&core.EVENTS.some(event=>event.value===node.data.event&&event.presentation)&& (user||guest.has(node.data.event)));if(!roots.length)continue
   // The browser receives presentation copy only; never other recipients or inbox content.
   const graph=structuredClone(rule.graph),reachable=new Set();function mark(id){if(reachable.has(id))return;reachable.add(id);graph.edges.filter(edge=>edge.from===id).forEach(edge=>mark(edge.to))}roots.forEach(root=>mark(root.id));graph.nodes=graph.nodes.filter(node=>reachable.has(node.id));graph.edges=graph.edges.filter(edge=>reachable.has(edge.from)&&reachable.has(edge.to));const send=graph.nodes.filter(node=>node.type==='send')
   for(const node of send){const d=node.data;const eligible=d.recipients!=='selected'||(user&&d.userIds.includes(user.id));if(!eligible||d.channel==='inbox'||d.recipients==='admins'&&user?.role!=='admin'){d.body='';d.title='';d.hidden=true}d.userIds=[]}
   result.push({id:rule.id,name:rule.name,version:rule.version,enabled:rule.enabled,graph:{...graph,nodes:graph.nodes.map(node=>node.type==='when'&&!roots.some(root=>root.id===node.id)?{...node,data:{...node.data,event:'__unavailable__'}}:node)}})
  }
  return {rules:result}
 }
 async function emit(req,body){
  const user=await actor(req),core=await corePromise
  if(!uuid(body.key)||!core.EVENTS.some(event=>event.value===body.eventType&&!event.presentation))throw Error('Choose a supported app event.')
  const message=body.notification||{};if(typeof message.body!=='string'||!message.body.trim()||message.body.length>20000||String(message.title||'').length>500)throw Error('Invalid event message.')
  let targets=message.targetUserIds||[],audience=message.audience||'targeted'
  if(user.role!=='admin'){
   if(body.eventType==='disbursement.accepted_copy'){
    const result=await db.query("select to_jsonb(d) as data from public.loan_disbursements d where id=$1",[body.payload?.source_id]);const d=result.rows[0]?.data
    if(!d||d.user_id!==user.id||!d.acknowledged_at)throw Error('Accepted document unavailable.');targets=[user.id];audience='targeted'
   }else if(['notification.reply','notification.reaction'].includes(body.eventType)){
    if(!uuid(body.payload?.source_id)||!(await db.query("select 1 from public.notifications where id=$1 and archived_at is null and (audience='all' or $2=any(target_user_ids))",[body.payload.source_id,user.id])).rowCount)throw Error('Notification unavailable.')
    targets=(await db.query("select id from public.profiles where role='admin' and status='active'")).rows.map(row=>row.id);audience='targeted'
   }else throw Error('Only a lender can publish this event.')
  }
  if(!['targeted','all'].includes(audience)||!Array.isArray(targets)||targets.length>100||targets.some(id=>!uuid(id)))throw Error('Invalid event recipients.')
  const data=body.payload||{};if(typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!core.FIELDS.includes(key))||JSON.stringify(data).length>15000)throw Error('Invalid event fields.')
  const attachments=message.attachments||[];if(!Array.isArray(attachments)||JSON.stringify(attachments).length>12000000)throw Error('Attachments are too large.')
  const subject=(await db.query("select to_jsonb(p) as data from public.profiles p where p.role='user' and (p.id=any($1::uuid[]) or p.id=$2) order by case when p.id=any($1::uuid[]) then 0 else 1 end limit 1",[targets,user.id])).rows[0]?.data;
  const identity=subject?{name:subject.nickname||subject.first_name||subject.name,email:subject.email,account_number:subject.borrower_account_number}:{};
  const result=await db.query('insert into mobile_private.notification_events(event_type,event_key,actor_id,source_targets,source_audience,payload,attachments) values($1,$2,$3,$4,$5,$6,$7) on conflict(event_key) do nothing returning id',[body.eventType,'client:'+body.key,user.id,targets,audience,{...data,...identity,original_title:message.title||'',original_body:message.body,category:message.category||'general'},JSON.stringify(attachments)]);wake();return {queued:true,id:result.rows[0]?.id||null}
 }
 async function recipients(action,event,client){
  if(action.recipients==='admins')return (await client.query("select id from public.profiles where role='admin' and status='active'")).rows.map(row=>row.id)
  if(action.recipients==='all'||action.recipients==='source'&&event.source_audience==='all')return (await client.query("select id from public.profiles where role='user' and status='active'")).rows.map(row=>row.id)
  const ids=action.recipients==='actor'?[event.actor_id]:action.recipients==='selected'?action.userIds:event.source_targets
  return (await client.query("select id from public.profiles where id=any($1::uuid[]) and status='active'",[ids.filter(uuid)])).rows.map(row=>row.id)
 }
 async function work({strict=false}={}){
  if(running||stopped)return;running=true;const client=await db.connect().catch(()=>null);if(!client){running=false;if(strict)throw Error('Notification database unavailable.');return}
  try{
   const core=await corePromise
   for(let index=0;index<20;index++){
    await client.query('begin');const event=(await client.query('select * from mobile_private.notification_events where processed_at is null and tries<8 and retry_at<=now() order by occurred_at for update skip locked limit 1')).rows[0]
    if(!event){await client.query('commit');break}
    try{
     for(const rule of await rules(client))if(rule.enabled&&(!event.payload.schedule_rule||event.payload.schedule_rule===rule.id))for(const action of core.evaluateGraph(rule.graph,event.event_type,event.payload,event.payload.schedule_root)){
      if(!['inbox','banner','popup','paw'].includes(action.channel))continue
      for(const recipient of await recipients(action,event,client)){
       const preference=(await client.query('select ui_options from public.borrower_preferences where user_id=$1',[recipient])).rows[0]
       const language=preference?.ui_options?.language==='Filipino'?'Filipino':'English'
       if(action.language!=='all'&&action.language!==language)continue
       await client.query("insert into mobile_private.notification_deliveries(event_id,rule_id,rule_version,node_id,recipient_id,channel,due_at,action,language) values($1,$2,$3,$4,$5,$6,$7::timestamptz+($8*interval '1 second'),$9,$10) on conflict(event_id,rule_id,node_id,recipient_id) do nothing",[event.id,rule.id,rule.version,action.nodeId,recipient,action.channel,event.occurred_at,action.delay,action,language])
      }
     }
     await client.query('update mobile_private.notification_events set processed_at=now(),last_error=null where id=$1',[event.id]);await client.query('commit')
    }catch{await client.query('rollback');await client.query("update mobile_private.notification_events set tries=tries+1,retry_at=now()+interval '1 minute',last_error='Delivery planning failed. Review the rule and retry.' where id=$1",[event.id])}
   }
   for(let index=0;index<40;index++){
    await client.query('begin');const job=(await client.query("select d.*,e.event_type,e.payload,e.attachments,e.actor_id from mobile_private.notification_deliveries d join mobile_private.notification_events e on e.id=d.event_id where d.status='waiting' and d.due_at<=now() and d.tries<8 order by d.due_at for update of d skip locked limit 1")).rows[0]
    if(!job){await client.query('commit');break}
    try{
     const rule=(await client.query('select * from mobile_private.notification_rules where id=$1 and deleted_at is null',[job.rule_id])).rows[0]
     const action=rule?.enabled?job.action:null
     const profile=(await client.query("select 1 from public.profiles where id=$1 and status='active'",[job.recipient_id])).rowCount
     if(!action||!profile){await client.query("update mobile_private.notification_deliveries set status='archived' where id=$1",[job.id]);await client.query('commit');continue}
     await client.query('select pg_advisory_xact_lock(hashtextextended($1,73))',[rule.id+':'+action.nodeId+':'+job.recipient_id])
     if(action.cooldown>0&&(await client.query("select 1 from mobile_private.notification_deliveries where rule_id=$1 and node_id=$2 and recipient_id=$3 and status='delivered' and delivered_at>now()-($4*interval '1 second') limit 1",[rule.id,action.nodeId,job.recipient_id,action.cooldown])).rowCount){await client.query("update mobile_private.notification_deliveries set status='suppressed',last_error=null where id=$1",[job.id]);await client.query('commit');continue}
     const message=core.messageFor(action,job.payload,job.language);if(!message.body.trim())throw Error('Empty rendered message.')
     await client.query("select set_config('app.notification_engine','on',true)")
     const notification=(await client.query("insert into public.notifications(category,title,body,audience,target_user_ids,attachments,created_by,rule_id,rule_version,event_id,delivery_surface,display_duration) values($1,$2,$3,'targeted',array[$4::uuid],$5,$6,$7,$8,$9,$10,$11) returning id",[action.category,message.title,message.body,job.recipient_id,JSON.stringify(job.attachments),job.actor_id,rule.id,job.rule_version,job.event_id,action.channel,action.duration||10])).rows[0]
     await client.query('insert into mobile_private.notification_links(notification_id,rule_id,rule_version,node_id,event_type,payload,language) values($1,$2,$3,$4,$5,$6,$7)',[notification.id,rule.id,job.rule_version,action.nodeId,job.event_type,job.payload,job.language]);await client.query("update mobile_private.notification_deliveries set status='delivered',notification_id=$2,delivered_at=now(),last_error=null where id=$1",[job.id,notification.id]);await client.query('commit')
    }catch{await client.query('rollback');await client.query("update mobile_private.notification_deliveries set tries=tries+1,due_at=now()+interval '1 minute',last_error='Delivery failed. It will be retried.' where id=$1",[job.id])}
   }
   await schedule(client)
  }catch(error){await client.query('rollback').catch(()=>{});if(strict)throw error;console.error('Notification worker pass failed; queued events retained.');}finally{client.release();running=false}
 }
 async function schedule(client){
  const core=await corePromise,now=new Date(),parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value])),date=parts.year+'-'+parts.month+'-'+parts.day,time=parts.hour+':'+parts.minute
  const activeRules=(await rules(client)).filter(rule=>rule.enabled&&rule.graph.nodes.some(node=>node.type==='when'&&node.data.event==='payment.due'&&(node.data.at||'09:00')<=time));if(!activeRules.length)return
  await client.query('begin');const acquired=(await client.query("select pg_try_advisory_xact_lock(hashtextextended('notification-schedule',72)) as acquired")).rows[0].acquired;if(!acquired){await client.query('rollback');return}
  const key='due:'+date,last=(await client.query('select value from mobile_private.notification_rule_state where key=$1',[key])).rows[0]
  const signature=activeRules.flatMap(rule=>rule.graph.nodes.filter(node=>node.type==='when'&&node.data.event==='payment.due'&&(node.data.at||'09:00')<=time).map(node=>rule.id+':'+rule.version+':'+node.id)).sort().join('|');if(last?.value===signature){await client.query('commit');return}
  const rows=(await client.query("select to_jsonb(t) as data from public.transactions t join public.profiles p on p.id=t.user_id where p.status='active' and t.status in ('unpaid','past_due') and t.due_date is not null")).rows
  for(const row of rows){const t=row.data,days=Math.round((Date.parse(t.due_date+'T00:00:00+08:00')-Date.parse(date+'T00:00:00+08:00'))/86400000),payload={amount:t.amount,status:t.status,due_date:t.due_date,days_until_due:days,reference:t.reference||'',source_id:t.id,original_title:'Payment Due Reminder',original_body:'A payment is due. Review your payment schedule.'};
   // Version-specific schedule event keys prevent repeated reminders from browser activity.
   for(const rule of activeRules)for(const root of rule.graph.nodes.filter(node=>node.type==='when'&&node.data.event==='payment.due'&&(node.data.at||'09:00')<=time))if(core.evaluateGraph(rule.graph,'payment.due',payload,root.id).length)await client.query("insert into mobile_private.notification_events(event_type,event_key,source_targets,payload) values('payment.due',$1,array[$2::uuid],$3) on conflict(event_key) do nothing",['schedule:'+date+':'+rule.id+':'+root.id+':'+t.id,t.user_id,{...payload,schedule_rule:rule.id,schedule_root:root.id}])
  }
  await client.query('insert into mobile_private.notification_rule_state(key,value) values($1,$2) on conflict(key) do update set value=excluded.value',[key,signature]);await client.query('commit')
 }
 function wake(){if(wakeEnabled&&!stopped)setTimeout(work,50).unref()}
 async function start(){
  if(stopped||timer)return;timer=setInterval(work,15000);timer.unref();wake()
  try{listener=await db.connect();await listener.query('listen loanledger_notification_event');listener.on('notification',wake);listener.on('error',()=>{listener?.release(true);listener=null})}catch{listener?.release(true);listener=null}
 }
 function stop(){stopped=true;clearInterval(timer);if(listener){const old=listener;listener=null;old.query('unlisten loanledger_notification_event').finally(()=>old.release())}}
 return {list,preview,save,remove,restore,activity,retry,sent,sentEdit,archive,link,unlink,presentation,emit,start,stop,wake,runOnce:()=>work({strict:true}),categories:categories.list,categorySave:categories.save,categoryDelete:categories.remove}
}
