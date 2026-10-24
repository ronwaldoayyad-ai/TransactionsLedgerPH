begin;
set local lock_timeout='5s';
create table mobile_private.telegram_settings(
 singleton boolean primary key default true check(singleton),
 version integer not null default 1,
 enabled boolean not null default false,
 chat_id text check(chat_id ~ '^[1-9][0-9]{0,19}$'),
 chat_label text,
 last_worker_error text,
 bot_id text,
 connected_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 check(not enabled or (chat_id is not null and bot_id is not null))
);
insert into mobile_private.telegram_settings(singleton) values(true);
create table mobile_private.telegram_connections(
 actor_id uuid primary key references public.profiles(id) on delete cascade,
 nonce_hash text not null,
 bot_id text not null,
 expires_at timestamptz not null
);
create table mobile_private.telegram_deliveries(
 id uuid primary key default gen_random_uuid(),
 payment_id uuid unique,
 kind text not null default 'proof' check(kind in ('proof','test')),
 destination text not null check(destination ~ '^[1-9][0-9]{0,19}$'),
 bot_id text not null,
 settings_version integer not null,
 payload jsonb not null,
 status text not null default 'queued' check(status in ('queued','sending','retry','delivered','failed','uncertain','cancelled')),
 attempts integer not null default 0,
 next_at timestamptz not null default now(),
 sending_at timestamptz,
 delivered_at timestamptz,
 message_id text,
 last_error text,
 created_at timestamptz not null default now()
);
create index telegram_ready on mobile_private.telegram_deliveries(next_at,created_at) where status in ('queued','retry');
create table mobile_private.telegram_audit(
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references public.profiles(id) on delete set null,
 operation text not null,
 detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table mobile_private.telegram_settings enable row level security;
alter table mobile_private.telegram_connections enable row level security;
alter table mobile_private.telegram_deliveries enable row level security;
alter table mobile_private.telegram_audit enable row level security;
revoke all on mobile_private.telegram_settings,mobile_private.telegram_connections,mobile_private.telegram_deliveries,mobile_private.telegram_audit from public,anon,authenticated;
-- Queue a snapshot only for future successfully inserted proofs. No backfill and no HTTP in the payment transaction.
create function mobile_private.queue_telegram_proof() returns trigger
language plpgsql security definer set search_path='' as $$
declare s mobile_private.telegram_settings; borrower_name text;
begin
 if new.status::text<>'pending' or coalesce(new.file_path,'')='' then return new;end if;
 select * into s from mobile_private.telegram_settings where singleton and enabled;
 if not found then return new;end if;
 select name into borrower_name from public.profiles where id=new.user_id and role::text='user';
 if not found then return new;end if;
 insert into mobile_private.telegram_deliveries(payment_id,destination,bot_id,settings_version,payload)
 values(new.id,s.chat_id,s.bot_id,s.version,jsonb_build_object('borrower',borrower_name,'amount',new.amount,'reference',coalesce(nullif(new.receipt_number,''),new.id::text),'submittedAt',coalesce(new.submitted_at_exact,clock_timestamp())))
 on conflict(payment_id) do nothing;
 return new;
end $$;
revoke all on function mobile_private.queue_telegram_proof() from public,anon,authenticated;
create trigger telegram_new_proof after insert on public.payments for each row execute function mobile_private.queue_telegram_proof();
-- Existing notification event wake-ups and the canonical one-minute worker also process this independent queue.
commit;
