-- Invoices: admin-generated statements, assigned to a borrower who can then
-- view/download their own. Line items + totals are SNAPSHOTTED at generation
-- time (jsonb) so an assigned invoice is immutable even if the ledger changes.

create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text unique not null,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  billed_to_name     text not null default '',
  status             text not null default 'draft' check (status in ('draft', 'assigned')),
  invoice_date       date not null default (now() at time zone 'Asia/Manila')::date,
  due_date           date,
  selected_due_dates date[] not null default '{}',
  subtotal           numeric(14,2) not null default 0,
  amount_paid        numeric(14,2) not null default 0,
  processing_fee     numeric(14,2) not null default 0,
  total_due          numeric(14,2) not null default 0,
  line_items         jsonb not null default '[]',
  created_by         text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_status_idx  on public.invoices (status);

alter table public.invoices enable row level security;

-- Borrowers see ONLY their own ASSIGNED invoices; admins see everything.
drop policy if exists "invoices: read own assigned or admin" on public.invoices;
create policy "invoices: read own assigned or admin" on public.invoices
  for select to authenticated
  using ((user_id = auth.uid() and status = 'assigned') or public.is_admin());

-- Only admins write. Inserts flow through create_invoice(); update (assign) and
-- delete are direct, admin-only.
drop policy if exists "invoices: admin insert" on public.invoices;
create policy "invoices: admin insert" on public.invoices
  for insert to authenticated with check (public.is_admin());
drop policy if exists "invoices: admin update" on public.invoices;
create policy "invoices: admin update" on public.invoices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "invoices: admin delete" on public.invoices;
create policy "invoices: admin delete" on public.invoices
  for delete to authenticated using (public.is_admin());

-- Atomic unique-number generation + insert. Per-year sequence: INV-YYYY-###.
create or replace function public.create_invoice(
  p_user_id          uuid,
  p_billed_to_name   text,
  p_due_date         date,
  p_selected_due_dates date[],
  p_subtotal         numeric,
  p_amount_paid      numeric,
  p_processing_fee   numeric,
  p_total_due        numeric,
  p_line_items       jsonb
) returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   text := to_char((now() at time zone 'Asia/Manila'), 'YYYY');
  v_seq    int;
  v_number text;
  v_row    public.invoices;
begin
  if not public.is_admin() then
    raise exception 'Not authorized.';
  end if;

  -- Serialize numbering for this year so two generations never collide.
  perform pg_advisory_xact_lock(hashtext('invoice_number_' || v_year));

  select coalesce(max((split_part(invoice_number, '-', 3))::int), 0) + 1
    into v_seq
    from public.invoices
    where invoice_number like 'INV-' || v_year || '-%';

  v_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 3, '0');

  insert into public.invoices (
    invoice_number, user_id, billed_to_name, status, invoice_date, due_date,
    selected_due_dates, subtotal, amount_paid, processing_fee, total_due, line_items, created_by
  ) values (
    v_number, p_user_id, p_billed_to_name, 'draft',
    (now() at time zone 'Asia/Manila')::date, p_due_date,
    coalesce(p_selected_due_dates, '{}'), p_subtotal, p_amount_paid, p_processing_fee,
    p_total_due, coalesce(p_line_items, '[]'::jsonb),
    coalesce((select name from public.profiles where id = auth.uid()), '')
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_invoice(uuid, text, date, date[], numeric, numeric, numeric, numeric, jsonb) to authenticated;
