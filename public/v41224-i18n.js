// Curated display copy. Record values, input values and uploaded/issued files
// stay in their original form; no borrower data is sent for translation.
const borrowerLocaleStrings=window.borrowerFilipinoMessages?.strings||{},borrowerLocaleLookup=new Map(Object.entries(borrowerLocaleStrings).map(([key,value])=>[key.replace(/\s+/g,' ').trim().toLowerCase(),value]));
const borrowerLocaleText=new WeakMap(),borrowerLocaleAttributes=new WeakMap();
let borrowerLastNotifiedLanguage=null;
let borrowerLocaleApplied=false,borrowerLocaleFrame=0,borrowerLocaleOwnerData=[],borrowerPrivateText=new Set();
function borrowerTranslate(value,language=preferredLanguage){
 if(language!=='Filipino')return String(value??'');
 const original=String(value??''),trimmed=original.trim(),key=trimmed.replace(/\s+/g,' ').toLowerCase();if(!trimmed)return original;
 const direct=borrowerLocaleLookup.get(key);if(direct)return original.replace(trimmed,direct);
 const patterns=[
  [/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) (\d{1,2}), (\d{4})(.*)$/i,(_,month,day,year,tail)=>{const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],date=new Date(Number(year),months.indexOf(month.slice(0,3).toLowerCase()),Number(day));return new Intl.DateTimeFormat('fil-PH',{month:'short',day:'numeric',year:'numeric'}).format(date)+tail;}],
  [/^(\d+) months · (\d+) of (\d+) payments verified$/i,(_,months,paid,total)=>months+' buwan · '+paid+' sa '+total+' bayad ang na-verify'],
  [/^(\d+) months?$/i,(_,n)=>n+' buwan'],
  [/^(\d+) of (\d+)$/i,(_,n,total)=>n+' sa '+total],
  [/^(\d+) of 5 remaining$/i,(_,n)=>n+' sa 5 ang natitira'],
  [/^([₱\d,.\s-]+) original amount$/i,(_,amount)=>amount+' orihinal na halaga'],
  [/^(\d+) (.+)$/,(_,n,noun)=>{const translated=borrowerLocaleLookup.get(noun.toLowerCase())||borrowerLocaleLookup.get(noun.toLowerCase().replace(/s$/,''));return translated?n+' '+translated:n+' '+noun;}],
  [/^(\d+(?:\.\d+)?)% paid$/i,(_,n)=>n+'% nabayaran'],
  [/^Show (\d+) more (due dates?|questions|messages|items|transactions|entries)$/i,(_,n,kind)=>'Ipakita ang '+n+' pang '+({questions:'tanong',messages:'mensahe',items:'tala',transactions:'transaksyon',entries:'tala'}[kind.toLowerCase()]||'takdang araw')],
  [/^Show (\d+) more$/i,(_,n)=>'Ipakita ang '+n+' pang tala'],
  [/^(\d+) (active|fully paid|past due installments?|installment plans?|plans|entries|items|unpaid items?|outstanding items?|unread notifications?|unread updates?|straight transactions?)$/i,(_,n,kind)=>n+' '+({active:'aktibo','fully paid':'bayad na nang buo','past due installments':'hulog na lampas sa takdang araw','past due installment':'hulog na lampas sa takdang araw','installment plans':'planong hulugan','installment plan':'planong hulugan',plans:'plano',plan:'plano',entries:'tala',items:'bayarin','unpaid item':'hindi pa bayad','unpaid items':'hindi pa bayad','outstanding item':'natitirang bayarin','outstanding items':'natitirang bayarin','unread notification':'hindi pa nababasang abiso','unread notifications':'hindi pa nababasang abiso','unread updates':'hindi pa nababasang abiso','unread update':'hindi pa nababasang abiso','straight transaction':'transaksyong isang bayaran','straight transactions':'transaksyong isang bayaran'}[kind.toLowerCase()]||kind)],
  [/^(Due|Paid|Refunded|Cancelled|Submitted|Reviewed|Created|Updated|Issued|Accepted) (.+)$/i,(_,label,tail)=>({due:'Takdang bayad',paid:'Nabayaran',refunded:'Naibalik ang bayad',cancelled:'Kinansela',submitted:'Naisumite',reviewed:'Nasuri',created:'Ginawa',updated:'Na-update',issued:'Inilabas',accepted:'Tinanggap'}[label.toLowerCase()])+' '+borrowerTranslate(tail,language)],
  [/^(\d+) (PAST DUE)$/i,(_,n)=>n+' LAMPAS SA TAKDANG ARAW'],
  [/^Copy (.+) account number$/i,(_,bank)=>'Kopyahin ang numero ng '+bank+' account'],
  [/^Show (.+)$/i,(_,name)=>'Ipakita ang '+name],
  [/^(.+) transfer QR code$/i,(_,bank)=>bank+' QR code para sa pag-transfer'],
  [/^(\d+)\. (.+)$/,(_,n,title)=>n+'. '+borrowerTranslate(title,language)],
  [/^([✓☀☾ⓘ↻▤✉‹›→↓]+)\s*(.+)$/,(_,icon,text)=>icon+' '+borrowerTranslate(text,language)],
  [/^(.+):$/,(_,label)=>borrowerTranslate(label,language)+':'],
  [/^([A-Za-z ]+): (.+)$/,(_,label,tail)=>borrowerTranslate(label,language)+': '+tail],
  [/^(.+) ·$/,(_,label)=>borrowerTranslate(label,language)+' ·'],
  [/^· (.+)$/,(_,label)=>'· '+borrowerTranslate(label,language)],
  [/^(.+) · (.+)$/,(_,left,right)=>borrowerTranslate(left,language)+' · '+borrowerTranslate(right,language)]
 ];
 for(const [pattern,replace] of patterns)if(pattern.test(trimmed)){const next=trimmed.replace(pattern,replace);if(next!==trimmed)return original.replace(trimmed,next);}
 return original;
}
function borrowerSourceText(element){const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let value='',node;while(node=walker.nextNode())value+=borrowerLocaleText.get(node)?.source??node.nodeValue;return value;}
function borrowerLocalePrivateValues(){const sources=[stagingData,stagingData?.loans,stagingData?.transactions,stagingData?.messages,stagingData?.payments,stagingData?.tickets];if(sources.length===borrowerLocaleOwnerData.length&&sources.every((value,index)=>value===borrowerLocaleOwnerData[index]))return;borrowerLocaleOwnerData=sources;borrowerPrivateText=new Set();const capture=value=>{if(typeof value==='string'&&value.trim())borrowerPrivateText.add(value.trim());};if(!stagingData)return;for(const row of [stagingData.user,...(stagingData.loans||[]),...(stagingData.transactions||[]),...(stagingData.messages||[]),...(stagingData.payments||[]),...(stagingData.tickets||[])])for(const key of ['name','firstName','lastName','nickname','email','phone','label','description','body','note','reference','fileName','attachmentName','title'])capture(row?.[key]);}
const borrowerObserverOptions={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']};
let borrowerLanguageObserver;
function applyBorrowerLanguage(){
 document.documentElement.lang=preferredLanguage==='Filipino'?'fil':'en';
 if(preferredLanguage!=='Filipino'&&!borrowerLocaleApplied)return;
 borrowerLanguageObserver?.disconnect();
 try {
 borrowerLocalePrivateValues();
 const excluded='script,style,svg,canvas,iframe,input,textarea,[data-no-translate],.chat-body-text,.chat-reply-quote,.chat-widget-quote,.chat-message-body,.paw-message.mine p,.notification-reply-preview,.support-ticket-description,.profile-avatar-name';
 document.querySelectorAll('option').forEach(option=>{if(!option.hasAttribute('value'))option.setAttribute('value',borrowerLocaleText.get(option.firstChild)?.source||option.textContent);});
 const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement&&!node.parentElement.closest(excluded)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});let node;
 while(node=walker.nextNode()){
  const current=node.nodeValue;let record=borrowerLocaleText.get(node);if(!record||current!==record.display&&current!==record.source){record={source:current,display:current};borrowerLocaleText.set(node,record);}
  const translated=borrowerPrivateText.has(record.source.trim())?record.source:borrowerTranslate(record.source);
  record.display=translated;if(current!==translated)node.nodeValue=translated;
 }
 document.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(element=>{
  if(element.closest('[data-no-translate],svg'))return;let records=borrowerLocaleAttributes.get(element);if(!records){records={};borrowerLocaleAttributes.set(element,records);}
  for(const attribute of ['placeholder','title','aria-label','alt']){if(!element.hasAttribute(attribute))continue;const current=element.getAttribute(attribute);let record=records[attribute];if(!record||current!==record.display&&current!==record.source)record=records[attribute]={source:current,display:current};const next=borrowerPrivateText.has(record.source.trim())?record.source:borrowerTranslate(record.source);record.display=next;if(next!==current)element.setAttribute(attribute,next);}
 });
 borrowerLocaleApplied=preferredLanguage==='Filipino';
 } finally {borrowerLanguageObserver?.observe(document.body,borrowerObserverOptions);}
}
function notifyBorrowerLanguage(){if(borrowerLastNotifiedLanguage===preferredLanguage)return;borrowerLastNotifiedLanguage=preferredLanguage;try{sessionStorage.setItem('loanledger-mobile-language',preferredLanguage)}catch{}stagingSend({type:'language',language:preferredLanguage});}
function setAppLanguage(language){if(!['English','Filipino'].includes(language))return;preferredLanguage=language;applyBorrowerLanguage();notifyBorrowerLanguage();if(stagingData)saveMobilePreferences();}
function queueBorrowerLanguage(){if(borrowerLocaleFrame||preferredLanguage!=='Filipino'&&!borrowerLocaleApplied)return;borrowerLocaleFrame=requestAnimationFrame(()=>{borrowerLocaleFrame=0;applyBorrowerLanguage();});}
const untranslatedLanguageSettings=languageSettings;
languageSettings=()=>untranslatedLanguageSettings().replace('preferredLanguage=this.value','setAppLanguage(this.value)');
const untranslatedRender=render;
render=()=>{untranslatedRender();applyBorrowerLanguage();notifyBorrowerLanguage();};
const untranslatedToast=toast;toast=message=>untranslatedToast(borrowerTranslate(message));
const untranslatedConfirm=window.confirm.bind(window),untranslatedAlert=window.alert.bind(window);window.confirm=message=>untranslatedConfirm(borrowerTranslate(message));window.alert=message=>untranslatedAlert(borrowerTranslate(message));
const untranslatedMobileCall=mobileCall;mobileCall=(action,payload={},options={})=>untranslatedMobileCall(action,action==='faq-ask'?{...payload,language:preferredLanguage}:payload,options);
const untranslatedFAQRows=faqRows;
const borrowerFilipinoStopWords=new Set('ano paano ang ng sa ko ako ka at may mga ba para ito kung iyong nang ay isang na mo namin ninyo'.split(' ')),untranslatedFAQWords=normalizeFAQWords;
normalizeFAQWords=value=>untranslatedFAQWords(value).filter(word=>preferredLanguage!=='Filipino'||!borrowerFilipinoStopWords.has(word));
faqRows=()=>{if(preferredLanguage!=='Filipino'||!faqKnowledge||!faqSearch.trim())return untranslatedFAQRows();const query=faqSearch.trim().toLocaleLowerCase('fil');return faqKnowledge.entries.filter(entry=>(faqCategory==='All'||entry.category===faqCategory)&&[entry.question,entry.answer,borrowerTranslate(entry.question),borrowerTranslate(entry.answer),entry.keywords.join(' ')].join(' ').toLocaleLowerCase('fil').includes(query));};
const untranslatedLocalFAQ=localFAQAnswer;
localFAQAnswer=question=>{if(preferredLanguage!=='Filipino'||!faqKnowledge)return untranslatedLocalFAQ(question);const tokens=normalizeFAQWords(question),ranked=faqKnowledge.entries.map(entry=>({entry,score:faqMatchBonus(question,entry)+tokens.reduce((n,word)=>n+(normalizeFAQWords(borrowerTranslate(entry.question)+' '+entry.keywords.join(' ')).includes(word)?3:normalizeFAQWords(borrowerTranslate(entry.answer)).includes(word)?1:0),0)})).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.entry);return ranked.length?{answer:borrowerTranslate(ranked[0].answer),sources:ranked.map(({id,question})=>({id,question})),mode:'faq',reason:'local'}:untranslatedLocalFAQ(question);};
const untranslatedAskFAQ=askFAQ;askFAQ=id=>{untranslatedAskFAQ(id);if(preferredLanguage==='Filipino'){pawDraft=borrowerTranslate(pawDraft);const input=$('#pawQuestion');if(input)input.value=pawDraft;}};
borrowerLanguageObserver=new MutationObserver(queueBorrowerLanguage);borrowerLanguageObserver.observe(document.body,borrowerObserverOptions);
try{const saved=sessionStorage.getItem('loanledger-mobile-language');if(['English','Filipino'].includes(saved)&&!stagingData)preferredLanguage=saved;}catch{}
render();
