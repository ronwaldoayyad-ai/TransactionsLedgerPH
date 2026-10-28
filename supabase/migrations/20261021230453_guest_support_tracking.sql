begin;
create table mobile_private.support_verification_challenges (
 id uuid primary key,
 ticket_id uuid references public.support_tickets(id) on delete cascade,
 code_hash text not null check(length(code_hash)=64),
 attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 consumed_at timestamptz
);
create table mobile_private.support_tracking_sessions (
 token_hash text primary key check(length(token_hash)=64),
 ticket_id uuid not null references public.support_tickets(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index support_verification_expiry on mobile_private.support_verification_challenges(expires_at);
create index support_tracking_session_expiry on mobile_private.support_tracking_sessions(expires_at);
alter table mobile_private.support_verification_challenges enable row level security;
alter table mobile_private.support_tracking_sessions enable row level security;
revoke all on mobile_private.support_verification_challenges,mobile_private.support_tracking_sessions from public,anon,authenticated;
commit;
