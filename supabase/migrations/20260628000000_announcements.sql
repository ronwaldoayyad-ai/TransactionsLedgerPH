-- ============================================================================
-- LoanLedger PH — Migration 022: Admin announcement system
--
-- Admin-authored announcements pushed to borrowers on login / in real time.
-- Two render types: 'toast' (top-right) and 'banner' (push-down). Audience is
-- either 'all' borrowers or a 'targeted' set of user ids. Each has an optional
-- validity window (starts_at / expires_at).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.announcements (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('toast', 'banner')),
  title           text not null default '',
  body            text not null check (length(btrim(body)) > 0),
  audience        text not null default 'all' check (audience in ('all', 'targeted')),
  target_user_ids uuid[] not null default '{}',                 -- used when audience = 'targeted'
  created_by      uuid not null default auth.uid(),
  starts_at       timestamptz not null default now(),
  expires_at      timestamptz,                                  -- null = no expiry
  created_at      timestamptz not null default now()
);

create index announcements_expiry_idx on public.announcements (expires_at);

alter table public.announcements enable row level security;

-- Recipients see only currently-valid announcements addressed to them.
create policy "announcements: read active" on public.announcements
  for select to authenticated using (
    (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
    and (audience = 'all' or auth.uid() = any (target_user_ids))
  );

-- The admin authors and manages every announcement (incl. expired ones).
create policy "announcements: admin all" on public.announcements
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Live delivery: borrowers get new announcements without a refresh.
alter publication supabase_realtime add table public.announcements;
