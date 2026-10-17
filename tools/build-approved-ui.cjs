const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const source=process.argv[2];if(!source)throw Error('Approved HTML path required.');
let html=fs.readFileSync(source,'utf8');
const sourceHash=crypto.createHash('sha256').update(html).digest('hex');
const start=html.indexOf('<script>')+8,end=html.lastIndexOf('</script>');
let script=html.slice(start,end);
script=script.replace("uploaded.size>5242880","uploaded.size>10485760").replace('File exceeds 5 MB. Choose a smaller file.','File exceeds 10 MB. Choose a smaller file.').replace("['image/jpeg','image/png','application/pdf'].includes(uploaded.type)","['image/jpeg','image/png','image/webp','application/pdf'].includes(uploaded.type)").replace('Choose a JPG, PNG, or PDF file.','Choose a JPG, PNG, WEBP, or PDF file.').replace('JPG, PNG or PDF · Max 5 MB','JPG, PNG, WEBP or PDF · Max 10 MB').replace('accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"','accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"').replace('<option>Manual Credit</option>','<option disabled>Manual Credit · lender only</option>').replace('This request is saved locally in this browser.','This request is saved to your local staging account.');
script=script.replace('const notificationItems=[','let notificationItems=[').replace('const disbursementRecords=Object.freeze(','let disbursementRecords=Object.freeze(');
script=script.replace('if(worker)await worker.terminate().catch(()=>{});','if(worker)await releaseProofWorker(worker,completed);');
script=script.replace('pdfjs.getDocument({data:new Uint8Array(await uploaded.arrayBuffer())})','pdfjs.getDocument({data:new Uint8Array(await uploaded.arrayBuffer()),isEvalSupported:false})');
script=script.replace("<b>✓ Yes</b>","<b>'+escapeLoan(r.accountConfirmed==null?'Not recorded':r.accountConfirmed?'✓ Yes':'No')+'</b>").replace("<b>✓ Accepted</b>","<b>'+escapeLoan(r.consentAt?'✓ Accepted':'Not recorded')+'</b>");
script=script.replace('let showInstallment=!txSearch||/cash loan|installment|schedule|payment plan/i.test(txSearch);','let showInstallment=true;');
script=script.replace("straightRows.sort((x,y)=>txSort==='Oldest'?x[7]-y[7]:txSort==='Amount: high to low'?y[3]-x[3]:txSort==='Amount: low to high'?x[3]-y[3]:y[7]-x[7]);",'straightRows.sort(stagingCompareTransactions);');
script=script.replaceAll("new Date(r[7]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})",'stagingTransactionDate(r[7])');
script=script.replace("straight=transactionRecords().filter(r=>r[6]==='straight'),principal", "straight=transactionRecords().filter(r=>r[6]==='straight').sort(stagingCompareLatestTransactions),principal");
script=script.replace("all.map((g,index)=>({g,index})).filter(x=>loanProfileCategory(x.g)===name)","all.map((g,index)=>({g,index})).filter(x=>loanProfileCategory(x.g)===name).sort(stagingCompareProfileGroups)");
script=script.replace("period=hour>=5&&hour<12?'morning'", "period=hour<12?'morning'");
script=script.replace('const shown=notificationExpanded?list:list.slice(0,10);','const shown=notificationExpanded?list:list.slice(0,5);').replace('${list.length>10?', '${list.length>5?');
script=script.replace("<summary>Amortization Schedule · '+countLabel(schedule.length,'payment')+'</summary>",'<summary>Amortization Schedule</summary>');
script=script.replace("Number(r.rate||0).toFixed(4)+'%", "(Number(r.rate||0)*100).toFixed(4)+'%");
script=script.replaceAll("data.rate.toFixed(4)+'%'", "(Number(data.rate)*100).toFixed(4)+'%'");
const avatarSources=Object.fromEntries(fs.readdirSync(path.resolve(__dirname,'../public/assets/avatars')).filter(name=>name.endsWith('.svg')).map(name=>[name.slice(0,-4),'data:image/svg+xml;base64,'+fs.readFileSync(path.resolve(__dirname,'../public/assets/avatars',name)).toString('base64')]));
script=script.replace('const profileAvatarCatalog=', 'const profileAvatarSources='+JSON.stringify(avatarSources)+';\nconst profileAvatarCatalog=').replace("src:'assets/avatars/'+id+'.svg'",'src:profileAvatarSources[id]');
// Retain the approved PDF layout; legacy rows lack allocation and paid-date data.
script=script.replace("const badge=receipt.entryMode==='ocr'?'OCR VERIFIED':'MANUAL ENTRY'", "const badge=receipt.entryMode==='ocr'?'OCR CAPTURED':receipt.entryMode==='copied'?'COPIED SUBMISSION':'SUBMITTED DETAILS'");
script=script.replace("money(item.amount),true)","(item.amount==null?'Not recorded':money(item.amount)),true)");
script=script.replace("const notice='Notice: These are requested payment allocations. Balances remain unchanged until the payment is reviewed and approved. OCR captures receipt text; it does not verify that funds were received.'", "const notice=receipt.allocationsKnown===false?'Submission status: '+receipt.status+'. This acknowledgement records the submitted proof, not confirmation of funds received. Payment date and requested allocations were not recorded in the copied submission. No balances are changed.':'Submission status: '+receipt.status+'. This receipt records proof and requested allocations. Verification does not settle balances; the lender posts ledger allocations separately. OCR captures text and does not verify funds received.'");
script=script.replace("money(value),true,blue);y-=22", "(receipt.allocationsKnown===false&&label!=='Amount Submitted'?'Not recorded':money(value)),true,blue);y-=22");
// Expand long borrower/reference fields within the existing receipt layout.
script=script.replace("const top=y,boxHeight=143", "const nameLines=wrap(receipt.borrower,230,10,true),refLines=wrap(receipt.reference,150,8),nameExtra=Math.max(0,(nameLines.length-3)*13);const top=y,boxHeight=143+Math.max(nameExtra,(refLines.length-1)*10)");
script=script.replace("wrap(receipt.borrower,230,10,true).forEach", "nameLines.forEach").replace("text(50,top-101,8,'Borrower account:'", "text(50,top-101-nameExtra,8,'Borrower account:'").replace("text(50,top-116,9,receipt.account)", "text(50,top-116-nameExtra,9,receipt.account)");
script=script.replace("aligned(545,yy,8,value,i===0)", "if(i===3)refLines.forEach((line,n)=>aligned(545,yy-n*10,8,line));else aligned(545,yy,8,value,i===0)");
// Preserve the approved schedule markup; replace only its demo calculation block.
const begin=script.indexOf('function installmentDetail(){'),finish=script.indexOf('\nfunction setTransactionStatus',begin);
if(begin<0||finish<0)throw Error('Approved schedule contract changed.');
const original=script.slice(begin,finish),returnStart=original.indexOf(" return '<button");
const schedule=`function installmentDetail(){
 const data=loanDisclosureData();if(!data)return head('Installment Schedule','No installment records')+'<div class="glass pad">No schedule to show.</div>';
 const selected=installmentGroupData()[selectedInstallmentIndex],total=data.rows.length,verified=data.verified,fullyPaid=data.status==='Fully Paid',pct=total?Math.floor(verified/total*100):0,pastDueCount=data.rows.filter(r=>r.status==='Past Due').length,remainingCount=total-verified-pastDueCount;
 const paidBars=Math.round(verified/total*12),overdueBars=Math.round(pastDueCount/total*12),progressBars=Array.from({length:12},(_,i)=>'<span class="'+(i<paidBars?'bar-paid':i<paidBars+overdueBars?'bar-overdue':'bar-remain')+'" style="height:'+([38,58,46,75,62,88,54,69,43,78,56,66][i])+'px" title="'+verified+' paid · '+pastDueCount+' past due · '+remainingCount+' other" tabindex="0"></span>').join('');
 const allRows=data.rows.map(row=>{const pastDue=row.status==='Past Due',status=row.status==='Paid'?'paid':pastDue?'past-due':'upcoming';return '<div class="schedule-row '+(pastDue?'is-past-due':'')+'"><span class="schedule-index">'+row.number+'</span><div class="schedule-info"><b>'+htmlSafe(row.title)+(pastDue?'<span class="schedule-overdue-label">PAST DUE</span>':'')+'</b><small>Due Date: '+stagingDate(row.dueDate)+(row.paidDate?'<br>Paid on '+stagingDate(row.paidDate):'')+'</small></div><div class="schedule-amount"><b>'+cash(row.amount)+'</b><span class="schedule-status '+status+'">'+row.status+'</span></div></div>'}),rows=expandableRowsHTML('installmentSchedule',allRows,5);
 const overdueNotice=pastDueCount?'<div class="installment-overdue-notice" role="alert"><span>!</span><div><b>'+countLabel(pastDueCount,'past due installment')+' need attention</b><small>Review the highlighted entries below.</small></div></div>':'',congrats=fullyPaid?'<section class="installment-congrats" role="status"><span class="installment-congrats-icon">✓</span><div><b>Congratulations, this installment is fully paid!</b><small>You completed all '+countLabel(total,'payment')+' for this loan. Thank you for staying on track.</small></div><span class="installment-confetti">✦</span></section>':'';
`+original.slice(returnStart);
script=script.slice(0,begin)+schedule+script.slice(finish);
// Dashboard's approved layout is unchanged; money and item count become live.
script=script.replaceAll('cash(mode?22908.99:67158.99)','cash(stagingTotal())').replaceAll('${mode?1:7}','${stagingDue().length}');
const recentStart=script.indexOf("[transactionItem('✓','Payment Received','Oct 10, 2026");
const recentEnd=script.indexOf('],3)',recentStart);
if(recentStart<0||recentEnd<0)throw Error('Approved activity contract changed.');
script=script.slice(0,recentStart)+'stagingRecentActivity(),5)'+script.slice(recentEnd+4);
script=script.replace(";render();\n",';\n');
html=html.slice(0,start)+script+html.slice(end);
new (require('node:vm').Script)(script);
html=html.replace('</head>','<link rel="stylesheet" href="/v41224-notifications-documents.css"><link rel="stylesheet" href="/v41224-login.css"></head>');
html=html.replace('<body>','<body inert data-integration-loading><script src="/local-http-compat.js"></script>');
html=html.replace('</body>','<script src="/v41224-staging-adapter.js"></script><script src="/v41224-enhancements.js"></script><script src="/v41224-local-flows.js"></script><script src="/v41224-notifications-documents.js"></script><script src="/v41224-login.js"></script><script src="/v41224-mobile-feedback.js"></script></body>');
fs.writeFileSync(path.resolve(__dirname,'../public/borrower-v4.12.24.html'),html);
fs.writeFileSync(path.resolve(__dirname,'../public/v41224-source.json'),JSON.stringify({version:'4.12.24',referenceSHA256:sourceHash,description:'Approved HTML with local presentation/data adapter; reference styles and assets retained.'},null,2));
console.log('Approved v4.12.24 UI asset generated.');
