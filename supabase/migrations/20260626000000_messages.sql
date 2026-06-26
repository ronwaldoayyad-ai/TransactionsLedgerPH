-- ============================================================================
-- LoanLedger PH — Migration 020: In-app messaging (borrower ⇄ lender)
--
-- Two-way direct messages between each borrower and the admin/lender. A
-- "conversation" is keyed by borrower_id; from_admin marks the direction.
-- read_at = null means unread (drives the sidebar badge on both sides).
--
-- Realtime: the table is added to the supabase_realtime publication so both
-- parties receive INSERT/UPDATE events live (RLS still filters what each sees).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  borrower_id uuid not null,                         -- the borrower party (profiles.id)
  sender_id   uuid not null default auth.uid(),      -- who actually sent it
  from_admin  boolean not null,                      -- true = lender → borrower
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now(),
  read_at     timestamptz                            -- null = unread by the recipient
);

create index messages_borrower_idx on public.messages (borrower_id, created_at);
create index messages_unread_idx   on public.messages (borrower_id, from_admin) where read_at is null;

alter table public.messages enable row level security;

-- A borrower sees and writes only their own conversation; they can only send
-- borrower-side messages, and may flag admin messages as read.
create policy "messages: borrower read own" on public.messages
  for select to authenticated using (borrower_id = auth.uid());
create policy "messages: borrower send own" on public.messages
  for insert to authenticated with check (borrower_id = auth.uid() and from_admin = false);
create policy "messages: borrower mark read" on public.messages
  for update to authenticated using (borrower_id = auth.uid()) with check (borrower_id = auth.uid());

-- The admin/lender can read, send to, and update every conversation.
create policy "messages: admin all" on public.messages
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Live delivery for both parties.
alter publication supabase_realtime add table public.messages;
