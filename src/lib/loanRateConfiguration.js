export const LOAN_RATE_TERMS=[3,6,12,24,36]
export function parseLoanRateDraft(draft){
 return LOAN_RATE_TERMS.map(term=>{const text=String(draft[term]??'').trim();if(!/^\d+(?:\.\d{1,4})?$/.test(text)||Number(text)>100)throw Error(`Enter a monthly rate from 0 to 100% for ${term} months (up to 4 decimal places).`);return {term_months:term,monthly_rate:Number((Number(text)/100).toFixed(6))}})
}
