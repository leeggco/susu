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
  status text not null default 'active',
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
create index if not exists group_posts_status_idx on public.group_posts (status);
create index if not exists group_posts_end_time_idx on public.group_posts (end_time);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  wechat_openid text,
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
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'wechat_openid'
  ) then
    alter table public.users add column wechat_openid text;
  end if;

  begin
    create index if not exists users_wechat_openid_idx on public.users (wechat_openid);
  exception when others then
    null;
  end;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_wechat_openid_key'
  ) then
    alter table public.users add constraint users_wechat_openid_key unique (wechat_openid);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_name = 'group_posts_creator_user_id_fkey') then
    alter table public.group_posts
      add constraint group_posts_creator_user_id_fkey
      foreign key (creator_user_id) references public.users(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_posts' and column_name = 'status') then
    alter table public.group_posts add column status text not null default 'active';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_posts' and column_name = 'published_at') then
    alter table public.group_posts add column published_at timestamptz not null default now();
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_posts' and column_name = 'scrape_status') then
    alter table public.group_posts add column scrape_status text not null default 'idle';
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

create table if not exists public.group_post_submissions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  platform platform_type not null default 'pdd',
  order_link text not null,
  title text,
  cover_image_url text,
  price numeric(10,2),
  original_price numeric(10,2),
  sales_tip text,
  group_size integer not null default 3,
  joined_count integer not null default 0,
  end_time timestamptz,
  top_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  reject_reason text,
  approved_post_id uuid references public.group_posts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_post_submissions_user_id_idx on public.group_post_submissions (user_id);
create index if not exists group_post_submissions_client_id_idx on public.group_post_submissions (client_id);
create index if not exists group_post_submissions_created_at_idx on public.group_post_submissions (created_at desc);

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

drop trigger if exists set_group_post_submissions_updated_at on public.group_post_submissions;
create trigger set_group_post_submissions_updated_at
before update on public.group_post_submissions
for each row
execute function public.set_updated_at();

create or replace function public.set_group_post_status_by_end_time()
returns trigger
language plpgsql
as $$
begin
  if new.status is null or new.status = '' then
    new.status := 'active';
  end if;
  if new.end_time is not null and new.end_time <= now() then
    new.status := 'off';
  end if;
  return new;
end;
$$;

drop trigger if exists set_group_posts_status on public.group_posts;
create trigger set_group_posts_status
before insert or update on public.group_posts
for each row
execute function public.set_group_post_status_by_end_time();

-- 审批自动转换函数
create or replace function public.handle_submission_approval()
returns trigger
language plpgsql
security definer
as $$
declare
  new_post_id uuid;
begin
  -- 只有当状态从非 approved 变为 approved 时才触发
  if (new.status = 'approved' and (old.status is null or old.status != 'approved') and new.approved_post_id is null) then
    -- 向公开拼团表插入数据
    insert into public.group_posts (
      platform,
      order_link,
      creator_user_id,
      title,
      cover_image_url,
      price,
      original_price,
      sales_tip,
      group_size,
      joined_count,
      end_time,
      top_until,
      metadata,
      published_at
    ) values (
      new.platform,
      new.order_link,
      new.user_id,
      new.title,
      new.cover_image_url,
      new.price,
      new.original_price,
      new.sales_tip,
      new.group_size,
      new.joined_count,
      new.end_time,
      new.top_until,
      new.metadata,
      now()
    )
    returning id into new_post_id;

    -- 将生成的公开 ID 和审核时间回填到申请表
    new.approved_post_id := new_post_id;
    new.reviewed_at := now();
  end if;

  return new;
end;
$$;

-- 绑定触发器到提交表
drop trigger if exists on_submission_approved on public.group_post_submissions;
create trigger on_submission_approved
before update on public.group_post_submissions
for each row
execute function public.handle_submission_approval();

create or replace function public.auto_publish_submission()
returns trigger
language plpgsql
security definer
as $$
declare
  new_post_id uuid;
begin
  if new.status is null or new.status = '' or new.status = 'pending' then
    new.status := 'approved';
  end if;

  if new.status = 'approved' then
    insert into public.group_posts (
      platform,
      order_link,
      creator_user_id,
      title,
      cover_image_url,
      price,
      original_price,
      sales_tip,
      group_size,
      joined_count,
      end_time,
      top_until,
      metadata,
      published_at
    ) values (
      new.platform,
      new.order_link,
      new.user_id,
      new.title,
      new.cover_image_url,
      new.price,
      new.original_price,
      new.sales_tip,
      new.group_size,
      new.joined_count,
      new.end_time,
      new.top_until,
      new.metadata,
      now()
    )
    returning id into new_post_id;

    new.approved_post_id := new_post_id;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists on_submission_auto_approve on public.group_post_submissions;
create trigger on_submission_auto_approve
before insert on public.group_post_submissions
for each row
execute function public.auto_publish_submission();

create or replace function public.expire_due_group_posts()
returns void
language plpgsql
security definer
as $$
begin
  update public.group_posts
  set status = 'off'
  where status != 'off'
    and end_time is not null
    and end_time <= now();
end;
$$;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    return;
  end;

  begin
    if exists (select 1 from cron.job where jobname = 'expire_due_group_posts') then
      perform cron.unschedule((select jobid from cron.job where jobname = 'expire_due_group_posts' limit 1));
    end if;
  exception when others then
    null;
  end;

  begin
    perform cron.schedule(
      'expire_due_group_posts',
      '* * * * *',
      'select public.expire_due_group_posts();'
    );
  exception when others then
    null;
  end;
end;
$$;

alter table public.group_posts enable row level security;
alter table public.users enable row level security;
alter table public.group_post_participants enable row level security;
alter table public.group_post_submissions enable row level security;
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
with check (false);

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

drop policy if exists group_post_submissions_select_own on public.group_post_submissions;
create policy group_post_submissions_select_own
on public.group_post_submissions
for select
using (
  client_id = coalesce((current_setting('request.headers', true)::json ->> 'x-client-id'), '')
);

drop policy if exists group_post_submissions_insert_own on public.group_post_submissions;
create policy group_post_submissions_insert_own
on public.group_post_submissions
for insert
with check (
  client_id = coalesce((current_setting('request.headers', true)::json ->> 'x-client-id'), '')
);

drop policy if exists scrape_cache_select_all on public.scrape_cache;
create policy scrape_cache_select_all
on public.scrape_cache
for select
using (true);
