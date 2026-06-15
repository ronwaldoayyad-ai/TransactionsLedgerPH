-- ============================================================================
-- LoanLedger PH — Migration 005: profile fields + avatars
--
-- 1. Structured name fields (first/last/nickname) and an avatar photo.
--    `name` stays the canonical display name everywhere; it is recomputed on
--    save as nickname (when set) or "first last".
-- 2. Public `avatars` storage bucket (2 MB, images only) with per-user folders.
-- 3. Security-definer RPCs so users can edit their OWN profile/photo without
--    a broad UPDATE policy (which would let borrowers change email or role).
--    Email stays admin-only via the existing admin update policy.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- 1. New profile columns + backfill from the existing display name
alter table public.profiles
  add column if not exists first_name text not null default '',
  add column if not exists last_name  text not null default '',
  add column if not exists nickname   text not null default '',
  add column if not exists avatar_path text;

update public.profiles
set first_name = split_part(name, ' ', 1),
    last_name  = btrim(substr(name, length(split_part(name, ' ', 1)) + 1))
where first_name = '' and name <> '';

-- 2. Avatars bucket: public read, images only, 2 MB cap
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: delete own or admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- 3. Self-service profile RPCs (only the columns users may touch)
create or replace function public.update_my_profile(
  p_first text, p_last text, p_nickname text, p_phone text
)
returns void
language sql security definer set search_path = public as $$
  update public.profiles
  set first_name = btrim(p_first),
      last_name  = btrim(p_last),
      nickname   = btrim(p_nickname),
      phone      = btrim(p_phone),
      name       = coalesce(nullif(btrim(p_nickname), ''),
                            nullif(btrim(btrim(p_first) || ' ' || btrim(p_last)), ''),
                            name)
  where id = auth.uid();
$$;

create or replace function public.set_my_avatar(p_path text)
returns void
language sql security definer set search_path = public as $$
  update public.profiles set avatar_path = p_path where id = auth.uid();
$$;
