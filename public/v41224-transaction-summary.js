// Display-only group state and totals. Never update ledger amounts or statuses.
function installmentGroupState(loan={},rows=[],today=''){
 const status=value=>String(value||'').trim().toLowerCase();
 if(status(loan.status)==='refunded'||rows.length>0&&rows.every(row=>status(row.status)==='refunded'))return 'Refunded';
 if(rows.length>0&&rows.every(row=>status(row.status)==='paid'))return 'Fully Paid';
 if(rows.some(row=>status(row.status)==='past_due'||status(row.status)==='unpaid'&&row.dueDate<today))return 'Past Due';
 return 'In Progress';
}
function displayedAmountTotal(values){
 return values.reduce((total,value)=>{const number=Number(value);return total+(Number.isFinite(number)?Math.round(number*100):0);},0)/100;
}
function filteredStraightTransactionRows(rows=transactionRecords()){
 return rows.filter(row=>row[6]==='straight'&&(straightGroupFilter==='all'||transactionRecordGroup(row)===straightGroupFilter)&&(transactionStraightFilter==='All'||row[5]===transactionStraightFilter)&&(!txSearch||(row[1]+' '+row[2]+' '+row[5]).toLowerCase().includes(txSearch.toLowerCase())));
}
function transactionTotalHTML(amount){return '<span class="transaction-group-total" data-no-translate title="Total of all matching records">'+cash(amount)+'</span>';}
