-- ============================================================================
-- LoanLedger PH — Loan Disbursements
--
-- Admin-generated disbursement documents, assigned to a borrower who can then
-- view/download their own. Modeled on Invoices: line items (here, the existing
-- unpaid installments authorized for DEDUCTION) + all figures are SNAPSHOTTED at
-- generation time (jsonb + numeric columns) so an assigned disbursement is
-- immutable even if the ledger changes.
--
-- This is a DOCUMENT-ONLY module: generating a disbursement does NOT create a
-- real loan and does NOT settle the deducted installments. It records the
-- approved request's proceeds, the authorized deductions, and the net amount.
--
-- Notifications:
--   * assign -> borrower notification WITH the PDF attached is created CLIENT-SIDE
--     (a Postgres trigger can't render the jsPDF document), mirroring Invoices.
--   * borrower acknowledgment -> admin notification is created here, in the
--     acknowledge RPC (SECURITY DEFINER), because notifications INSERT is
--     admin-only and the borrower cannot write it directly.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.loan_disbursements (
  id                     uuid primary key default gen_random_uuid(),
  disbursement_number    text unique not null,                 -- DISB-YYYY-### (atomic)
  reference              text not null default '',             -- the loan request's reference
  request_id             uuid references public.loan_requests(id) on delete set null,
  user_id                uuid not null references public.profiles(id) on delete cascade,
  status                 text not null default 'draft' check (status in ('draft', 'assigned')),
  disbursement_date      date not null default (now() at time zone 'Asia/Manila')::date,
  agreement_date         date,
  loan_account_number    text not null default '',
  -- Borrower/bank details snapshotted from the request at generation time.
  bank_name              text not null default '',
  bank_account_number    text not null default '',
  bank_account_name      text not null default '',
  -- Money. gross_amount is this tranche; total_sanctioned_amount is the whole
  -- approved loan (equal in the simple single-tranche case).
  total_sanctioned_amount numeric(14,2) not null default 0,
  gross_amount           numeric(14,2) not null default 0,
  percentage_of_total    numeric(7,4)  not null default 0,     -- gross / sanctioned * 100
  value_date             date,
  processing_fee         numeric(14,2) not null default 0,
  notarial_fee           numeric(14,2) not null default 0,
  dst                    numeric(14,2) not null default 0,
  total_deductions       numeric(14,2) not null default 0,     -- sum of selected installments
  net_proceeds           numeric(14,2) not null default 0,     -- gross - fees - deductions
  disbursement_mode      text not null default 'bank_transfer'
    check (disbursement_mode in ('bank_transfer', 'check', 'cash', 'others')),
  deduction_items        jsonb not null default '[]',          -- [{ id, description, dueDate, amount, sourceLoanLabel }]
  acknowledged_at        timestamptz,
  acknowledged_by        uuid references public.profiles(id) on delete set null,
  created_by             text not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists loan_disbursements_user_id_idx on public.loan_disbursements (user_id);
create index if not exists loan_disbursements_status_idx  on public.loan_disbursements (status);
create index if not exists loan_disbursements_request_idx on public.loan_disbursements (request_id);

alter table public.loan_disbursements enable row level security;

-- Borrowers see ONLY their own ASSIGNED disbursements; admins see everything.
drop policy if exists "disbursements: read own assigned or admin" on public.loan_disbursements;
create policy "disbursements: read own assigned or admin" on public.loan_disbursements
  for select to authenticated
  using ((user_id = auth.uid() and status = 'assigned') or public.is_admin());

-- Only admins write directly. Inserts flow through create_loan_disbursement();
-- borrower acknowledgment flows through acknowledge_loan_disbursement() (definer).
drop policy if exists "disbursements: admin insert" on public.loan_disbursements;
create policy "disbursements: admin insert" on public.loan_disbursements
  for insert to authenticated with check (public.is_admin());
drop policy if exists "disbursements: admin update" on public.loan_disbursements;
create policy "disbursements: admin update" on public.loan_disbursements
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "disbursements: admin delete" on public.loan_disbursements;
create policy "disbursements: admin delete" on public.loan_disbursements
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Atomic unique-number generation + insert. Per-year sequence: DISB-YYYY-###.
-- ---------------------------------------------------------------------------
create or replace function public.create_loan_disbursement(
  p_user_id                 uuid,
  p_request_id              uuid,
  p_reference               text,
  p_agreement_date          date,
  p_loan_account_number     text,
  p_bank_name               text,
  p_bank_account_number     text,
  p_bank_account_name       text,
  p_total_sanctioned_amount numeric,
  p_gross_amount            numeric,
  p_percentage_of_total     numeric,
  p_value_date              date,
  p_disbursement_date       date,
  p_processing_fee          numeric,
  p_notarial_fee            numeric,
  p_dst                     numeric,
  p_total_deductions        numeric,
  p_net_proceeds            numeric,
  p_disbursement_mode       text,
  p_deduction_items         jsonb
) returns public.loan_disbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   text := to_char((now() at time zone 'Asia/Manila'), 'YYYY');
  v_seq    int;
  v_number text;
  v_row    public.loan_disbursements;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;

  -- Serialize numbering for this year so two generations never collide.
  perform pg_advisory_xact_lock(hashtext('disbursement_number_' || v_year));

  select coalesce(max((split_part(disbursement_number, '-', 3))::int), 0) + 1
    into v_seq
    from public.loan_disbursements
    where disbursement_number like 'DISB-' || v_year || '-%';

  v_number := 'DISB-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  insert into public.loan_disbursements (
    disbursement_number, reference, request_id, user_id, status,
    disbursement_date, agreement_date, loan_account_number,
    bank_name, bank_account_number, bank_account_name,
    total_sanctioned_amount, gross_amount, percentage_of_total, value_date,
    processing_fee, notarial_fee, dst, total_deductions, net_proceeds,
    disbursement_mode, deduction_items, created_by
  ) values (
    v_number, coalesce(btrim(p_reference), ''), p_request_id, p_user_id, 'draft',
    coalesce(p_disbursement_date, (now() at time zone 'Asia/Manila')::date),
    p_agreement_date, coalesce(btrim(p_loan_account_number), ''),
    coalesce(btrim(p_bank_name), ''), coalesce(btrim(p_bank_account_number), ''),
    coalesce(btrim(p_bank_account_name), ''),
    coalesce(p_total_sanctioned_amount, 0), coalesce(p_gross_amount, 0),
    coalesce(p_percentage_of_total, 0), p_value_date,
    coalesce(p_processing_fee, 0), coalesce(p_notarial_fee, 0), coalesce(p_dst, 0),
    coalesce(p_total_deductions, 0), coalesce(p_net_proceeds, 0),
    coalesce(p_disbursement_mode, 'bank_transfer'),
    coalesce(p_deduction_items, '[]'::jsonb),
    coalesce((select name from public.profiles where id = auth.uid()), '')
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_loan_disbursement(
  uuid, uuid, text, date, text, text, text, text,
  numeric, numeric, numeric, date, date,
  numeric, numeric, numeric, numeric, numeric, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Borrower acknowledgment. Stamps acceptance on their OWN assigned disbursement,
-- then notifies every admin. SECURITY DEFINER because the borrower can neither
-- write the disbursement (admin-only update) nor insert a notification
-- (notifications INSERT is admin-only).
-- ---------------------------------------------------------------------------
create or replace function public.acknowledge_loan_disbursement(
  p_id uuid
) returns public.loan_disbursements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.loan_disbursements;
  v_name    text;
  v_admins  uuid[];
begin
  select * into v_row from public.loan_disbursements
   where id = p_id and user_id = auth.uid();
  if v_row.id is null then
    raise exception 'Disbursement not found.';
  end if;
  if v_row.status <> 'assigned' then
    raise exception 'This disbursement cannot be acknowledged.';
  end if;
  if v_row.acknowledged_at is not null then
    -- Already acknowledged: return as-is (idempotent, no duplicate notification).
    return v_row;
  end if;

  update public.loan_disbursements
     set acknowledged_at = now(), acknowledged_by = auth.uid(), updated_at = now()
   where id = p_id
   returning * into v_row;

  select coalesce(name, 'The borrower') into v_name from public.profiles where id = auth.uid();

  select coalesce(array_agg(id), '{}')
    into v_admins
    from public.profiles
   where role = 'admin' and status <> 'disabled';

  if array_length(v_admins, 1) is not null then
    insert into public.notifications (category, title, body, audience, target_user_ids, created_by)
    values (
      'general',
      '✅ Disbursement Accepted',
      v_name || ' has accepted loan disbursement ' || v_row.disbursement_number
        || ' (net ₱' || to_char(v_row.net_proceeds, 'FM999,999,990.00') || ').',
      'targeted',
      v_admins,
      auth.uid()
    );
  end if;

  return v_row;
end;
$$;

grant execute on function public.acknowledge_loan_disbursement(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Live delivery: admin sees new/assigned disbursements + acknowledgments,
-- borrower sees their assigned document appear.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.loan_disbursements;
