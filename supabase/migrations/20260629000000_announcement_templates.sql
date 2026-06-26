-- ============================================================================
-- LoanLedger PH — Migration 023: Announcement templates
--
-- Reusable admin-authored templates (named title + body, per type) so the admin
-- can pick a frequently-used message instead of retyping it. Admin-only.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.announcement_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  type       text not null default 'toast' check (type in ('toast', 'banner')),
  title      text not null default '',
  body       text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.announcement_templates enable row level security;

create policy "announcement_templates: admin all" on public.announcement_templates
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
