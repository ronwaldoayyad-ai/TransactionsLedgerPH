const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function fixture(){
 const data={user:{id:'owner'},payments:[{id:'mine',userId:'owner'},{id:'foreign',userId:'other'}]},rows=[{id:'installment',loanId:'loan-b',description:'Second loan'},{id:'straight',loanId:null},{id:'foreign-txn',userId:'other',loanId:'loan-b'}],loans=[{id:'loan-a'},{id:'loan-b'}]
 const c=vm.createContext({stagingData:data,stagingRows:()=>rows,stagingLoans:()=>loans,document:{addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}}});vm.runInContext(fs.readFileSync('public/v41224-navigation-polish.js','utf8').split('// Reuse existing borrower screens')[1].replace(/^/, '// Reuse existing borrower screens'),c);return {c,data,rows,loans}
}
test('payment activity resolves only the current borrower’s existing submission',()=>{
 const {c,data}=fixture();assert.equal(c.borrowerActivityTarget({dataset:{paymentProofId:'mine'}}).id,'mine');for(const id of ['foreign','missing'])assert.equal(c.borrowerActivityTarget({dataset:{paymentProofId:id}}),null);data.user=null;assert.equal(c.borrowerActivityTarget({dataset:{paymentProofId:'mine'}}),null)
})
test('installment activity resolves by stable loan id and tolerates reordered or removed loans',()=>{
 const {c,loans}=fixture(),row={dataset:{stagingTransactionId:'installment'}};assert.equal(c.borrowerActivityTarget(row).index,1);loans.reverse();assert.equal(c.borrowerActivityTarget(row).index,0);loans.shift();assert.equal(c.borrowerActivityTarget(row),null);for(const id of ['straight','foreign-txn','missing'])assert.equal(c.borrowerActivityTarget({dataset:{stagingTransactionId:id}}),null)
})
