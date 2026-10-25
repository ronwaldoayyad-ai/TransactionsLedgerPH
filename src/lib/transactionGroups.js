export const TRANSACTION_GROUPS=Object.freeze({cash_loan:'Cash Loan',retail_installment:'Retail Installment',straight_retail:'Straight Retail',fees:'Fees',adjustments:'Adjustments'});
export const groupOptions=type=>(type==='Installment'?['cash_loan','retail_installment']:['straight_retail','fees','adjustments']).map(value=>({value,label:TRANSACTION_GROUPS[value]}));
export function defaultInstallmentGroup(loan={}){return ['cash_loan','retail_installment'].includes(loan.loanCategory)?loan.loanCategory:/cash\s+loan|paypal\s+send/i.test(loan.label||'')?'cash_loan':'retail_installment';}
export function transactionGroup(transaction,loan){
 const explicit=transaction.transactionGroup;
 if(transaction.type==='Installment')return loan?defaultInstallmentGroup(loan):['cash_loan','retail_installment'].includes(explicit)?explicit:defaultInstallmentGroup({label:transaction.description});
 if(['straight_retail','fees','adjustments'].includes(explicit))return explicit;
 if(transaction.feeKind||/^(?:\d+(?:\.\d+)?\s*%\s*)?finance\s+charge\b|^late\s+(?:payment\s+)?fee\b/i.test(String(transaction.description||'').trim()))return 'fees';
 if(Number(transaction.originalAmount??transaction.amount)<0||/^(?:partial\s+payment|overpayment|account\s+credit|credit\s+applied)\b/i.test(String(transaction.description||'').trim()))return 'adjustments';
 return 'straight_retail';
}
export function parseTransactionGroup(value,type,{description='',amount=0,loan}={}){
 const text=String(value||'').trim();const key=text.toLowerCase().replace(/[\s-]+/g,'_');
 if(!text)return transactionGroup({type,description,amount},loan);
 if(!groupOptions(type).some(option=>option.value===key))throw Error('Group must match the transaction type: '+groupOptions(type).map(option=>option.label).join(', ')+'.');
 return key;
}
