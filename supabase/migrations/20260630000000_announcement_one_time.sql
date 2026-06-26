-- ============================================================================
-- LoanLedger PH — Migration 024: one-time (auto-triggered) announcements
--
-- Auto announcements (e.g. fired when the admin approves/rejects a proof of
-- payment) are one-time: shown once to the targeted borrower and then consumed
-- (deleted) on dismiss/auto-close so they never reappear on the next login.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.announcements
  add column if not exists one_time boolean not null default false;

-- Let the targeted recipient delete (consume) their own one-time announcement,
-- so it won't show again on any device. Admins are already covered by "admin all".
create policy "announcements: recipient consume one-time" on public.announcements
  for delete to authenticated using (
    one_time = true and audience = 'targeted' and auth.uid() = any (target_user_ids)
  );
