// Money fields display grouped pesos; calculations and submissions use validated numeric values.
function moneyInputNumber(value){
 if(typeof value==='number')return Number.isFinite(value)?value:NaN;
 const text=String(value??'').trim();
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(text))return NaN;
 return Number(text.replace(/,/g,''));
}
function moneyInputFormat(value){const number=moneyInputNumber(value);return Number.isFinite(number)?number.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):String(value??'');}
function editMoneyInput(input,finished=false){
 const value=input.value;if(!value)return;
 if(!Number.isFinite(moneyInputNumber(value)))return;
 const position=input.selectionStart,logical=position===null?null:value.slice(0,position).replace(/,/g,'').length;
 const [integer,fraction]=value.replace(/,/g,'').split('.');
 input.value=finished?moneyInputFormat(value):Number(integer).toLocaleString('en-US')+(fraction!==undefined?'.'+fraction:'');
 if(!finished&&logical!==null){let count=0,next=0;while(next<input.value.length&&count<logical){if(input.value[next]!==',')count++;next++;}input.setSelectionRange(next,next);}
}
function isMoneyInput(input){return input?.id==='amount'||input?.id==='loanAmount';}
// Browser integration. Leave incomplete typing intact; finish with two decimals on blur.
document.addEventListener('input',event=>{if(isMoneyInput(event.target))editMoneyInput(event.target);},true);
document.addEventListener('focusout',event=>{if(!isMoneyInput(event.target))return;editMoneyInput(event.target,true);if(event.target.id==='amount')paymentAllocationChanged();else loanUpdate();});
