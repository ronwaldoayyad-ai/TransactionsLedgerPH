// Shared, data-only rule language. Never evaluates JavaScript, SQL or HTML.
export const EVENTS = [
 ['payment.proof_submitted','Proof submitted · borrower'],['payment.proof_submitted_admin','Proof submitted · lender'],
 ['payment.proof_approved','Proof approved'],['payment.proof_rejected','Proof rejected'],['payment.proof_pending','Proof reopened'],
 ['payment.recorded','Payment recorded'],['payment.due','Payment due / past due'],
 ['loan.submitted','Loan request submitted'],['loan.status_changed','Loan request status changed'],
 ['invoice.assigned','Statement assigned'],['disbursement.assigned','Disbursement ready'],
 ['disbursement.accepted','Disbursement accepted · lender'],['disbursement.accepted_copy','Accepted document · borrower'],
 ['support.submitted','Support submitted · lender'],['support.updated','Support status updated'],
 ['notification.reply','Borrower replied'],['notification.reaction','Borrower reacted'],
 ['notification.lender_reply','Lender replied'],['notification.lender_reaction','Lender reacted'],
 ['system.admin_notice','Other lender alert'],
 ['paw.welcome','Pawcheebels welcome'],['paw.reminder','Pawcheebels idle reminder'],
 ['popup.payment_submitted','Payment submission confirmation'],['popup.support_submitted','Support confirmation'],
 ['popup.login_code_invalid','Invalid Login Code'],['popup.password_invalid','Invalid email or password'],
 ['popup.login_locked','Sign-in locked'],['popup.login_error','Sign-in service error'],['ui.notice','Other app feedback'],
].map(([value,label])=>({value,label,presentation:/^(paw\.|popup\.|ui\.)/.test(value)}))
export const FIELDS = ['event_type','amount','status','method','reference','date','due_date','days_until_due','remaining_balance','funds_applied','remaining','locked','scope','phase','topic','message','original_title','original_body','name','email','account_number','note','period','language','source_id']
export const OPERATORS = ['equals','not_equals','contains','not_contains','greater','at_least','less','at_most','empty','not_empty','in']
export const CHANNELS = ['inbox','banner','paw','popup']
export const RECIPIENTS = ['source','actor','admins','all','selected']
export const emptyCondition = () => ({kind:'condition',field:'status',operator:'equals',value:''})
export const emptyGroup = () => ({kind:'group',mode:'all',children:[]})
const scalar=value=>value==null?'':typeof value==='object'?'':String(value)
export function conditionMatches(group,context,depth=0){
 if(depth>6)return false
 if(group?.kind==='group')return group.mode==='any'?group.children.some(child=>conditionMatches(child,context,depth+1)):group.children.every(child=>conditionMatches(child,context,depth+1))
 const value=context[group?.field],expected=group?.value
 const a=scalar(value).toLocaleLowerCase(),b=scalar(expected).toLocaleLowerCase()
 switch(group?.operator){
  case 'equals':return a===b
  case 'not_equals':return a!==b
  case 'contains':return a.includes(b)
  case 'not_contains':return !a.includes(b)
  case 'empty':return !a.trim()
  case 'not_empty':return !!a.trim()
  case 'in':return b.split(',').map(part=>part.trim()).includes(a)
  case 'greater':return a!==''&&b!==''&&Number.isFinite(Number(a))&&Number(a)>Number(b)
  case 'at_least':return a!==''&&b!==''&&Number.isFinite(Number(a))&&Number(a)>=Number(b)
  case 'less':return a!==''&&b!==''&&Number.isFinite(Number(a))&&Number(a)<Number(b)
  case 'at_most':return a!==''&&b!==''&&Number.isFinite(Number(a))&&Number(a)<=Number(b)
  default:return false
 }
}
function validateCondition(group,depth=0){
 if(depth>6)throw Error('Use at most six nested condition groups.')
 if(group?.kind==='group'){
  if(!['all','any'].includes(group.mode)||!Array.isArray(group.children)||group.children.length>20)throw Error('Complete the condition group.')
  group.children.forEach(child=>validateCondition(child,depth+1));return
 }
 if(group?.kind!=='condition'||!FIELDS.includes(group.field)||!OPERATORS.includes(group.operator)||scalar(group.value).length>500)throw Error('Choose a supported condition field and comparison.')
}
function validateText(text,max){
 if(typeof text!=='string'||text.length>max)throw Error('A message exceeds its character limit.')
 for(const token of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))if(!FIELDS.includes(token[1].trim()))throw Error('Unknown message variable: '+token[1])
}
export function validateGraph(graph){
 if(!Array.isArray(graph?.nodes)||!Array.isArray(graph?.edges)||graph.nodes.length<2||graph.nodes.length>32||graph.edges.length>64)throw Error('Use 2–32 connected blocks and at most 64 connections.')
 const ids=new Set(),nodes=new Map()
 for(const node of graph.nodes){
  if(!/^[\w-]{1,60}$/.test(node.id)||ids.has(node.id)||!['when','if','delay','send'].includes(node.type))throw Error('Each block needs a unique identifier and supported type.')
  ids.add(node.id);nodes.set(node.id,node)
  if(!Number.isFinite(node.x)||!Number.isFinite(node.y)||Math.abs(node.x)>5000||Math.abs(node.y)>5000)throw Error('A block position is outside the canvas.')
  const data=node.data||{}
  if(node.type==='when'&&!EVENTS.some(event=>event.value===data.event))throw Error('Choose an app event for every When block.')
  if(node.type==='when'&&data.event==='payment.due'&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.at||'09:00')))throw Error('Choose a valid Manila reminder time.')
  if(node.type==='if')validateCondition(data.condition)
  if(node.type==='delay'&&(!Number.isInteger(data.seconds)||data.seconds<0||data.seconds>2592000))throw Error('Delay must be between zero seconds and 30 days.')
  if(node.type==='send'){
   if(!CHANNELS.includes(data.channel)||!RECIPIENTS.includes(data.recipients)||typeof data.category!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(data.category))throw Error('Choose a delivery surface, audience and category.')
   if(!Array.isArray(data.userIds)||data.userIds.length>100||data.userIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))throw Error('Choose valid recipients.')
   if(data.recipients==='selected'&&!data.userIds.length)throw Error('Select at least one recipient.')
   if(!['all','English','Filipino'].includes(data.language))throw Error('Choose a message language.')
   validateText(data.title,160);validateText(data.body,4000);validateText(data.filipinoTitle||'',160);validateText(data.filipinoBody||'',4000)
   if(!data.body.trim())throw Error('Enter message text for every Send block.')
   if(!Number.isInteger(data.duration||10)||data.duration<1||data.duration>120)throw Error('Display duration must be 1–120 seconds.')
   if(!Number.isInteger(data.cooldown??0)||(data.cooldown??0)<0||(data.cooldown??0)>2592000)throw Error('Message spacing must be between zero seconds and 30 days.')
  }
 }
 const roots=graph.nodes.filter(node=>node.type==='when');if(!roots.length)throw Error('Add at least one When block.')
 const edges=new Set()
 for(const edge of graph.edges){
  const key=edge.from+':'+edge.port+':'+edge.to
  if(!ids.has(edge.from)||!ids.has(edge.to)||edge.from===edge.to||edges.has(key)||!['next','yes','no'].includes(edge.port))throw Error('Remove a duplicate or invalid connection.')
  if(nodes.get(edge.to).type==='when'||(nodes.get(edge.from).type==='if'?!['yes','no'].includes(edge.port):edge.port!=='next'))throw Error('Connect If outputs as Yes/No; other blocks use Next.')
  edges.add(key)
 }
 const active=new Set(),seen=new Set()
 function visit(id){if(active.has(id))throw Error('Loops are not allowed. Connect the flow in one direction.');if(seen.has(id))return;active.add(id);for(const edge of graph.edges.filter(item=>item.from===id))visit(edge.to);active.delete(id);seen.add(id)}
 roots.forEach(node=>visit(node.id));if(seen.size!==ids.size)throw Error('Connect every block to a When block.')
 for(const root of roots)if(EVENTS.find(event=>event.value===root.data.event)?.presentation){
  const reach=new Map();function check(id,delay=0){if(reach.has(id)&&reach.get(id)>=delay)return;reach.set(id,delay);const node=nodes.get(id);if(node.type==='delay')delay+=node.data.seconds;if(node.type==='send'){
   const paw=root.data.event.startsWith('paw.');
   if(node.data.channel==='inbox')throw Error('Screen events use a pop-up, banner or speech bubble. Choose a saved app event for inbox delivery.');
   if(paw&&node.data.channel!=='paw')throw Error('Pawcheebels welcome and idle events use speech bubbles. Choose a screen or saved app event for other delivery surfaces.');
   if(!paw&&node.data.channel==='paw')throw Error('Screen confirmations and errors use pop-ups or banners. Choose a Pawcheebels or saved app event for speech bubbles.');
   if(!paw&&delay>300)throw Error('Screen feedback can wait up to five minutes. Use a saved app event for longer follow-ups.');
  }graph.edges.filter(edge=>edge.from===id).forEach(edge=>check(edge.to,delay))}check(root.id)
 }
 if(!graph.nodes.some(node=>node.type==='send'))throw Error('Add a Send block.')
 const hasDestination=id=>nodes.get(id).type==='send'||graph.edges.filter(edge=>edge.from===id).some(edge=>hasDestination(edge.to))
 if(roots.some(node=>!hasDestination(node.id)))throw Error('Connect each event to at least one Send block.')
 return true
}
export function evaluateGraph(graph,eventType,context={},rootId=null){
 const map=new Map(graph.nodes.map(node=>[node.id,node])),actions=new Map(),visited=new Map()
 function walk(id,delay=0){
  if(visited.has(id)&&visited.get(id)<=delay)return;visited.set(id,delay)
  const node=map.get(id);if(!node)return
  let port='next'
  if(node.type==='if')port=conditionMatches(node.data.condition,{...context,event_type:eventType})?'yes':'no'
  if(node.type==='delay')delay+=node.data.seconds
  if(node.type==='send')actions.set(id,{...node.data,nodeId:id,delay:Math.min(2592000,delay)})
  for(const edge of graph.edges.filter(item=>item.from===id&&item.port===port))walk(edge.to,delay)
 }
 graph.nodes.filter(node=>node.type==='when'&&node.data.event===eventType&&(!rootId||node.id===rootId)).forEach(node=>walk(node.id))
 return [...actions.values()]
}
export function renderMessage(template,context={}){return String(template||'').replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>scalar(context[key.trim()]))}
export function messageFor(action,context={},language='English'){
 const filipino=language==='Filipino'
 return {title:renderMessage(filipino&&action.filipinoTitle?action.filipinoTitle:action.title,context),body:renderMessage(filipino&&action.filipinoBody?action.filipinoBody:action.body,context)}
}
export function newGraph(event='payment.proof_submitted',channel='inbox'){
 return {nodes:[{id:'when-1',type:'when',x:40,y:70,data:{event,at:'09:00'}},{id:'send-1',type:'send',x:380,y:70,data:{channel,recipients:'source',userIds:[],category:'payment',title:'Proof of Payment Submitted',body:'Your proof for {{amount}} has been submitted for review.',filipinoTitle:'Naisumite ang katibayan ng bayad',filipinoBody:'Naisumite ang iyong katibayan para sa {{amount}} at hinihintay ang pagsusuri.',duration:10,language:'all'}}],edges:[{from:'when-1',to:'send-1',port:'next'}]}
}
