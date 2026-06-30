create table if not exists public.explore_hashtags (
  tag text primary key check (tag = lower(tag) and tag ~ '^[a-z0-9_]{1,50}$'),
  usage_count bigint not null default 0 check (usage_count >= 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.explore_user_hashtags (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null references public.explore_hashtags(tag) on delete cascade,
  usage_count bigint not null default 0 check (usage_count >= 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, tag)
);

create index if not exists explore_hashtags_usage_idx
  on public.explore_hashtags (usage_count desc, last_used_at desc);

create index if not exists explore_user_hashtags_recent_idx
  on public.explore_user_hashtags (user_id, usage_count desc, last_used_at desc);

alter table public.explore_hashtags enable row level security;
alter table public.explore_user_hashtags enable row level security;

drop policy if exists "Explore hashtags are readable" on public.explore_hashtags;
create policy "Explore hashtags are readable"
  on public.explore_hashtags for select
  to authenticated
  using (true);

drop policy if exists "Users read their saved hashtags" on public.explore_user_hashtags;
create policy "Users read their saved hashtags"
  on public.explore_user_hashtags for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.record_explore_hashtags(p_hashtags text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_tag text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  for normalized_tag in
    select distinct lower(regexp_replace(btrim(source_tag, ' #'), '[^a-zA-Z0-9_]', '', 'g'))
    from unnest(coalesce(p_hashtags, '{}'::text[])) as tags(source_tag)
  loop
    if normalized_tag = '' or length(normalized_tag) > 50 then
      continue;
    end if;

    insert into public.explore_hashtags (tag, usage_count, last_used_at)
    values (normalized_tag, 1, now())
    on conflict (tag) do update
      set usage_count = public.explore_hashtags.usage_count + 1,
          last_used_at = excluded.last_used_at;

    insert into public.explore_user_hashtags (user_id, tag, usage_count, last_used_at)
    values (auth.uid(), normalized_tag, 1, now())
    on conflict (user_id, tag) do update
      set usage_count = public.explore_user_hashtags.usage_count + 1,
          last_used_at = excluded.last_used_at;
  end loop;
end;
$$;

revoke all on function public.record_explore_hashtags(text[]) from public;
grant execute on function public.record_explore_hashtags(text[]) to authenticated;
