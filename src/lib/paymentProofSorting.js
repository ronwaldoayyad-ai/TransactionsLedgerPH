// Sort the entire filtered proof collection before pagination; leave saved rows untouched.
export function sortPaymentProofs(rows,users,key='date',direction='desc'){
 const names=new Map(users.map(user=>[user.id,user.name||'']));
 const date=row=>{const value=Date.parse(row.submittedAt);return Number.isFinite(value)?value:null;};
 const byDate=(a,b,dir)=>{const first=date(a),second=date(b);return first===null?(second===null?0:1):second===null?-1:(first-second)*dir;};
 const dir=direction==='asc'?1:-1;
 return [...rows].sort((a,b)=>{
  if(key==='borrower')return (names.get(a.userId)||'').localeCompare(names.get(b.userId)||'','en',{sensitivity:'base',numeric:true})*dir||byDate(a,b,-1)||String(a.id).localeCompare(String(b.id));
  const cmp=key==='amount'?(Number(a.amount)-Number(b.amount))*dir:byDate(a,b,dir);
  return cmp||String(a.id).localeCompare(String(b.id));
 });
}
