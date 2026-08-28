-- ============================================================================
-- LoanLedger PH — Migration 037: Notification Center
--
-- Admin-authored notifications delivered to borrowers, with a category, optional
-- embedded attachments, and 'all' | 'targeted' audience. Read state is tracked
-- per borrower in a companion table so a borrower can mark items read/unread and
-- the admin can see how many recipients have read each notification.
--
-- Replies reuse the existing `messages` thread (the borrower posts a quoted copy
-- of the notification), so no reply table is needed here.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  category        text not null check (category in ('payment', 'document', 'account', 'general')),
  title           text not null default '',
  body            text not null check (length(btrim(body)) > 0),
  audience        text not null default 'all' check (audience in ('all', 'targeted')),
  target_user_ids uuid[] not null default '{}',                 -- used when audience = 'targeted'
  attachments     jsonb not null default '[]'::jsonb,           -- [{ name, type, size, dataUrl }]
  created_by      uuid not null default auth.uid(),
  created_at      timestamptz not null default now()
);

create index notifications_created_idx on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- Recipients see only notifications addressed to them.
create policy "notifications: read own" on public.notifications
  for select to authenticated using (
    audience = 'all' or auth.uid() = any (target_user_ids)
  );

-- The admin authors and manages every notification.
create policy "notifications: admin all" on public.notifications
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------------------------
-- Per-borrower read state. One row per (notification, borrower) that has been
-- read; absence of a row means unread.
-- ---------------------------------------------------------------------------
create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index notification_reads_user_idx on public.notification_reads (user_id);

alter table public.notification_reads enable row level security;

-- A borrower manages only their own read rows.
create policy "notification_reads: own read" on public.notification_reads
  for select to authenticated using (auth.uid() = user_id);
create policy "notification_reads: own write" on public.notification_reads
  for insert to authenticated with check (auth.uid() = user_id);
create policy "notification_reads: own delete" on public.notification_reads
  for delete to authenticated using (auth.uid() = user_id);

-- The admin can read every read-receipt (to show per-notification read counts).
create policy "notification_reads: admin read" on public.notification_reads
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Live delivery: both tables stream so borrowers get notifications and the admin
-- sees read receipts without a refresh.
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.notification_reads;
