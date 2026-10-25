let retailBrandSource=null,retailBrandIndex=null;
function borrowerBrandIndex(){if(retailBrandSource!==stagingData){retailBrandSource=stagingData;retailBrandIndex={rows:new Map(stagingRows().map(t=>[t.id,t])),loans:new Map((stagingData?.loans||[]).map(l=>[l.id,l])),resolved:new Map()}}return retailBrandIndex;}
function borrowerRetailBrand(transaction,loan){const b=stagingData?.branding;if(!b?.ready||!transaction)return null;const index=borrowerBrandIndex(),key=loan?.id&&transaction.type==='Installment'?'loan:'+loan.id:'transaction:'+transaction.id;if(!index.resolved.has(key))index.resolved.set(key,RetailBrands.resolveRetailBrand(transaction,loan,b.assignments,b.rules));const brand=index.resolved.get(key);return {...brand,url:RetailBrands.brandLogoUrl(brand.domain,b.clientId,document.body.classList.contains('dark')?'light':undefined)};}
function retailLogoHTML(brand){return brand?.url?'<span class="retail-logo"><span class="retail-logo-fallback" aria-hidden="true">▣</span><img src="'+htmlSafe(brand.url)+'" data-fallback="'+htmlSafe(brand.url.replace('/type/logo','/icon.webp'))+'" alt="'+htmlSafe(brand.name)+' logo" loading="lazy" decoding="async" referrerpolicy="strict-origin-when-cross-origin" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else this.remove()"></span>':'';}
const recordsBeforeRetailBrands=transactionRecords;
transactionRecords=()=>recordsBeforeRetailBrands().map(record=>{const index=borrowerBrandIndex(),txn=index.rows.get(record[8]),loan=index.loans.get(txn?.loanId),logo=retailLogoHTML(borrowerRetailBrand(txn,loan));return logo?[logo,...record.slice(1)]:record});
function retailTransactionRowHTML(html,id){const index=borrowerBrandIndex(),txn=index.rows.get(id),logo=retailLogoHTML(borrowerRetailBrand(txn,index.loans.get(txn?.loanId)));return logo?html.replace(/<div class="ico([^"]*)">[\s\S]*?<\/div>/,'<div class="ico has-retail-logo">'+logo+'</div>'):html;}
const breakdownBeforeRetailBrands=transactionBreakdownItems;
transactionBreakdownItems=()=>breakdownBeforeRetailBrands().map(html=>retailTransactionRowHTML(html,html.match(/data-staging-transaction-id="([^"]+)"/)?.[1]));
const activityBeforeRetailBrands=stagingRecentActivity;
stagingRecentActivity=()=>activityBeforeRetailBrands().map(html=>retailTransactionRowHTML(html,html.match(/data-staging-transaction-id="([^"]+)"/)?.[1]));
const historyBeforeRetailBrands=historyAccountRecords;
historyAccountRecords=()=>historyBeforeRetailBrands().map(record=>{const index=borrowerBrandIndex(),txn=index.rows.get(record[10]),logo=retailLogoHTML(borrowerRetailBrand(txn,index.loans.get(txn?.loanId)));return logo?[logo,...record.slice(1)]:record;});
function decorateRetailLogos(){
 document.querySelectorAll('.installment-group-row,.settings-row[onclick^="openInstallment("]').forEach(row=>{const index=Number(row.getAttribute('onclick')?.match(/openInstallment\((\d+)\)/)?.[1]),loan=stagingLoans()[index],txn=stagingIndex().byLoan.get(loan?.id)?.[0],logo=retailLogoHTML(borrowerRetailBrand(txn,loan)),icon=row.querySelector('.ico,.settings-icon');if(logo&&icon){icon.innerHTML=logo;icon.classList.add('has-retail-logo')}});
 document.querySelectorAll('.installment-deck-card:not(.installment-deck-card--cash)').forEach(card=>{const loan=borrowerBrandIndex().loans.get(card.dataset.loan),txn=stagingIndex().byLoan.get(loan?.id)?.[0],logo=retailLogoHTML(borrowerRetailBrand(txn,loan));if(logo&&!card.querySelector('.installment-card-logo')){card.classList.add('has-card-brand');card.insertAdjacentHTML('beforeend','<span class="installment-card-logo">'+logo+'</span>')}});
}
const renderBeforeRetailBrands=render;
render=()=>{renderBeforeRetailBrands();decorateRetailLogos()};
if(stagingData)render();
