-- ============================================================================
-- LoanLedger PH — Migration 026: Borrower self-service Loan Requests
--
-- Borrowers (when enabled by the admin) file a cash-loan request with bank
-- details + a live amortization preview. The admin configures per-term rates,
-- gates who may apply, and moves each request through an 8-status workflow with
-- a history timeline. This is a standalone intake/tracking module — approving a
-- request does NOT create a real loan; the admin still assigns the actual loan
-- via the existing Calculator.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Per-term monthly add-on rates (admin-configured, borrower reads them).
-- ---------------------------------------------------------------------------
create table public.loan_request_rates (
  term_months  int primary key check (term_months in (3, 6, 12, 24, 36)),
  monthly_rate numeric(8,6) not null default 0 check (monthly_rate >= 0),
  updated_at   timestamptz not null default now()
);

alter table public.loan_request_rates enable row level security;

create policy "loan rates: read all" on public.loan_request_rates
  for select to authenticated using (true);
create policy "loan rates: admin write" on public.loan_request_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Seed the five terms with the current defaults (decimal fractions of 1).
insert into public.loan_request_rates (term_months, monthly_rate) values
  (3, 0.012000), (6, 0.014500), (12, 0.017000), (24, 0.019500), (36, 0.022000);

-- ---------------------------------------------------------------------------
-- 2) Per-borrower eligibility (default OFF: no row / enabled=false = blocked).
-- ---------------------------------------------------------------------------
create table public.loan_request_access (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.loan_request_access enable row level security;

create policy "loan access: read own or admin" on public.loan_request_access
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loan access: admin write" on public.loan_request_access
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Loan requests + their status history.
-- ---------------------------------------------------------------------------
create sequence if not exists public.loan_request_seq;

create table public.loan_requests (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique,                         -- set by trigger below
  user_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount              numeric(16,2) not null check (amount > 0),
  term_months         int not null check (term_months in (3, 6, 12, 24, 36)),
  monthly_rate        numeric(8,6) not null,               -- snapshot at submission
  bank_name           text not null,
  bank_account_number text not null,
  bank_account_name   text not null,
  processing_fee      numeric(16,2) not null default 1500,
  notarial_fee        numeric(16,2) not null default 0,
  dst                 numeric(16,2) not null default 0,
  status              text not null default 'submitted'
    check (status in ('submitted','pending','coordinating','bank_approved',
                      'transfer','completed','declined','canceled')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index loan_requests_user_idx on public.loan_requests (user_id);
create index loan_requests_status_idx on public.loan_requests (status);

-- Human-friendly reference: LOAN-YYYYMMDD-#### (global increment).
create or replace function public.set_loan_request_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null then
    new.reference := 'LOAN-' || to_char(now(), 'YYYYMMDD') || '-'
      || lpad(nextval('public.loan_request_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger loan_requests_set_reference
  before insert on public.loan_requests
  for each row execute function public.set_loan_request_reference();

alter table public.loan_requests enable row level security;

create policy "loan requests: read own or admin" on public.loan_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- Admin may edit (fee overrides). Inserts flow only through submit_loan_request.
create policy "loan requests: admin update" on public.loan_requests
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.loan_request_events (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.loan_requests(id) on delete cascade,
  status     text not null,
  note       text not null default '',
  actor      text not null default '',
  created_at timestamptz not null default now()
);

create index loan_request_events_request_idx on public.loan_request_events (request_id, created_at);

alter table public.loan_request_events enable row level security;

-- Read events for a request you own (or any, if admin). Writes go via RPCs.
create policy "loan events: read own or admin" on public.loan_request_events
  for select to authenticated using (
    exists (
      select 1 from public.loan_requests r
      where r.id = request_id and (r.user_id = auth.uid() or public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Write RPCs (SECURITY DEFINER — internal auth checks).
-- ---------------------------------------------------------------------------

-- Borrower files a request. Verifies eligibility, snapshots the term rate,
-- computes notarial (0.35%) + DST (₱1.50/₱200 when ≥₱500k), and logs the
-- opening timeline event. Returns the new request row.
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

-- Admin transitions a request and logs the event (actor = admin name).
create or replace function public.update_loan_request_status(
  p_id uuid,
  p_status text,
  p_note text
)
returns public.loan_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.loan_requests;
  v_actor text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;
  if p_status not in ('submitted','pending','coordinating','bank_approved',
                      'transfer','completed','declined','canceled') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select coalesce(name, 'Admin') into v_actor from public.profiles where id = auth.uid();

  update public.loan_requests
     set status = p_status, updated_at = now()
   where id = p_id
   returning * into v_row;
  if v_row.id is null then
    raise exception 'Loan request not found.';
  end if;

  insert into public.loan_request_events (request_id, status, note, actor)
  values (p_id, p_status, coalesce(p_note, ''), v_actor);

  return v_row;
end;
$$;

-- Borrower cancels their own request while it is still early in the workflow.
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
grant execute on function public.update_loan_request_status(uuid, text, text) to authenticated;
grant execute on function public.cancel_my_loan_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Live delivery: admin sees new requests, borrower sees status changes.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.loan_requests;
alter publication supabase_realtime add table public.loan_request_events;
alter publication supabase_realtime add table public.loan_request_rates;
alter publication supabase_realtime add table public.loan_request_access;
