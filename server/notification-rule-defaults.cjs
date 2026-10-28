module.exports=async function seedNotificationRules(db,core){
 for(const event of core.EVENTS)await db.query('insert into mobile_private.notification_event_catalog(event_type,label,presentation) values($1,$2,$3) on conflict(event_type) do update set label=excluded.label,presentation=excluded.presentation',[event.value,event.label,event.presentation])
 if((await db.query("select 1 from mobile_private.notification_rule_state where key='defaults-v1'")).rowCount)return
 const defaults=[
  ['payment.proof_submitted','Proof of Payment Submitted','Your proof of payment for PHP {{amount}} has been submitted for review.'],
  ['payment.proof_submitted_admin','Payment proof submitted','{{original_body}}'],
  ['payment.proof_approved','Payment proof verified','{{original_body}}'],
  ['payment.proof_rejected','Payment proof needs correction','{{original_body}}'],
  ['payment.proof_pending','Payment proof reopened','{{original_body}}'],
  ['payment.recorded','{{original_title}}','{{original_body}}'],
  ['loan.submitted','Loan Request Received',"We have received your loan request for PHP {{amount}}. Your lender will review it and update you."],
  ['loan.status_changed','{{original_title}}','{{original_body}}'],
  ['invoice.assigned','Statement Ready','{{original_body}}'],
  ['disbursement.assigned','Loan Disbursement Ready','{{original_body}}'],
  ['disbursement.accepted','Loan Disbursement Accepted','{{original_body}}'],
  ['disbursement.accepted_copy','Loan Disbursement Accepted','{{original_body}}'],
  ['support.submitted','{{original_title}}','{{original_body}}'],['support.updated','Support ticket updated','{{original_body}}'],
  ['notification.reply','{{original_title}}','{{original_body}}'],['notification.reaction','{{original_title}}','{{original_body}}'],
  ['notification.lender_reply','{{original_title}}','{{original_body}}'],['notification.lender_reaction','{{original_title}}','{{original_body}}'],
  ['system.admin_notice','{{original_title}}','{{original_body}}'],
  ['paw.welcome','Pawcheebels','Hi! I’m Pawcheebels. Need help finding your way around?','paw',2],
  ['paw.reminder','Pawcheebels','You can chat with me anytime. For account-specific concerns, I’ll point you to your lender.','paw',120],
  ['popup.payment_submitted','Proof of Payment Submitted!','Your submission is being verified.','popup'],
  ['popup.support_submitted','Support Request Submitted!','Your support team can now review your request.','popup'],
  ['popup.login_code_invalid','Invalid Login Code','{{original_body}}','popup'],
  ['popup.password_invalid','Invalid Email or Password','{{original_body}}','popup'],
  ['popup.login_locked','Sign-in Locked','{{original_body}}','popup'],
  ['popup.login_error','Unable to Sign In','{{original_body}}','popup'],
  ['ui.notice','Notice','{{message}}','banner'],
 ]
 defaults.push(
  ['paw.welcome','Pawcheebels','Need a hand? I can explain app features and guide you through payment-proof submission.','paw',2],
  ['paw.welcome','Pawcheebels','Your app guide is here! Tap me for questions about payments, schedules, or using LoanLedger PH.','paw',2],
  ['paw.welcome','Pawcheebels','Hi there! You can ask me about the app or just say hello.','paw',2],
  ['paw.reminder','Pawcheebels','Need help submitting payment proof? Tap me and I’ll guide you through the steps.','paw',120],
  ['paw.reminder','Pawcheebels','Questions about installment schedules? I can help you understand where to find them.','paw',120],
  ['paw.reminder','Pawcheebels','I’m here if you need help with LoanLedger PH. What would you like to know?','paw',120]
 );
 const client=await db.connect();try{await client.query('begin');await client.query("select pg_advisory_xact_lock(hashtextextended('notification-rule-defaults',44))");if((await client.query("select 1 from mobile_private.notification_rule_state where key='defaults-v1'")).rowCount){await client.query('commit');return}
 for(const [event,title,body,channel='inbox',delay=0] of defaults){
  const graph=core.newGraph(event,channel),send=graph.nodes[1].data
  Object.assign(send,{title,body,filipinoTitle:'',filipinoBody:'',category:/^(payment|popup.payment)/.test(event)?'payment':/^(invoice|disbursement)/.test(event)?'document':event.startsWith('support')||event.startsWith('popup.login')?'account':'general'})
  if(delay){graph.nodes.splice(1,0,{id:'delay-1',type:'delay',x:340,y:70,data:{seconds:delay}});graph.nodes[2].x=650;graph.edges=[{from:'when-1',to:'delay-1',port:'next'},{from:'delay-1',to:'send-1',port:'next'}]}
  core.validateGraph(graph)
  const rule=(await client.query('insert into mobile_private.notification_rules(name,graph) values($1,$2) returning id',[core.EVENTS.find(item=>item.value===event).label,graph])).rows[0]
  await client.query('insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values($1,1,$2,true,$3)',[rule.id,core.EVENTS.find(item=>item.value===event).label,graph])
 }
 const due=core.newGraph('payment.due');due.nodes[1].data.title='Payment Due Reminder';due.nodes[1].data.body='Your payment of PHP {{amount}} is due on {{due_date}}. Please review your payment schedule.';due.nodes.push({id:'if-1',type:'if',x:340,y:70,data:{condition:{kind:'group',mode:'all',children:[{kind:'condition',field:'days_until_due',operator:'equals',value:'1'}]}}});due.nodes[1].x=650;due.edges=[{from:'when-1',to:'if-1',port:'next'},{from:'if-1',to:'send-1',port:'yes'}];due.nodes[1].data.filipinoTitle='Paalala sa takdang bayad';due.nodes[1].data.filipinoBody='Bukas na ang takdang bayad na PHP {{amount}}. Suriin ang iyong iskedyul ng pagbabayad.';core.validateGraph(due)
 const rule=(await client.query("insert into mobile_private.notification_rules(name,enabled,graph) values('Payment due tomorrow · enable when ready',false,$1) returning id",[due])).rows[0];await client.query("insert into mobile_private.notification_rule_versions(rule_id,version,name,enabled,graph) values($1,1,'Payment due tomorrow · enable when ready',false,$2)",[rule.id,due]);await client.query("insert into mobile_private.notification_rule_state(key,value) values('defaults-v1','installed')");await client.query('commit')
 }catch(error){await client.query('rollback');throw error}finally{client.release()}
}
