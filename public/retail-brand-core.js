// Generated from src/lib/retailBrands.js; keep parity checks passing.
(()=>{
const {transactionGroup}=window.TransactionGroups

// Reference names only. Search results and expiring search image URLs are never cached.
const RETAIL_BRANDS=Object.freeze([
 {name:'Apple',domain:'apple.com',aliases:['apple','iphone','ipad','macbook','airpods']},
 {name:'Samsung',domain:'samsung.com',aliases:['samsung']},
 {name:'Power Mac Center',domain:'powermaccenter.com',aliases:['power mac center','powermac','pmc'],reviewAliases:['pmc']},
 {name:'Shopee',domain:'shopee.ph',aliases:['shopee']},
 {name:'Lazada',domain:'lazada.com.ph',aliases:['lazada']},
 {name:'Nike',domain:'nike.com',aliases:['nike']},
 {name:'Adidas',domain:'adidas.com',aliases:['adidas']},
 {name:'Uniqlo',domain:'uniqlo.com',aliases:['uniqlo']},
 {name:'Starbucks',domain:'starbucks.com',aliases:['starbucks']},
 {name:'IKEA',domain:'ikea.com',aliases:['ikea']},
 {name:'Sony',domain:'sony.com',aliases:['sony','playstation']},
 {name:'Nintendo',domain:'nintendo.com',aliases:['nintendo']},
])
const brandText=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')
function brandDomain(value){const domain=String(value||'').toLowerCase().trim();return domain.length<=253&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)?domain:null}
function retailTarget(transaction,loan){
 if(!transaction||transaction.archivedAt)return null
 const group=transactionGroup(transaction,loan)
 if(!['retail_installment','straight_retail'].includes(group))return null
 const linked=transaction.type==='Installment'&&loan?.id
 return {scope:linked?'loan':'transaction',id:linked?loan.id:transaction.id,userId:transaction.userId,description:linked?loan.label:transaction.description,key:(linked?'loan:':'transaction:')+(linked?loan.id:transaction.id)}
}
function matchRetailBrand(description,rules=[]){
 const text=' '+brandText(description)+' ',hits=new Map();let ambiguous=false
 const choices=[...RETAIL_BRANDS,...rules.filter(r=>r.active!==false).map(r=>({name:r.name,domain:r.domain,aliases:[r.alias]}))]
 for(const brand of choices){if(!brandDomain(brand.domain))continue;const found=brand.aliases.filter(alias=>brandText(alias)&&text.includes(' '+brandText(alias)+' '));if(!found.length)continue;hits.set(brand.domain,{name:brand.name,domain:brand.domain});if(found.some(alias=>brand.reviewAliases?.includes(alias)))ambiguous=true}
 const candidates=[...hits.values()].sort((a,b)=>a.domain.localeCompare(b.domain))
 return candidates.length===1&&!ambiguous?{status:'automatic',...candidates[0],candidates}:{status:candidates.length?'review':'unmatched',domain:null,name:null,candidates}
}
function resolveRetailBrand(transaction,loan,assignments=[],rules=[]){
 const target=retailTarget(transaction,loan);if(!target)return {status:'ineligible',domain:null,target:null}
 const saved=assignments.find(a=>a.target_key===target.key),version=saved?.version??null
 if(saved?.mode==='none')return {status:'hidden',domain:null,target,version}
 if(saved?.mode==='manual'&&brandDomain(saved.domain))return {status:'manual',domain:saved.domain,name:saved.name,target,version}
 return {...matchRetailBrand(target.description,rules),target,version}
}
function brandLogoUrl(domain,clientId){return brandDomain(domain)&&clientId?'https://cdn.brandfetch.io/domain/'+domain+'/w/96/h/96/fallback/404/icon.webp?c='+encodeURIComponent(clientId):null}
function createRetailBrandResolver(assignments=[],rules=[]){const cache=new WeakMap();return(t,l)=>{if(!t)return {status:'ineligible',domain:null,target:null};const prior=cache.get(t);if(prior&&prior.loan===l)return prior.result;const result=resolveRetailBrand(t,l,assignments,rules);cache.set(t,{loan:l,result});return result}}
function uniqueRetailTargets(transactions,loans){const index=new Map(loans.map(l=>[l.id,l])),seen=new Set();return transactions.flatMap(transaction=>{const loan=index.get(transaction.loanId),target=retailTarget(transaction,loan);if(!target||seen.has(target.key))return [];seen.add(target.key);return [{transaction,loan,...target}]})}

window.RetailBrands={RETAIL_BRANDS,brandText,brandDomain,retailTarget,matchRetailBrand,resolveRetailBrand,brandLogoUrl,uniqueRetailTargets};
})();
