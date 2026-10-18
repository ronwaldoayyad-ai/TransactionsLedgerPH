-- New accounting table: ownership reads and FK checks share this index.
begin;
create index payment_allocations_user on public.payment_allocations(user_id,posting_id);
commit;
