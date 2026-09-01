-- ============================================================================
-- LoanLedger PH — Borrower → admin notifications (reactions & replies)
--
-- Lets a borrower notify every admin when they react to or reply to one of the
-- lender's notifications. The borrower cannot INSERT an admin-targeted
-- notification directly (notifications INSERT is admin-only, plus the tightly
-- scoped "self insert" policy), so this SECURITY DEFINER RPC performs the write
-- on their behalf — mirroring acknowledge_loan_disbursement().
--
-- The inserted row keeps created_by = auth.uid() (the borrower), so it lands in
-- each admin's received Inbox and the admin can reply straight back to the
-- borrower.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- ============================================================================

create or replace function public.notify_admins(
  p_category text,
  p_title    text,
  p_body     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins uuid[];
  v_cat    text := coalesce(p_category, 'general');
begin
  if p_body is null or length(btrim(p_body)) = 0 then
    raise exception 'Notification body is required.';
  end if;
  if v_cat not in ('payment', 'document', 'account', 'general') then
    v_cat := 'general';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (v_cat, coalesce(p_title, ''), p_body, 'targeted', v_admins, auth.uid());
  end if;
end;
$$;

grant execute on function public.notify_admins(text, text, text) to authenticated;
