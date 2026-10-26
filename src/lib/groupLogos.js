import {transactionGroup} from './transactionGroups.js'
export const GROUP_LOGOS=Object.freeze([{key:'cash_loan',label:'Cash Loan'},{key:'fees',label:'Fees'},{key:'adjustments',label:'Adjustments'}])
export function groupLogoUrl(svg){return typeof svg==='string'&&svg.startsWith('<svg')&&svg.endsWith('</svg>')&&svg.length<=65536?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg):null}
export function createGroupLogoResolver(logos=[]){
 const choices=new Map(GROUP_LOGOS.map(definition=>{const saved=logos.find(r=>r.group_key===definition.key),group=definition.key;return [group,{status:'group',group,name:definition.label,url:groupLogoUrl(saved?.svg),version:saved?.version||null,target:{scope:'group',id:group,key:'group:'+group}}]}))
 return(transaction,loan)=>!transaction||transaction.archivedAt?null:choices.get(transactionGroup(transaction,loan))||null
}
export function resolveGroupLogo(transaction,loan,logos=[]){return createGroupLogoResolver(logos)(transaction,loan)}
