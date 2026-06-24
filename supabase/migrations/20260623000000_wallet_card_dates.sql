-- ============================================================================
-- LoanLedger PH — Migration 017: Card & Bills Wallet — card dates
--
-- Adds expiry + activation dates to the isolated wallet_cards table. The card
-- "age in possession" is derived from activation_date vs. today in the app
-- (expiry_date is stored for reference only and is NOT used in that math).
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.wallet_cards
  add column if not exists expiry_date     date,
  add column if not exists activation_date date;
