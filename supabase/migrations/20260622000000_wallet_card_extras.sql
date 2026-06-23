-- ============================================================================
-- LoanLedger PH — Migration 016: Card & Bills Wallet — card extras
--
-- Extends the isolated wallet_cards table (no impact on existing app tables):
--   * network_logo      — manual override for the card-network logo (URL/base64)
--   * sort_order         — user-controlled card ordering (Coverflow + list)
--   * naffl              — "No Annual Fee for Life" flag
--   * amf / amf_date     — Annual Membership Fee + anniversary charge date
--                          (only meaningful when naffl = false)
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

alter table public.wallet_cards
  add column if not exists network_logo text,
  add column if not exists sort_order   int  not null default 0,
  add column if not exists naffl        boolean not null default false,
  add column if not exists amf          numeric(14,2) not null default 0 check (amf >= 0),
  add column if not exists amf_date     date;

-- Seed a stable initial order for any existing rows (by creation time).
update public.wallet_cards c
set sort_order = sub.rn
from (
  select id, row_number() over (partition by owner_id order by created_at, id) - 1 as rn
  from public.wallet_cards
) sub
where c.id = sub.id and c.sort_order = 0;
