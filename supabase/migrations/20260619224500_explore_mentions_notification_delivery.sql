-- Deliver post/comment mentions through a trusted server-side function so RLS
-- cannot silently block notifications created for another user.

alter table if exists public.explore_notifications
  add column if not exists actor_avatar_url text,
  add column if not exists media_type text,
  add column if not exists message text,
  add column if not exists priority text not null default 'normal',
  add column if not exists category text not null default 'activity',
  add column if not exists group_key text,
  add column if not exists post_id uuid references public.explore_posts(id) on delete cascade,
  add column if not exists post_preview text;

create or replace function public.notify_explore_mentions(
  post_uuid uuid,
  comment_uuid uuid default null,
  mentioned_usernames text[] default '{}'::text[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_uuid uuid := auth.uid();
  actor_display_name text;
  actor_avatar text;
  post_body text;
  post_video_url text;
  comment_body text;
  inserted_count integer := 0;
begin
  if actor_uuid is null or post_uuid is null or coalesce(array_length(mentioned_usernames, 1), 0) = 0 then
    return 0;
  end if;

  select
    coalesce(nullif(profile.display_name, ''), nullif(profile.username, ''), 'Someone'),
    coalesce(profile.avatar_url, '')
  into actor_display_name, actor_avatar
  from public.explore_profiles profile
  where profile.user_id = actor_uuid
  limit 1;

  actor_display_name := coalesce(actor_display_name, 'Someone');
  actor_avatar := coalesce(actor_avatar, '');

  select post.body, post.video_url
  into post_body, post_video_url
  from public.explore_posts post
  where post.id = post_uuid
  limit 1;

  if comment_uuid is not null then
    select comment.body
    into comment_body
    from public.explore_post_comments comment
    where comment.id = comment_uuid
      and comment.post_id = post_uuid
    limit 1;
  end if;

  with normalized_mentions as (
    select distinct lower(trim(leading '@' from trim(value))) as username
    from unnest(mentioned_usernames) as value
    where trim(leading '@' from trim(value)) <> ''
  ), targets as (
    select distinct profile.user_id
    from public.explore_profiles profile
    join normalized_mentions mention on lower(profile.username) = mention.username
    left join public.explore_user_privacy_settings privacy on privacy.user_id = profile.user_id
    left join public.explore_user_preferences preference on preference.user_id = profile.user_id
    where profile.user_id <> actor_uuid
      and coalesce((privacy.settings ->> 'allowMentions')::boolean, true)
      and coalesce((preference.settings -> 'notifications' ->> 'mentions')::boolean, true)
  )
  insert into public.explore_notifications (
    user_id,
    actor_user_id,
    actor_name,
    actor_avatar_url,
    type,
    media_type,
    message,
    priority,
    category,
    group_key,
    read,
    post_id,
    post_preview
  )
  select
    target.user_id,
    actor_uuid,
    actor_display_name,
    actor_avatar,
    'mention',
    case when comment_uuid is not null then 'comment' when coalesce(post_video_url, '') <> '' then 'video post' else 'post' end,
    actor_display_name || ' mentioned you',
    'high',
    'mentions',
    'mention:' || post_uuid::text || ':' || coalesce(comment_uuid::text, 'post') || ':' || target.user_id::text,
    false,
    post_uuid,
    coalesce(nullif(comment_body, ''), nullif(post_body, ''), 'You were mentioned on Explore')
  from targets target
  where not exists (
    select 1
    from public.explore_notifications notification
    where notification.user_id = target.user_id
      and notification.actor_user_id = actor_uuid
      and notification.type = 'mention'
      and notification.post_id = post_uuid
      and notification.group_key = 'mention:' || post_uuid::text || ':' || coalesce(comment_uuid::text, 'post') || ':' || target.user_id::text
      and notification.created_at >= now() - interval '5 minutes'
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.notify_explore_mentions(uuid, uuid, text[]) from public;
grant execute on function public.notify_explore_mentions(uuid, uuid, text[]) to authenticated;
