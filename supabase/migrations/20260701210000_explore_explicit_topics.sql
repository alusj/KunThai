create table if not exists public.explore_topics (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  category text not null,
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.explore_user_topic_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_slug text not null references public.explore_topics(slug) on delete cascade,
  source text not null default 'settings' check (source in ('onboarding', 'settings')),
  followed_at timestamptz not null default now(),
  primary key (user_id, topic_slug)
);

create index if not exists explore_user_topic_follows_user_recent_idx
  on public.explore_user_topic_follows (user_id, followed_at desc);

alter table public.explore_topics enable row level security;
alter table public.explore_user_topic_follows enable row level security;

drop policy if exists "Active Explore topics are readable" on public.explore_topics;
create policy "Active Explore topics are readable"
  on public.explore_topics for select
  using (is_active = true);

drop policy if exists "Users read own explicit topics" on public.explore_user_topic_follows;
create policy "Users read own explicit topics"
  on public.explore_user_topic_follows for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users add own explicit topics" on public.explore_user_topic_follows;
create policy "Users add own explicit topics"
  on public.explore_user_topic_follows for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own explicit topics" on public.explore_user_topic_follows;
create policy "Users remove own explicit topics"
  on public.explore_user_topic_follows for delete to authenticated
  using (auth.uid() = user_id);

insert into public.explore_topics (slug, name, category, sort_order)
values
  ('local-news', 'Local news', 'Community & news', 10),
  ('community', 'Community', 'Community & news', 20),
  ('world-news', 'World news', 'Community & news', 30),
  ('public-safety', 'Public safety', 'Community & news', 40),
  ('culture-heritage', 'Culture & heritage', 'Community & news', 50),
  ('music', 'Music', 'Entertainment & culture', 110),
  ('movies-tv', 'Movies & TV', 'Entertainment & culture', 120),
  ('comedy', 'Comedy', 'Entertainment & culture', 130),
  ('fashion', 'Fashion', 'Entertainment & culture', 140),
  ('beauty', 'Beauty', 'Entertainment & culture', 150),
  ('photography', 'Photography', 'Entertainment & culture', 160),
  ('technology', 'Technology', 'Technology & business', 210),
  ('entrepreneurship', 'Entrepreneurship', 'Technology & business', 220),
  ('small-business', 'Small business', 'Technology & business', 230),
  ('finance', 'Finance', 'Technology & business', 240),
  ('jobs-careers', 'Jobs & careers', 'Technology & business', 250),
  ('digital-skills', 'Digital skills', 'Technology & business', 260),
  ('education', 'Education', 'Education & growth', 310),
  ('scholarships', 'Scholarships', 'Education & growth', 320),
  ('skills-training', 'Skills training', 'Education & growth', 330),
  ('books', 'Books', 'Education & growth', 340),
  ('languages', 'Languages', 'Education & growth', 350),
  ('health', 'Health', 'Health & lifestyle', 410),
  ('fitness', 'Fitness', 'Health & lifestyle', 420),
  ('mental-wellness', 'Mental wellness', 'Health & lifestyle', 430),
  ('parenting', 'Parenting', 'Health & lifestyle', 440),
  ('relationships', 'Relationships', 'Health & lifestyle', 450),
  ('football', 'Football', 'Sports', 510),
  ('basketball', 'Basketball', 'Sports', 520),
  ('athletics', 'Athletics', 'Sports', 530),
  ('combat-sports', 'Combat sports', 'Sports', 540),
  ('food', 'Food', 'Food & travel', 610),
  ('cooking', 'Cooking', 'Food & travel', 620),
  ('travel', 'Travel', 'Food & travel', 630),
  ('events', 'Events', 'Food & travel', 640),
  ('transport', 'Transport', 'Transport & work', 710),
  ('logistics', 'Logistics', 'Transport & work', 720),
  ('rides-delivery', 'Rides & delivery', 'Transport & work', 730),
  ('vehicles', 'Vehicles', 'Transport & work', 740),
  ('agriculture', 'Agriculture', 'Transport & work', 750),
  ('construction', 'Construction', 'Transport & work', 760)
on conflict (slug) do update
set name = excluded.name,
    category = excluded.category,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

alter table public.explore_posts
  add column if not exists primary_topic_slug text references public.explore_topics(slug) on delete set null;

create index if not exists explore_posts_primary_topic_created_idx
  on public.explore_posts (primary_topic_slug, created_at desc)
  where primary_topic_slug is not null;

create or replace function public.set_explore_topic_follows(
  p_topics text[],
  p_source text default 'settings'
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text := case when p_source = 'onboarding' then 'onboarding' else 'settings' end;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.explore_user_topic_follows
  where user_id = v_user_id;

  insert into public.explore_user_topic_follows (user_id, topic_slug, source)
  select v_user_id, topic.slug, v_source
  from public.explore_topics topic
  where topic.is_active = true
    and topic.slug = any(coalesce(p_topics, '{}'::text[]))
  on conflict (user_id, topic_slug) do update
  set source = excluded.source,
      followed_at = now();
end;
$$;

revoke all on function public.set_explore_topic_follows(text[], text) from public;
grant execute on function public.set_explore_topic_follows(text[], text) to authenticated;
grant select on public.explore_topics to anon, authenticated;
grant select, insert, delete on public.explore_user_topic_follows to authenticated;

comment on table public.explore_user_topic_follows is
  'Explicit user topic choices. Kept separate from explore_topic_interests, which stores inferred engagement scores.';

comment on column public.explore_posts.primary_topic_slug is
  'Optional canonical topic selected by the author. This is not a feed eligibility filter.';
