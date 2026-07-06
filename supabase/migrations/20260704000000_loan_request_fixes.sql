-- ============================================================================
-- LoanLedger PH — Migration 027: Loan Request fixes
--
-- Applies two corrections to the loan-request RPCs for databases that already
-- ran migration 026 (fresh installs get these from the updated 026 file):
--   1) Notarial fee auto-applies only at ₱500,000 or more (was: always).
--   2) The submitted / canceled timeline events are attributed to the
--      borrower's real name instead of the generic "Borrower".
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create or replace function public.submit_loan_request(
  p_amount numeric,
  p_term int,
  p_bank_name text,
  p_account_number text,
  p_account_name text
)
returns public.loan_requests
language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric(8,6);
  v_notarial numeric(16,2);
  v_dst numeric(16,2);
  v_actor text;
  v_row public.loan_requests;
begin
  if not exists (
    select 1 from public.loan_request_access a
    where a.user_id = auth.uid() and a.enabled
  ) then
    raise exception 'Loan requests are not enabled for this account.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'A valid loan amount is required.';
  end if;

  select monthly_rate into v_rate from public.loan_request_rates where term_months = p_term;
  if v_rate is null then
    raise exception 'Unsupported loan term: %', p_term;
  end if;

  -- Notarial + DST auto-apply only at ₱500k or more (admin can override later).
  v_notarial := case when p_amount >= 500000 then round(p_amount * 0.0035, 2) else 0 end;
  v_dst := case when p_amount >= 500000 then ceil(p_amount / 200) * 1.5 else 0 end;
  select coalesce(name, 'Borrower') into v_actor from public.profiles where id = auth.uid();

  insert into public.loan_requests (
    user_id, amount, term_months, monthly_rate,
    bank_name, bank_account_number, bank_account_name,
    processing_fee, notarial_fee, dst, status
  ) values (
    auth.uid(), p_amount, p_term, v_rate,
    btrim(p_bank_name), btrim(p_account_number), btrim(p_account_name),
    1500, v_notarial, v_dst, 'submitted'
  ) returning * into v_row;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (
    v_row.id, 'submitted',
    'Your application has been successfully received and is now waiting to be picked up for processing.',
    v_actor
  );

  return v_row;
end;
$$;

create or replace function public.cancel_my_loan_request(
  p_id uuid,
  p_note text
)
returns public.loan_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.loan_requests;
  v_actor text;
begin
  select * into v_row from public.loan_requests
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;
  if v_row.status not in ('submitted','pending','coordinating') then
    raise exception 'This request can no longer be canceled.';
  end if;

  select coalesce(name, 'Borrower') into v_actor from public.profiles where id = auth.uid();

  update public.loan_requests
     set status = 'canceled', updated_at = now()
   where id = p_id
   returning * into v_row;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (p_id, 'canceled', coalesce(p_note, 'Canceled by borrower.'), v_actor);

  return v_row;
end;
$$;

grant execute on function public.submit_loan_request(numeric, int, text, text, text) to authenticated;
grant execute on function public.cancel_my_loan_request(uuid, text) to authenticated;
