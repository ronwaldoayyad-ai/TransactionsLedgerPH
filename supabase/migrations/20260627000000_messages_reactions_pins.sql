-- ============================================================================
-- LoanLedger PH — Migration 021: messaging — reactions, pinning, deletes,
--                                 and lender visibility for borrowers
--
-- Builds on migration 020 (messages). Adds emoji reactions and a pin flag per
-- message, lets either party delete messages in their own conversation, and
-- lets borrowers read the lender's profile so the admin's name/photo show in
-- the borrower chat.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.messages
  add column if not exists reactions jsonb   not null default '{}'::jsonb,  -- { admin: '👍', borrower: '❤️' }
  add column if not exists pinned    boolean not null default false;

-- Either party may delete messages in their own conversation (single message or
-- whole history). The admin is already covered by the "admin all" policy from 020.
create policy "messages: borrower delete own" on public.messages
  for delete to authenticated using (borrower_id = auth.uid());

-- Let any signed-in user read the lender's (admin) profile — name + avatar_path
-- — so the borrower chat can show the admin's real photo and name. Admins
-- already read all profiles.
create policy "profiles: read the lender" on public.profiles
  for select to authenticated using (role = 'admin');
