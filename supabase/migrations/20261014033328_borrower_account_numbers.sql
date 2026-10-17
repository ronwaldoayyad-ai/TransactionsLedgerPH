-- Public-facing account numbers are permanent references, separate from UUID keys.
begin;
create schema if not exists private;
create table if not exists private.borrower_number_counters (
  name_prefix text primary key check (name_prefix ~ '^[0-9]{10}$'),
  last_suffix bigint not null check (last_suffix > 0)
);
alter table private.borrower_number_counters enable row level security;
revoke all on private.borrower_number_counters from public, anon, authenticated;

alter table public.profiles add column if not exists borrower_account_number text;
alter table public.profiles add constraint profiles_borrower_account_number_format
  check (borrower_account_number is null or borrower_account_number ~ '^[0-9]{13,}$');
create unique index profiles_borrower_account_number_unique
  on public.profiles (borrower_account_number) where borrower_account_number is not null;

create or replace function private.borrower_number_prefix(given_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare normalized text; encoded text := ''; letter text;
begin
  normalized := left(regexp_replace(translate(upper(coalesce(given_name,'')),
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ', 'AAAAAAEEEEIIIIOOOOOUUUUNC'), '[^A-Z]', '', 'g'), 5);
  for i in 1..length(normalized) loop
    letter := substr(normalized,i,1);
    encoded := encoded || lpad((ascii(letter)-64)::text,2,'0');
  end loop;
  return rpad(encoded,10,'0');
end $$;
revoke all on function private.borrower_number_prefix(text) from public, anon, authenticated;

create or replace function private.assign_borrower_account_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare prefix text; suffix bigint;
begin
  -- This function is reachable only through the profile trigger. Existing
  -- profile policies govern callers; no direct API execution is granted.
  if TG_OP = 'UPDATE' and OLD.borrower_account_number is not null then
    if NEW.borrower_account_number is distinct from OLD.borrower_account_number then
      raise exception 'Borrower account numbers cannot be changed.' using errcode='42501';
    end if;
    return NEW;
  end if;
  if NEW.role::text <> 'user' then NEW.borrower_account_number := null; return NEW; end if;
  prefix := private.borrower_number_prefix(coalesce(nullif(btrim(NEW.first_name),''),split_part(btrim(NEW.name),' ',1)));
  -- ON CONFLICT locks one prefix row and increments atomically. Suffixes are
  -- never reused after a profile is deleted; values above 999 grow naturally.
  insert into private.borrower_number_counters(name_prefix,last_suffix) values(prefix,1)
    on conflict(name_prefix) do update
      set last_suffix = private.borrower_number_counters.last_suffix + 1
    returning last_suffix into suffix;
  NEW.borrower_account_number := prefix || lpad(suffix::text,greatest(3,length(suffix::text)),'0');
  return NEW;
end $$;
revoke all on function private.assign_borrower_account_number() from public, anon, authenticated;
create trigger assign_borrower_account_number before insert or update of role,borrower_account_number
  on public.profiles for each row execute function private.assign_borrower_account_number();

-- Backfill only this new display field in deterministic profile order.
do $$ declare row_id uuid; begin
  for row_id in select id from public.profiles where role::text='user' and borrower_account_number is null order by created_at,id loop
    update public.profiles set borrower_account_number=null where id=row_id;
  end loop;
end $$;
comment on column public.profiles.borrower_account_number is 'Permanent numeric borrower reference: encoded first five given-name letters, zero-padded to 10 digits, followed by a unique prefix suffix of at least three digits.';
notify pgrst, 'reload schema';
commit;
