// Called inside the event transaction: a failed batch rolls back with the event.
module.exports=async function planDeliveries(client,event,rule,action,recipients){
 for(let offset=0;offset<recipients.length;offset+=100){
  const ids=recipients.slice(offset,offset+100)
  const preferences=(await client.query('select user_id,ui_options from public.borrower_preferences where user_id=any($1::uuid[])',[ids])).rows
  const languages=new Map(preferences.map(row=>[row.user_id,row.ui_options?.language==='Filipino'?'Filipino':'English']))
  const values=[],parameters=[]
  for(const recipient of ids){
   const language=languages.get(recipient)||'English'
   if(action.language!=='all'&&action.language!==language)continue
   const start=parameters.length
   parameters.push(event.id,rule.id,rule.version,action.nodeId,recipient,action.channel,event.occurred_at,action.delay,action,language)
   const p=n=>'$'+(start+n)
   values.push(`(${p(1)},${p(2)},${p(3)},${p(4)},${p(5)},${p(6)},${p(7)}::timestamptz+(${p(8)}*interval '1 second'),${p(9)},${p(10)})`)
  }
  if(values.length)await client.query('insert into mobile_private.notification_deliveries(event_id,rule_id,rule_version,node_id,recipient_id,channel,due_at,action,language) values '+values.join(',')+' on conflict(event_id,rule_id,node_id,recipient_id) do nothing',parameters)
 }
}
