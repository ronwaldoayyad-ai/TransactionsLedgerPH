// Privileged Auth calls stay on the server; no credentials are returned.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail=(message,status=400)=>Object.assign(Error(message),{status})
module.exports=({db,active,localAuth})=>{
 async function actor(req){const a=await active(req,true);if(a.role!=='admin'||a.status!=='active')throw fail('An active lender is required.',403);return a}
 function target(body){if(!uuid.test(body.userId||''))throw fail('Choose a borrower account.');return body.userId}
 async function profile(client,id){const p=(await client.query("select id,email,status from public.profiles where id=$1 and role='user'",[id])).rows[0];if(!p)throw fail('Borrower account unavailable.',404);return p}
 async function identity(id,client=db){
  // Older invitations deliberately create profiles before Auth accounts. Missing
  // identity is a supported state, not an Auth-service failure.
  if(!(await client.query('select id from auth.users where id=$1',[id])).rows.length)return null
  const a=await localAuth('admin/users/'+id,'GET');if(a.id!==id)throw fail('This borrower has no matching sign-in identity.',409);return a
 }
 async function initializeIdentity(client,p){
  const collision=await client.query('select id from auth.users where lower(email)=lower($1) and id<>$2',[p.email,p.id])
  if(collision.rows.length)throw fail('This email belongs to another sign-in account. Contact support to reconcile it; no records were moved.',409)
  // Admin creation sends no invitation email and uses the existing profile ID.
  const a=await localAuth('admin/users','POST',{id:p.id,email:p.email,email_confirm:false})
  if(a.id!==p.id||a.email?.toLowerCase()!==p.email.toLowerCase())throw fail('Sign-in setup needs reconciliation. Reload access details before retrying.',409)
  return a
 }
 async function view(client,id){
  const p=await profile(client,id),a=await identity(id,client)
  const history=(await client.query("select id,action,reason,details,state,created_at,completed_at from mobile_private.borrower_access_events where user_id=$1 and action in ('status','confirm-email') order by created_at desc,id limit 10",[id])).rows
  return {userId:id,email:p.email,status:p.status,hasIdentity:!!a,emailConfirmedAt:a?.email_confirmed_at||null,pendingEmail:!!a?.email_change,history}
 }
 async function details(req,body){await actor(req);return view(db,target(body))}
 async function save(req,body){
  const lender=await actor(req),id=target(body)
  if(!['status','confirm-email'].includes(body.action)||!uuid.test(body.key||'')||body.reviewed!==true||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>2000)throw fail('Review the override and provide a reason of 10–2000 characters.')
  if(!['active','invited','disabled'].includes(body.expectedStatus)||typeof body.expectedEmail!=='string'||body.expectedEmail.length>254)throw fail('Refresh account access before saving.')
  if(body.action==='status'&&!['active','invited','disabled'].includes(body.status))throw fail('Choose Active, Invited or Disabled.')
  const details={email:body.expectedEmail,before:body.expectedStatus,after:body.action==='status'?body.status:'confirmed'}
  const client=await db.connect();let transaction=false
  try{
   // Share the lock used by borrower profile editing; Auth is never called while
   // holding a profile row lock, preventing Auth/profile trigger deadlocks.
   await client.query('select pg_advisory_lock(hashtextextended($1,19))',[id])
   const old=(await client.query('select * from mobile_private.borrower_access_events where id=$1',[body.key])).rows[0]
   if(old){
    if(old.user_id!==id||old.actor_id!==lender.id||old.action!==body.action||old.reason!==body.reason.trim()||Object.keys(details).some(k=>old.details[k]!==details[k]))throw fail('This request reference belongs to another override. Reload before retrying.',409)
    if(old.state==='completed')return {saved:true,...await view(client,id)}
   }
   const p=await profile(client,id);let auth=await identity(id,client)
   if(p.email!==body.expectedEmail||(auth&&auth.email?.toLowerCase()!==p.email.toLowerCase())||p.status!==body.expectedStatus)throw fail('Account details changed. Reload access controls before saving.',409)
   if(body.action==='confirm-email'&&auth?.email_change)throw fail('Resolve the pending email change before confirming this address.',409)
   await actor(req)
   let intent=!!old
   const needsIdentity=!auth&&(body.action==='confirm-email'||body.status==='active')
   if(needsIdentity){
    if(!intent){await client.query('insert into mobile_private.borrower_access_events(id,user_id,actor_id,action,reason,details) values($1,$2,$3,$4,$5,$6)',[body.key,id,lender.id,body.action,body.reason.trim(),JSON.stringify(details)]);intent=true}
    auth=await initializeIdentity(client,p)
   }
   if(body.action==='status'){
    if(p.status===body.status&&!intent)return {saved:true,...await view(client,id)}
    await client.query('begin');transaction=true
    if(!intent)await client.query("insert into mobile_private.borrower_access_events(id,user_id,actor_id,action,reason,details,state,completed_at) values($1,$2,$3,$4,$5,$6,'completed',now())",[body.key,id,lender.id,body.action,body.reason.trim(),JSON.stringify(details)])
    const changed=await client.query("update public.profiles set status=$2 where id=$1 and role='user' and status=$3 and email=$4",[id,body.status,p.status,p.email]);if(changed.rowCount!==1)throw fail('Account changed. Reload before saving.',409)
    if(intent)await client.query("update mobile_private.borrower_access_events set state='completed',completed_at=now() where id=$1",[body.key])
    await client.query('commit');transaction=false
   }else{
    if(!auth.email_confirmed_at){
     // Durable intent precedes the separate Auth service. A failed response stays
     // pending instead of falsely claiming that confirmation did not happen.
     if(!intent)await client.query('insert into mobile_private.borrower_access_events(id,user_id,actor_id,action,reason,details) values($1,$2,$3,$4,$5,$6)',[body.key,id,lender.id,body.action,body.reason.trim(),JSON.stringify(details)])
     const confirmed=await localAuth('admin/users/'+id,'PUT',{email_confirm:true})
     if(!confirmed.email_confirmed_at)throw fail('Confirmation could not be verified. Reload account access before retrying.',503)
    }else if(!old)return {saved:true,...await view(client,id)}
    await client.query("update mobile_private.borrower_access_events set state='completed',completed_at=now() where id=$1",[body.key])
   }
   return {saved:true,...await view(client,id)}
  }catch(e){if(transaction)await client.query('rollback').catch(()=>{});throw e}
  finally{await client.query('select pg_advisory_unlock(hashtextextended($1,19))',[id]).catch(()=>{});client.release()}
 }
 async function category(req,body){
  const lender=await actor(req)
  if(typeof body.loanId!=='string'||!body.loanId||body.loanId.length>200||!['cash_loan','retail_installment'].includes(body.category)||![null,'cash_loan','retail_installment'].includes(body.expectedCategory)||body.reviewed!==true||!uuid.test(body.key||'')||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>2000)throw fail('Choose an installment group, review its category and provide a reason.')
  const client=await db.connect()
  try{
   await client.query('begin')
   const loan=(await client.query("select id,user_id,loan_category from public.loans where id=$1 and txn_type<>'straight' for update",[body.loanId])).rows[0]
   if(!loan)throw fail('Installment group unavailable.',404)
   const old=(await client.query('select * from mobile_private.borrower_access_events where id=$1',[body.key])).rows[0]
   if(old){if(old.actor_id!==lender.id||old.action!=='loan-category'||old.user_id!==loan.user_id||old.details.loanId!==loan.id||old.details.after!==body.category||old.details.before!==body.expectedCategory||old.reason!==body.reason.trim())throw fail('This request reference belongs to another change.',409);await client.query('commit');return {saved:true,loanId:loan.id,category:loan.loan_category}}
   if(loan.loan_category!==body.expectedCategory)throw fail('The category changed. Refresh before saving.',409)
   if(loan.loan_category!==body.category){
    await client.query('update public.loans set loan_category=$2 where id=$1',[loan.id,body.category])
    await client.query("insert into mobile_private.borrower_access_events(id,user_id,actor_id,action,reason,details,state,completed_at) values($1,$2,$3,'loan-category',$4,$5,'completed',now())",[body.key,loan.user_id,lender.id,body.reason.trim(),JSON.stringify({loanId:loan.id,before:loan.loan_category,after:body.category})])
   }
   await client.query('commit');return {saved:true,loanId:loan.id,category:body.category}
  }catch(e){await client.query('rollback');throw e}finally{client.release()}
 }
 return {details,save,category}
}
