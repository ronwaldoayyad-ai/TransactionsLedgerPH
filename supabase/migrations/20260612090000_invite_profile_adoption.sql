-- ============================================================================
-- LoanLedger PH — Migration 002: invite profile adoption
--
-- The app's "Invite new user" creates the profile row first (so loans can be
-- assigned immediately). When the real auth invitation is later sent for the
-- same email (Dashboard → Authentication → Invite user, or an Edge Function),
-- the new auth account must ADOPT that existing profile instead of colliding
-- on the unique email. Profile ids cascade into loans/transactions/payments.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- 1. Let a profile id change propagate to its records
alter table public.loans
  drop constraint loans_user_id_fkey,
  add constraint loans_user_id_fkey
    foreign key (user_id) references public.profiles (id)
    on delete cascade on update cascade;

alter table public.transactions
  drop constraint transactions_user_id_fkey,
  add constraint transactions_user_id_fkey
    foreign key (user_id) references public.profiles (id)
    on delete cascade on update cascade;

alter table public.payments
  drop constraint payments_user_id_fkey,
  add constraint payments_user_id_fkey
    foreign key (user_id) references public.profiles (id)
    on delete cascade on update cascade;

-- 2. On auth-account creation: adopt a pre-created profile with the same
--    email (relinking its id — loans/ledger/payments follow via cascade);
--    otherwise create a fresh profile as before.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set id = new.id
  where email = new.email and id <> new.id;

  if not found then
    insert into public.profiles (id, name, email, phone, role, status, invited_at)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      new.email,
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      case when not exists (select 1 from public.profiles where role = 'admin')
           then 'admin'::public.user_role else 'user'::public.user_role end,
      'invited',
      current_date
    )
    on conflict (id) do nothing;
  end if;

  return new;
end $$;
