with normalized_hashtags as (
  select
    post.user_id,
    lower(regexp_replace(btrim(source_tag, ' #'), '[^a-zA-Z0-9_]', '', 'g')) as tag,
    post.created_at
  from public.explore_posts post
  cross join lateral unnest(coalesce(post.hashtags, '{}'::text[])) as tags(source_tag)
), global_usage as (
  select tag, count(*)::bigint as usage_count, max(created_at) as last_used_at
  from normalized_hashtags
  where tag <> '' and length(tag) <= 50
  group by tag
)
insert into public.explore_hashtags (tag, usage_count, last_used_at)
select tag, usage_count, last_used_at
from global_usage
on conflict (tag) do update
set usage_count = greatest(public.explore_hashtags.usage_count, excluded.usage_count),
    last_used_at = greatest(public.explore_hashtags.last_used_at, excluded.last_used_at);

with normalized_hashtags as (
  select
    post.user_id,
    lower(regexp_replace(btrim(source_tag, ' #'), '[^a-zA-Z0-9_]', '', 'g')) as tag,
    post.created_at
  from public.explore_posts post
  cross join lateral unnest(coalesce(post.hashtags, '{}'::text[])) as tags(source_tag)
), personal_usage as (
  select user_id, tag, count(*)::bigint as usage_count, max(created_at) as last_used_at
  from normalized_hashtags
  where user_id is not null and tag <> '' and length(tag) <= 50
  group by user_id, tag
)
insert into public.explore_user_hashtags (user_id, tag, usage_count, last_used_at)
select user_id, tag, usage_count, last_used_at
from personal_usage
on conflict (user_id, tag) do update
set usage_count = greatest(public.explore_user_hashtags.usage_count, excluded.usage_count),
    last_used_at = greatest(public.explore_user_hashtags.last_used_at, excluded.last_used_at);

