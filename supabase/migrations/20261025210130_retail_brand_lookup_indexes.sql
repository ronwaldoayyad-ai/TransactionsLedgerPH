-- Follow-up to the applied logo metadata migration; no existing financial data changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create index retail_brand_assignments_loan on public.retail_brand_assignments(loan_id);
create index retail_brand_assignments_transaction on public.retail_brand_assignments(transaction_id);
commit;
