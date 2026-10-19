export const TRANSACTION_GRID_COLUMNS=Object.freeze([
  {key:'borrower',label:'Borrower',width:196,min:120},
  {key:'txnDate',label:'Txn date',width:124,min:118},
  {key:'description',label:'Item description',width:280,min:150},
  {key:'amount',label:'Amount',width:138,min:116},
  {key:'type',label:'Type',width:130,min:112},
  {key:'dueDate',label:'Due date',width:124,min:118},
  {key:'datePaid',label:'Date paid',width:124,min:118},
  {key:'status',label:'Status',width:132,min:116},
])
const keys=TRANSACTION_GRID_COLUMNS.map(column=>column.key)
export const GRID_LAYOUT_VERSION=1
export const gridLayoutKey=owner=>'loanledger:transactions-grid:v1:'+owner
export function normalizeGridLayout(saved){
  const order=Array.isArray(saved?.order)?[...new Set(saved.order.filter(key=>keys.includes(key)))]:[]
  return {version:GRID_LAYOUT_VERSION,order:[...order,...keys.filter(key=>!order.includes(key))],widths:Object.fromEntries(TRANSACTION_GRID_COLUMNS.map(column=>[column.key,clampColumnWidth(column.key,saved?.widths?.[column.key]??column.width)]))}
}
export function clampColumnWidth(key,value){
  const column=TRANSACTION_GRID_COLUMNS.find(column=>column.key===key)
  if(!column)throw Error('Unknown grid column.')
  return Math.max(column.min,Math.min(800,Number.isFinite(Number(value))?Math.round(Number(value)):column.width))
}
export function moveGridColumn(layout,source,target){
  const normalized=normalizeGridLayout(layout),from=normalized.order.indexOf(source),to=normalized.order.indexOf(target)
  if(from<0||to<0||from===to)return normalized
  normalized.order.splice(from,1);normalized.order.splice(to,0,source);return normalized
}
export function readGridLayout(storage,key){try{const saved=JSON.parse(storage.getItem(key));return normalizeGridLayout(saved?.version===GRID_LAYOUT_VERSION?saved:null)}catch{return normalizeGridLayout(null)}}
export function writeGridLayout(storage,key,layout){try{storage.setItem(key,JSON.stringify(normalizeGridLayout(layout)));return true}catch{return false}}
