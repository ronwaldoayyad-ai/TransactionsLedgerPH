// Trusted local companion only. Privileged Auth calls never reach the browser.
const crypto=require('node:crypto')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
module.exports=({db,active,localAuth})=>{
  const fields=`p.*,to_char(b.birth_date,'YYYY-MM-DD') as birth_date,coalesce(b.address,'') as address,coalesce(b.occupation,'') as occupation`
  async function actor(req){
    const lender=await active(req,true)
    const bearer=req.headers.authorization?.replace(/^Bearer /,'')
    let sessionId
    try{sessionId=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).session_id}catch{}
    if(!uuid.test(sessionId||''))throw Error('Sign in again before managing account access.')
    const live=await db.query('select 1 from auth.sessions where id=$1 and user_id=$2',[sessionId,lender.id])
    if(!live.rowCount)throw Error('Your session has ended. Sign in again.')
    return lender
  }
  function id(body){if(!uuid.test(body.userId||''))throw Error('Choose a borrower account.');return body.userId}
  async function read(userId,client=db){
    const {rows}=await client.query(`select ${fields} from public.profiles p left join public.borrower_preferences b on b.user_id=p.id where p.id=$1 and p.role='user'`,[userId])
    if(!rows[0])throw Error('Borrower account unavailable.')
    return rows[0]
  }
  async function details(req,body){await actor(req);return {profile:await read(id(body))}}
  function values(body){
    const patch=body.profile
    if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Complete the borrower details.')
    const allowed=['name','nickname','email','phone','birthDate','address','occupation']
    if(Object.keys(patch).some(key=>!allowed.includes(key)))throw Error('Unsupported profile field.')
    if(allowed.some(key=>typeof patch[key]!=='string'))throw Error('Complete the borrower profile fields.')
    const v=Object.fromEntries(allowed.map(key=>[key,typeof patch[key]==='string'?patch[key].trim():'']))
    v.email=v.email.toLowerCase()
    const digits=v.phone.replace(/\D/g,'')
    v.phone=!digits?'':digits.startsWith('63')&&digits.length===12?'+'+digits:digits.startsWith('0')&&digits.length===11?'+63'+digits.slice(1):digits.length===10?'+63'+digits:v.phone
    if(v.name.length<2||v.name.length>120||!/^\S+@\S+\.\S+$/.test(v.email)||v.email.length>254)throw Error('Enter a full legal name and valid email address.')
    if(v.phone&&!/^\+63[0-9]{10}$/.test(v.phone))throw Error('Enter a valid Philippine mobile number.')
    if(v.nickname.length>80||v.address.length>500||v.occupation.length>150)throw Error('A profile field exceeds its character limit.')
    if(v.birthDate){
      const date=new Date(v.birthDate+'T00:00:00Z')
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
      const today=parts.year+'-'+parts.month+'-'+parts.day
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.birthDate)||!Number.isFinite(date.valueOf())||date.toISOString().slice(0,10)!==v.birthDate||v.birthDate>today)throw Error('Enter a valid birth date that is not in the future.')
    }
    return v
  }
  async function save(req,body){
    const lender=await actor(req),userId=id(body),v=values(body),client=await db.connect()
    let oldEmail,emailChanged=false
    try{
      // Serializes admin edits without holding a profile row while Auth runs.
      await client.query('select pg_advisory_lock(hashtextextended($1,19))',[userId])
      await read(userId,client)
      const identity=await localAuth('admin/users/'+userId,'GET')
      oldEmail=identity.email
      if(v.email.toLowerCase()!==oldEmail.toLowerCase()){
        const duplicate=await client.query('select 1 from public.profiles where lower(email)=lower($1) and id<>$2',[v.email,userId])
        if(duplicate.rowCount)throw Error('That email address is already assigned to another account.')
        await localAuth('admin/users/'+userId,'PUT',{email:v.email,email_confirm:true})
        emailChanged=true
      }
      await client.query('begin')
      const current=(await client.query("select id from public.profiles where id=$1 and role='user' for update",[userId])).rows[0]
      if(!current)throw Error('Borrower account unavailable.')
      const first=v.name.split(/\s+/)[0],last=v.name.slice(first.length).trim()
      await client.query('update public.profiles set name=$2,first_name=$3,last_name=$4,nickname=$5,email=$6,phone=$7 where id=$1',[userId,v.name,first,last,v.nickname,v.email,v.phone])
      await client.query('insert into public.borrower_preferences(user_id,birth_date,address,occupation) values($1,$2,$3,$4) on conflict(user_id) do update set birth_date=excluded.birth_date,address=excluded.address,occupation=excluded.occupation,updated_at=now()',[userId,v.birthDate||null,v.address,v.occupation])
      const profile=await read(userId,client)
      await client.query('commit')
      return {saved:true,profile,actorId:lender.id}
    }catch(error){
      await client.query('rollback').catch(()=>{})
      if(emailChanged){
        try{await localAuth('admin/users/'+userId,'PUT',{email:oldEmail,email_confirm:true})}
        catch{throw Error('Sign-in email needs reconciliation. Reload this account before retrying.')}
      }
      throw error
    }finally{
      await client.query('select pg_advisory_unlock(hashtextextended($1,19))',[userId]).catch(()=>{})
      client.release()
    }
  }
  const passwordAttempts=new Map()
  async function password(req,body){
    const lender=await actor(req),userId=id(body)
    await read(userId)
    if(typeof body.password!=='string'||body.password.length<8||Buffer.byteLength(body.password,'utf8')>72)throw Error('Use at least 8 characters and no more than 72 UTF-8 bytes.')
    const now=Date.now(),previous=passwordAttempts.get(lender.id)
    const entry=!previous||previous.until<now?{count:0,until:now+60000}:previous
    if(entry.count>=10)throw Error('Please wait a minute before changing another password.')
    entry.count++;passwordAttempts.set(lender.id,entry)
    await localAuth('admin/users/'+userId,'PUT',{password:body.password})
    // The response and logs contain no password, hash or credential material.
    return {saved:true,userId,changeId:crypto.randomUUID()}
  }
  return {details,save,password}
}
