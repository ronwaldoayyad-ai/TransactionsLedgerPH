// Event-driven, borrower-scoped invalidation. No recurring polling or app reload.
export function subscribeToInvalidations({client,name,table,ownerId,isAdmin,onChange,onError=()=>{},delay=80}) {
 let stopped=false,timer=null,running=false,dirty=false
 async function flush(){
  timer=null
  if(stopped||running)return
  running=true;dirty=false
  try{await onChange()}catch(error){if(!stopped)onError(error)}
  finally{running=false;if(dirty&&!stopped)schedule()}
 }
 function schedule(){if(stopped)return;dirty=true;if(!running&&!timer)timer=setTimeout(flush,delay)}
 const filter={event:'*',schema:'public',table,...(!isAdmin?{filter:'borrower_id=eq.'+ownerId}:{})}
 const channel=client.channel(name).on('postgres_changes',filter,schedule).subscribe(status=>{
  if(status==='SUBSCRIBED')schedule() // Reconcile the initial join and reconnect gaps.
  else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')onError(Error('Live updates are reconnecting.'))
 })
 return ()=>{stopped=true;if(timer)clearTimeout(timer);client.removeChannel(channel)}
}
