-- ============================================================================
-- LoanLedger PH — Migration: per-borrower Payment Due overrides
--
-- Replaces the singleton payment_due_config with ONE ROW PER BORROWER, so the
-- admin can pin different due dates for different borrowers at the same time —
-- applying an override for one borrower no longer wipes another's.
--
--   borrower_id -> the profile the override applies to (primary key: one active
--                  override per borrower).
--   due_dates   -> ISO 'YYYY-MM-DD' strings; the borrower's Next Payment Due
--                  tile sums only their receivable installments on these dates.
--
-- RLS: any authenticated user may READ (a borrower reads their own row); only an
-- admin may WRITE.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.
-- ============================================================================

create table if not exists public.payment_due_overrides (
  borrower_id uuid        primary key,
  due_dates   text[]      not null default '{}',
  applied_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.payment_due_overrides enable row level security;

drop policy if exists "payment_due_overrides: read for authenticated" on public.payment_due_overrides;
create policy "payment_due_overrides: read for authenticated"
  on public.payment_due_overrides
  for select to authenticated
  using (true);

drop policy if exists "payment_due_overrides: admin write" on public.payment_due_overrides;
create policy "payment_due_overrides: admin write"
  on public.payment_due_overrides
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Realtime: borrower tiles update the instant the admin applies or clears.
do $$
begin
  alter publication supabase_realtime add table public.payment_due_overrides;
exception
  when duplicate_object then null;
end $$;

-- One-time migration: expand any existing singleton override into per-borrower
-- rows, then retire the old table.
do $$
declare
  cfg record;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_due_config'
  ) then
    select * into cfg from public.payment_due_config where id = true;
    if found and array_length(cfg.due_dates, 1) is not null then
      if cfg.all_borrowers then
        insert into public.payment_due_overrides (borrower_id, due_dates, applied_at, updated_by)
        select p.id, cfg.due_dates, cfg.applied_at, cfg.updated_by
        from public.profiles p
        where p.role = 'user'
        on conflict (borrower_id) do update set due_dates = excluded.due_dates;
      else
        insert into public.payment_due_overrides (borrower_id, due_dates, applied_at, updated_by)
        select bid::uuid, cfg.due_dates, cfg.applied_at, cfg.updated_by
        from unnest(cfg.borrower_ids) as bid
        on conflict (borrower_id) do update set due_dates = excluded.due_dates;
      end if;
    end if;
    -- Dropping the table also removes it from the realtime publication.
    drop table public.payment_due_config;
  end if;
end $$;
