export const exampleAsOf='2026-11-10'
export const exampleDates=['2026-07-10','2026-08-10','2026-09-10','2026-10-10']
export const exampleRows=[
 ['TAD June 10, 2026','2026-07-10','76663.64'],
 ['PAYPAL SEND (12 of 12)','2026-07-10','9421.36'],
 ['PAYPAL SEND (1 of 12)','2026-07-10','16077.96'],
 ['Partial Payment - Jul 10, 2026','2026-07-10','-40000.00'],
 ['PAYPAL SEND (2 of 12)','2026-08-10','13607.96'],
 ['Late Payment Fee - Jul 10, 2026','2026-08-10','1500.00'],
 ['3% Finance Charge - Jul 10, 2026','2026-08-10','3064.88'],
 ['Partial Payment - Aug 10, 2026','2026-08-10','-20000.00'],
 ['PAYPAL SEND (3 of 12)','2026-09-10','13607.96'],
 ['PAYPAL SEND (4 of 12)','2026-10-10','13607.96'],
 ['Partial Payment - Sep 10, 2026','2026-10-10','-20000.00'],
 ['Late Payment Fee - Sep 10, 2026','2026-10-10','1500.00'],
 ['3% Finance Charge - Sep 10, 2026','2026-10-10','2218.31'],
].map(([description,dueDate,amount],i)=>({id:'combined-example-'+i,userId:'example-borrower',description,dueDate,amount,originalAmount:amount,paidAmount:0,status:'unpaid'}))
