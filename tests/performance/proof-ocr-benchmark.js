// Run in Chrome DevTools on the standalone borrower presentation with synthetic data only.
// Returns local processing timings; never submits a proof or changes account records.
async function runProofOcrBenchmark(repeats=2){
 const cases=[{name:'wallet',width:720,height:1400,font:28,method:'GCash',expected:'GCASH'},{name:'bank-large',width:2400,height:3600,font:70,method:'Bank Transfer',expected:'Bank Transfer'},{name:'small-wallet',width:360,height:720,font:12,method:'Maya',expected:'MAYA'}],runs=[];
 for(let repeat=0;repeat<repeats;repeat++)for(const item of cases){
  const canvas=document.createElement('canvas');canvas.width=item.width;canvas.height=item.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#14243f';ctx.font=item.font+'px Arial';
  [item.method,'PAYMENT SUCCESSFUL','Amount paid PHP 3,209.96','October 24, 2026','Reference No. 2026102413540','Payment sent to Example Merchant','Please keep this receipt.'].forEach((line,i)=>ctx.fillText(line,item.width*.06,80+i*item.font*2.5));
  const file=new File([await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))],'synthetic-'+item.name+'.png',{type:'image/png'});canvas.width=canvas.height=0;
  const worker=await createProofWorker(()=>{});
  try{for(const variant of ['previous-detail','adaptive']){
   let image;const start=performance.now();let text;
   try{if(variant==='previous-detail'){image=await prepareProofImage(file,true);text=(await worker.recognize(image)).data.text;}else text=await extractProofText(file,()=>{},()=>{});}
   finally{if(image)image.width=image.height=0;}
   const values=parseProofText(text);if(values.amount!==3209.96||values.paidDate!=='2026-10-24'||values.reference!=='2026102413540'||values.method!==item.expected)throw Error('OCR correctness gate failed for '+item.name+' / '+variant);
   runs.push({repeat,name:item.name,variant,ms:Math.round(performance.now()-start),values});
  }}finally{await releaseProofWorker(worker,true);}
 }
 return {metric:'warm image decode + recognition + parse (milliseconds)',synthetic:true,repeats,runs};
}
