-- Server-owned release assignments. No changes to Auth, roles or financial data.
begin;
create table mobile_private.release_settings (
  id smallint primary key default 1 check (id=1),
  rollout_enabled boolean not null default false,
  default_interface text not null default 'classic' check (default_interface in ('classic','new')),
  version integer not null default 1 check (version>0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table mobile_private.release_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  interface text not null check (interface in ('classic','new')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create table mobile_private.release_history (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('settings','assign')),
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table mobile_private.release_settings enable row level security;
alter table mobile_private.release_assignments enable row level security;
alter table mobile_private.release_history enable row level security;
revoke all on mobile_private.release_settings,mobile_private.release_assignments,mobile_private.release_history from public,anon,authenticated;
revoke all on sequence mobile_private.release_history_id_seq from public,anon,authenticated;
-- A production migration starts paused. Local bootstrap is intentionally separate.
insert into mobile_private.release_settings(id) values(1);
commit;
