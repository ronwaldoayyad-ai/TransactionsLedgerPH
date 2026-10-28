begin;
create table public.notification_categories (
 value text primary key check(value ~ '^[a-z][a-z0-9-]{1,39}$'),
 label text not null check(length(trim(label)) between 2 and 60),
 filipino_label text not null default '' check(length(filipino_label)<=60),
 icon text not null default 'bell' check(icon in ('bell','wallet','file','users','alert','mail','check','clock')),
 color text not null default 'slate' check(color in ('slate','blue','emerald','violet','amber','rose')),
 version integer not null default 1,
 deleted_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null
);
insert into public.notification_categories(value,label,filipino_label,icon,color) values
 ('payment','Payment','Bayad','wallet','emerald'),('document','Document','Dokumento','file','blue'),
 ('account','Account','Account','users','violet'),('general','General','Pangkalahatan','alert','slate'),
 ('promo','Promotion','Alok','bell','amber'),('feature','Feature update','Bagong feature','bell','blue');
alter table public.notification_categories enable row level security;
revoke all on public.notification_categories from public,anon,authenticated;
grant select on public.notification_categories to authenticated;
create policy notification_category_read on public.notification_categories for select to authenticated using(true);
alter table public.notifications drop constraint if exists notifications_category_check;
alter table public.notification_templates drop constraint if exists notification_templates_category_check;
alter table public.notifications add constraint notifications_category_reference foreign key(category) references public.notification_categories(value);
alter table public.notification_templates add constraint notification_templates_category_reference foreign key(category) references public.notification_categories(value);
-- Soft deletion preserves references, old labels, read state and existing rules.
create index if not exists notifications_category_idx on public.notifications(category);
create index if not exists notification_templates_category_idx on public.notification_templates(category);
commit;
