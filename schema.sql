create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_type') then
    create type platform_type as enum ('pdd', 'taobao', 'douyin', 'jd', 'other');
  end if;
end
$$;

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  client_local_id bigint,
  platform platform_type not null default 'pdd',
  order_link text not null,
  qr_text text,
  creator_user_id uuid,
  title text,
  cover_image_url text,
  price numeric(10,2),
  original_price numeric(10,2),
  sales_tip text,
  group_size integer not null default 3,
  joined_count integer not null default 1,
  end_time timestamptz,
  top_until timestamptz,
  scrape_status text not null default 'idle',
  scrape_error text,
  scraped_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_posts_published_at_idx on public.group_posts (published_at desc);
create index if not exists group_posts_top_until_idx on public.group_posts (top_until desc);
create index if not exists group_posts_order_link_idx on public.group_posts (order_link);
create index if not exists group_posts_creator_user_id_idx on public.group_posts (creator_user_id);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  nickname text,
  avatar_url text,
  gender integer,
  country text,
  province text,
  city text,
  language text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_client_id_idx on public.users (client_id);

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_name = 'group_posts_creator_user_id_fkey') then
    alter table public.group_posts
      add constraint group_posts_creator_user_id_fkey
      foreign key (creator_user_id) references public.users(id) on delete set null;
  end if;
end
$$;

create table if not exists public.group_post_participants (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null default 'click_buy',
  created_at timestamptz not null default now()
);

create index if not exists group_post_participants_post_id_idx on public.group_post_participants (post_id);
create index if not exists group_post_participants_user_id_idx on public.group_post_participants (user_id);
create index if not exists group_post_participants_created_at_idx on public.group_post_participants (created_at desc);

create table if not exists public.scrape_cache (
  url text primary key,
  final_url text,
  title text,
  image_url text,
  http_status integer,
  error text,
  meta jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create index if not exists scrape_cache_expires_at_idx on public.scrape_cache (expires_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_group_posts_updated_at on public.group_posts;
create trigger set_group_posts_updated_at
before update on public.group_posts
for each row
execute function public.set_updated_at();

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

alter table public.group_posts enable row level security;
alter table public.users enable row level security;
alter table public.group_post_participants enable row level security;
alter table public.scrape_cache enable row level security;

drop policy if exists group_posts_select_all on public.group_posts;
create policy group_posts_select_all
on public.group_posts
for select
using (true);

drop policy if exists group_posts_insert_all on public.group_posts;
create policy group_posts_insert_all
on public.group_posts
for insert
with check (true);

drop policy if exists users_select_all on public.users;
create policy users_select_all
on public.users
for select
using (true);

drop policy if exists users_upsert_all on public.users;
create policy users_upsert_all
on public.users
for insert
with check (true);

drop policy if exists users_update_all on public.users;
create policy users_update_all
on public.users
for update
using (true)
with check (true);

drop policy if exists participants_select_all on public.group_post_participants;
create policy participants_select_all
on public.group_post_participants
for select
using (true);

drop policy if exists participants_insert_all on public.group_post_participants;
create policy participants_insert_all
on public.group_post_participants
for insert
with check (true);

drop policy if exists scrape_cache_select_all on public.scrape_cache;
create policy scrape_cache_select_all
on public.scrape_cache
for select
using (true);
