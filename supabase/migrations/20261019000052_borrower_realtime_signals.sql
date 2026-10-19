begin;
-- Publish only invalidation metadata. Clients re-read their RLS-scoped records;
-- message bodies and deleted-row payloads never travel on these signal tables.
do $$declare t text;begin
 foreach t in array array['message_change_signals','payment_due_change_signals'] loop
  execute format('create table public.%I (borrower_id uuid primary key references public.profiles(id) on update cascade on delete cascade, version bigint not null default 1, updated_at timestamptz not null default now())',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy owner_or_lender on public.%I for select to authenticated using (mobile_private.valid_session() and (borrower_id=(select auth.uid()) or public.is_admin()))',t);
  execute format('create policy mobile_live_session on public.%I as restrictive to authenticated using (mobile_private.valid_session())',t);
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
   execute format('alter publication supabase_realtime add table public.%I',t);
  end if;
 end loop;
end $$;
create function mobile_private.signal_borrower_live_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare target text; owners uuid[]; owner_id uuid;
begin
 if tg_op='UPDATE' and new is not distinct from old then return new;end if;
 if tg_table_schema<>'public' or tg_table_name not in ('messages','payment_due_overrides') then raise exception 'Unsupported change source';end if;
 target=case when tg_table_name='messages' then 'message_change_signals' else 'payment_due_change_signals' end;
 if tg_op='INSERT' then owners=array[new.borrower_id];
 elsif tg_op='DELETE' then owners=array[old.borrower_id];
 else owners=array[old.borrower_id,new.borrower_id];end if;
 for owner_id in select distinct unnest(owners) loop
  -- Cascading profile deletion must not recreate a removed owner's signal.
  if exists(select 1 from public.profiles where id=owner_id) then
   execute format('insert into public.%I as s(borrower_id) values($1) on conflict(borrower_id) do update set version=s.version+1,updated_at=clock_timestamp()',target) using owner_id;
  end if;
 end loop;
 return null;
end $$;
revoke all on function mobile_private.signal_borrower_live_change() from public,anon,authenticated;
create trigger messages_live_signal after insert or update or delete on public.messages for each row execute function mobile_private.signal_borrower_live_change();
create trigger payment_due_live_signal after insert or update or delete on public.payment_due_overrides for each row execute function mobile_private.signal_borrower_live_change();
commit;
