-- Saved collections synced to the account (2026-10-09).
--
-- The base Explore schema already has explore_saved_collections and
-- explore_saved_collection_items with row level security. What the app needs
-- before it can make the server the source of truth:
--
-- 1. Both tables exist (created here only when missing, same shape as the base
--    schema) and collections get an updated_at column.
-- 2. Collection names are tidy (trimmed, single spaces, at most 40 characters,
--    never blank) and unique per account ignoring case:
--    unique (user_id, lower(name)). Existing duplicates are merged first: the
--    oldest collection keeps the name and receives the other copies' posts.
-- 3. Own-row RLS: a member only sees and changes their own collections, and
--    can only put items into a collection they own. The base items policy
--    only checked the item's user_id, so it is replaced.
--
-- Safe to run more than once.

begin;

create table if not exists public.explore_saved_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.explore_saved_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.explore_saved_collections(id) on delete cascade,
  post_id uuid not null references public.explore_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (collection_id, post_id)
);

alter table public.explore_saved_collections
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- 2. Tidy names, then merge case-insensitive duplicates into the oldest copy.
update public.explore_saved_collections
set name = coalesce(nullif(left(regexp_replace(btrim(name), '\s+', ' ', 'g'), 40), ''), 'Collection')
where name is distinct from coalesce(nullif(left(regexp_replace(btrim(name), '\s+', ' ', 'g'), 40), ''), 'Collection');

create temporary table explore_saved_collection_merge on commit drop as
select ranked.id as duplicate_id, ranked.keeper_id
from (
  select
    id,
    first_value(id) over (partition by user_id, lower(name) order by created_at, id) as keeper_id
  from public.explore_saved_collections
) ranked
where ranked.id <> ranked.keeper_id;

insert into public.explore_saved_collection_items (collection_id, post_id, user_id, created_at)
select merge.keeper_id, item.post_id, item.user_id, item.created_at
from public.explore_saved_collection_items item
join explore_saved_collection_merge merge on merge.duplicate_id = item.collection_id
on conflict (collection_id, post_id) do nothing;

delete from public.explore_saved_collections collection
using explore_saved_collection_merge merge
where collection.id = merge.duplicate_id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'explore_saved_collections_name_shape'
      and conrelid = 'public.explore_saved_collections'::regclass
  ) then
    alter table public.explore_saved_collections
      add constraint explore_saved_collections_name_shape
      check (char_length(name) between 1 and 40 and name = btrim(name));
  end if;
end $$;

create unique index if not exists explore_saved_collections_user_name_key
  on public.explore_saved_collections (user_id, lower(name));

create index if not exists explore_saved_collection_items_user_idx
  on public.explore_saved_collection_items (user_id, collection_id);

create or replace function public.explore_saved_collections_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists explore_saved_collections_touch on public.explore_saved_collections;
create trigger explore_saved_collections_touch
before update on public.explore_saved_collections
for each row execute function public.explore_saved_collections_touch();

-- 3. Own-row RLS.
alter table public.explore_saved_collections enable row level security;
alter table public.explore_saved_collection_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'explore_saved_collections'
      and policyname = 'users_manage_saved_collections'
  ) then
    create policy "users_manage_saved_collections"
    on public.explore_saved_collections
    for all
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;

drop policy if exists "users_manage_saved_collection_items" on public.explore_saved_collection_items;
drop policy if exists "users_manage_own_saved_collection_items" on public.explore_saved_collection_items;
create policy "users_manage_own_saved_collection_items"
on public.explore_saved_collection_items
for all
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.explore_saved_collections collection
    where collection.id = explore_saved_collection_items.collection_id
      and collection.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.explore_saved_collections collection
    where collection.id = explore_saved_collection_items.collection_id
      and collection.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.explore_saved_collections to authenticated;
grant select, insert, update, delete on public.explore_saved_collection_items to authenticated;

commit;
