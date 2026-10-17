begin;
-- These identity checks are constant for a statement. InitPlans evaluate them
-- once, preserving every existing owner/admin condition and restrictive guard.
alter policy "profiles: read own or admin" on public.profiles
 using (id=(select auth.uid()) or (select public.is_admin()));
alter policy "loans: read own or admin" on public.loans
 using (user_id=(select auth.uid()) or (select public.is_admin()));
alter policy "loans: admin write" on public.loans
 using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy "transactions: read own active or admin" on public.transactions
 using ((user_id=(select auth.uid()) and archived_at is null) or (select public.is_admin()));
alter policy "transactions: admin write" on public.transactions
 using ((select public.is_admin())) with check ((select public.is_admin()));
commit;
