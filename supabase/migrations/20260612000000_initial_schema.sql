-- ============================================================================
-- LoanLedger PH — Initial Schema (Phase 2 backend)
-- Implements PRD.md §7 (Data Model) and §9 (Backend Integration Requirements)
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run once on a fresh project.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------
create type public.user_role      as enum ('admin', 'user');
create type public.user_status    as enum ('invited', 'active', 'disabled');
create type public.loan_txn_type  as enum ('installment', 'straight');
create type public.loan_status    as enum ('active', 'closed');
create type public.txn_status     as enum ('paid', 'unpaid', 'refunded', 'cancelled', 'past_due');
create type public.payment_method as enum ('GCash', 'Maya', 'Bank Transfer', 'Cash Deposit');
create type public.payment_status as enum ('pending', 'approved', 'rejected');
create type public.audit_action   as enum (
  'INVITE_SENT', 'USER_UPDATED', 'USER_DELETED',
  'PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED',
  'LOAN_ASSIGNED', 'LOAN_UNASSIGNED',
  'PAYMENT_STATUS_UPDATED', 'TXN_UPDATED', 'TXN_ARCHIVED', 'TXN_RESTORED'
);

-- ---------------------------------------------------------------------------
-- 2. PROFILES  (PRD §7.1 User — credentials live in auth.users)
--    id matches auth.users.id for real accounts. No hard FK so demo rows can
--    be seeded before any auth user exists.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null unique,
  phone       text not null default '',
  role        public.user_role   not null default 'user',
  status      public.user_status not null default 'invited',
  invited_at  date not null default current_date,
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. LOANS  (PRD §7.2 — disclosure figures are derivable, schedule lives in
--    transactions; ids stay text to match the prototype contract "ln-1001")
-- ---------------------------------------------------------------------------
create sequence public.loan_id_seq start 1001;

create table public.loans (
  id                   text primary key default ('ln-' || nextval('public.loan_id_seq')),
  user_id              uuid not null references public.profiles (id) on delete cascade,
  label                text not null,                              -- "Description" in the UI
  txn_type             public.loan_txn_type not null default 'installment',
  principal            numeric(12,2) not null check (principal > 0),
  monthly_rate         numeric(6,4)  not null default 0 check (monthly_rate >= 0),
  duration_months      int           not null check (duration_months between 1 and 60),
  txn_date             date          not null,
  first_payment_date   date          not null,
  dst                  numeric(12,2) not null default 0 check (dst >= 0),
  processing_fee       numeric(12,2) not null default 0 check (processing_fee >= 0),
  notarial_fee         numeric(12,2) not null default 0 check (notarial_fee >= 0),
  deduct_from_proceeds boolean       not null default true,
  status               public.loan_status not null default 'active',
  created_at           timestamptz   not null default now(),
  -- BR-MATH-6: straight transactions are a single payment
  constraint straight_is_single_payment
    check (txn_type <> 'straight' or duration_months = 1)
);

create index loans_user_id_idx on public.loans (user_id);

-- ---------------------------------------------------------------------------
-- 4. TRANSACTIONS  (PRD §7.3 — the installment ledger, system of record)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id          text primary key,                                    -- "{loanId}-{n}" via trigger
  loan_id     text not null references public.loans (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  n           int  not null check (n >= 1),
  description text not null,
  amount      numeric(12,2) not null check (amount >= 0),
  type        text not null check (type in ('Installment', 'Straight')),
  txn_date    date not null,                                       -- editable (LGR-2)
  due_date    date not null,                                       -- editable (LGR-2)
  status      public.txn_status not null default 'unpaid',
  date_paid   date,                                                -- editable (LGR-2/LGR-3)
  archived_at date,                                                -- soft delete (LGR-9)
  unique (loan_id, n),
  -- LGR-4 side effects: paid requires a date; unpaid/cancelled/past_due clear it;
  -- refunded keeps whatever payment date existed (may be null if never paid).
  constraint date_paid_matches_status check (
       (status = 'paid'     and date_paid is not null)
    or (status = 'refunded')
    or (status in ('unpaid', 'cancelled', 'past_due') and date_paid is null)
  )
);

create index transactions_user_id_idx  on public.transactions (user_id);
create index transactions_loan_id_idx  on public.transactions (loan_id);
create index transactions_due_date_idx on public.transactions (due_date);
create index transactions_status_idx   on public.transactions (status);

-- Default the id to "{loanId}-{n}" (PRD §7.3)
create or replace function public.set_transaction_id()
returns trigger language plpgsql as $$
begin
  new.id := coalesce(new.id, new.loan_id || '-' || new.n);
  return new;
end $$;

create trigger transactions_set_id
  before insert on public.transactions
  for each row execute function public.set_transaction_id();

-- LGR-5 / §9.5: effective status computed at READ time, never persisted over a
-- stored non-'unpaid' status. security_invoker keeps base-table RLS in force.
create view public.transactions_effective
with (security_invoker = true) as
select
  t.*,
  case
    when t.status = 'unpaid' and t.due_date < current_date then 'past_due'
    else t.status::text
  end as effective_status
from public.transactions t;

-- ---------------------------------------------------------------------------
-- 5. PAYMENTS  (PRD §7.4 — proofs of payment; files live in Storage)
-- ---------------------------------------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  loan_id      text not null references public.loans (id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  method       public.payment_method not null,
  reference    text not null default '—',
  file_name    text not null,
  file_type    text not null check (file_type in ('image', 'pdf')),
  file_path    text not null,                                      -- storage object path
  submitted_at date not null default current_date,
  status       public.payment_status not null default 'pending',
  reviewed_at  date,
  note         text not null default '',
  -- VQ-3: rejection requires a reason shown to the borrower
  constraint rejection_requires_note check (status <> 'rejected' or note <> '')
);

create index payments_user_id_idx on public.payments (user_id);
create index payments_status_idx  on public.payments (status);

-- ---------------------------------------------------------------------------
-- 6. AUDIT LOG  (PRD §7.5 — append-only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text not null,
  action public.audit_action not null,
  detail text not null
);

create index audit_log_at_idx on public.audit_log (at desc);

-- ---------------------------------------------------------------------------
-- 7. AUTH WIRING  (PRD §2.2 — invite-only)
--    Invite users from Dashboard → Authentication → Users → "Invite user"
--    (or supabase.auth.admin.inviteUserByEmail server-side). A profile row is
--    created automatically. The FIRST account ever created becomes the admin.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, phone, role, status, invited_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when not exists (select 1 from public.profiles where role = 'admin')
         then 'admin'::public.user_role else 'user'::public.user_role end,
    'invited',
    current_date
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Track last_login (UM-1)
create or replace function public.handle_user_signin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_login = new.last_sign_in_at where id = new.id;
  return new;
end $$;

create trigger on_auth_user_signin
  after update of last_sign_in_at on auth.users
  for each row
  when (old.last_sign_in_at is distinct from new.last_sign_in_at)
  execute function public.handle_user_signin();

-- AUTH-3: called by the app right after the user sets a permanent password
create or replace function public.activate_my_account()
returns void
language sql security definer set search_path = public as $$
  update public.profiles set status = 'active'
  where id = auth.uid() and status = 'invited';
$$;

-- ---------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY  (PRD §9.8 authorization invariants)
--    Borrowers: read own data only; may create payment proofs.
--    Admin: everything. All other writes are admin-only.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status <> 'disabled'
  );
$$;

alter table public.profiles     enable row level security;
alter table public.loans        enable row level security;
alter table public.transactions enable row level security;
alter table public.payments     enable row level security;
alter table public.audit_log    enable row level security;

-- profiles
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: admin insert" on public.profiles
  for insert to authenticated with check (public.is_admin());
create policy "profiles: admin update" on public.profiles
  for update to authenticated using (public.is_admin());
create policy "profiles: admin delete" on public.profiles
  for delete to authenticated using (public.is_admin());

-- loans
create policy "loans: read own or admin" on public.loans
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "loans: admin write" on public.loans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- transactions (borrowers never see archived rows — BD-3 / BLD-4)
create policy "transactions: read own active or admin" on public.transactions
  for select to authenticated
  using ((user_id = auth.uid() and archived_at is null) or public.is_admin());
create policy "transactions: admin write" on public.transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- payments (borrowers may submit proofs for themselves, always as pending)
create policy "payments: read own or admin" on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "payments: borrower submit own pending" on public.payments
  for insert to authenticated
  with check ((user_id = auth.uid() and status = 'pending') or public.is_admin());
create policy "payments: admin update" on public.payments
  for update to authenticated using (public.is_admin());
create policy "payments: admin delete" on public.payments
  for delete to authenticated using (public.is_admin());

-- audit log (append-only: authenticated may insert; only admin reads;
-- no update/delete policies exist, so updates/deletes are denied)
create policy "audit: admin read" on public.audit_log
  for select to authenticated using (public.is_admin());
create policy "audit: authenticated append" on public.audit_log
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- 9. STORAGE — payment proof files (BPAY-1/BPAY-3, §9.6)
--    Private bucket; borrowers upload into a folder named after their uid;
--    owner and admin can read; admin can delete.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false,
  10485760,  -- 10 MB (BPAY-1)
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "proofs: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "proofs: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "proofs: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. OPTIONAL DEMO SEED (uncomment to insert the prototype's demo borrowers)
--     These profile rows have no auth accounts, so nobody can log in as them;
--     they exist so the ledger/calculator can be exercised immediately.
-- ---------------------------------------------------------------------------
-- insert into public.profiles (id, name, email, phone, role, status, invited_at, last_login) values
--   ('00000000-0000-4000-8000-000000000001', 'Maria Santos',  'maria.santos@example.com',  '+63 917 555 0101', 'user', 'active',  '2026-04-02', '2026-06-10'),
--   ('00000000-0000-4000-8000-000000000002', 'Jose Ramirez',  'jose.ramirez@example.com',  '+63 928 555 0144', 'user', 'active',  '2026-04-15', '2026-06-08'),
--   ('00000000-0000-4000-8000-000000000003', 'Ana Dela Cruz', 'ana.delacruz@example.com',  '+63 915 555 0188', 'user', 'invited', '2026-06-09', null);
