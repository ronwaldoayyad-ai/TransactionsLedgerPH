-- ============================================================================
-- LoanLedger PH — Migration 029: Borrower edits own request bank details
--
-- Lets a borrower update the disbursement bank name / account number / account
-- name on their own loan request while it is still active (not completed,
-- declined, or canceled). Other fields remain untouched.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create or replace function public.update_my_loan_request_bank(
  p_id uuid,
  p_bank_name text,
  p_account_number text,
  p_account_name text
)
returns public.loan_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.loan_requests;
begin
  select * into v_row from public.loan_requests
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;
  if v_row.status in ('completed','declined','canceled') then
    raise exception 'Bank details can no longer be edited for this request.';
  end if;
  if p_bank_name is null or btrim(p_bank_name) = ''
     or p_account_number is null or btrim(p_account_number) = ''
     or p_account_name is null or btrim(p_account_name) = '' then
    raise exception 'All bank fields are required.';
  end if;

  update public.loan_requests
     set bank_name = btrim(p_bank_name),
         bank_account_number = btrim(p_account_number),
         bank_account_name = btrim(p_account_name),
         updated_at = now()
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.update_my_loan_request_bank(uuid, text, text, text) to authenticated;
