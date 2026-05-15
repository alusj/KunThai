-- Explore RLS policies used by KunThai Explore.
-- Keep this file versioned with the app so Supabase dashboard changes are reproducible.
-- If your deployed schema is missing optional columns such as participant_ids or conversation_key,
-- run the schema hardening SQL first, then apply these policies.

alter table if exists public.explore_profiles enable row level security;
alter table if exists public.explore_posts enable row level security;
alter table if exists public.explore_post_likes enable row level security;
alter table if exists public.explore_post_saves enable row level security;
alter table if exists public.explore_post_comments enable row level security;
alter table if exists public.explore_follows enable row level security;
alter table if exists public.explore_notifications enable row level security;
alter table if exists public.explore_conversations enable row level security;
alter table if exists public.explore_conversation_members enable row level security;
alter table if exists public.explore_messages enable row level security;

alter table if exists public.explore_notifications
  add column if not exists created_at timestamptz default now(),
  add column if not exists actor_user_id uuid,
  add column if not exists actor_name text,
  add column if not exists actor_avatar_url text,
  add column if not exists type text,
  add column if not exists media_type text default 'post',
  add column if not exists message text,
  add column if not exists read boolean default false,
  add column if not exists post_id uuid,
  add column if not exists post_preview text,
  add column if not exists priority text default 'normal',
  add column if not exists category text default 'activity',
  add column if not exists group_key text;

alter table if exists public.explore_posts
  add column if not exists likes_count integer default 0,
  add column if not exists comments_count integer default 0,
  add column if not exists saves_count integer default 0;

alter table if exists public.explore_post_comments
  add column if not exists parent_comment_id uuid,
  add column if not exists author_name text,
  add column if not exists author_username text,
  add column if not exists author_avatar_url text,
  add column if not exists audio_url text,
  add column if not exists audio_duration_seconds numeric,
  add column if not exists mentions text[] default '{}',
  add column if not exists likes_count integer default 0;

create index if not exists explore_notifications_user_created_idx
  on public.explore_notifications (user_id, created_at desc);

create index if not exists explore_notifications_user_unread_idx
  on public.explore_notifications (user_id, read)
  where read = false;

create index if not exists explore_notifications_group_idx
  on public.explore_notifications (user_id, group_key, created_at desc);

create unique index if not exists explore_post_likes_one_per_user_idx
  on public.explore_post_likes (post_id, user_id);

create unique index if not exists explore_post_saves_one_per_user_idx
  on public.explore_post_saves (post_id, user_id);

alter table if exists public.explore_posts replica identity full;
alter table if exists public.explore_post_comments replica identity full;
alter table if exists public.explore_post_likes replica identity full;
alter table if exists public.explore_post_saves replica identity full;
alter table if exists public.explore_notifications replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.explore_posts;
  exception
    when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.explore_post_comments;
  exception
    when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.explore_post_likes;
  exception
    when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.explore_post_saves;
  exception
    when duplicate_object or undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.explore_notifications;
  exception
    when duplicate_object or undefined_object then null;
  end;
end $$;

create or replace function public.explore_refresh_post_counts(target_post_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.explore_posts
  set
    comments_count = (
      select count(*)::integer
      from public.explore_post_comments
      where post_id::text = target_post_id
    ),
    likes_count = (
      select count(*)::integer
      from public.explore_post_likes
      where post_id::text = target_post_id
    ),
    saves_count = (
      select count(*)::integer
      from public.explore_post_saves
      where post_id::text = target_post_id
    )
  where id::text = target_post_id;
end;
$$;

create or replace function public.explore_get_post_action_counts(target_post_ids uuid[])
returns table (
  post_id uuid,
  likes_count integer,
  comments_count integer,
  saves_count integer
)
language sql
security definer
set search_path = public
as $$
  select
    posts.id as post_id,
    coalesce(likes.total, 0)::integer as likes_count,
    coalesce(comments.total, 0)::integer as comments_count,
    coalesce(saves.total, 0)::integer as saves_count
  from public.explore_posts posts
  left join (
    select explore_post_likes.post_id, count(*) as total
    from public.explore_post_likes
    where explore_post_likes.post_id = any(target_post_ids)
    group by explore_post_likes.post_id
  ) likes on likes.post_id = posts.id
  left join (
    select explore_post_comments.post_id, count(*) as total
    from public.explore_post_comments
    where explore_post_comments.post_id = any(target_post_ids)
    group by explore_post_comments.post_id
  ) comments on comments.post_id = posts.id
  left join (
    select explore_post_saves.post_id, count(*) as total
    from public.explore_post_saves
    where explore_post_saves.post_id = any(target_post_ids)
    group by explore_post_saves.post_id
  ) saves on saves.post_id = posts.id
  where posts.id = any(target_post_ids);
$$;

grant execute on function public.explore_get_post_action_counts(uuid[]) to anon, authenticated;

create or replace function public.explore_sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.explore_refresh_post_counts(coalesce(new.post_id, old.post_id)::text);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists explore_comments_sync_counts on public.explore_post_comments;
create trigger explore_comments_sync_counts
after insert or delete on public.explore_post_comments
for each row execute function public.explore_sync_comment_count();

create or replace function public.explore_sync_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.explore_refresh_post_counts(coalesce(new.post_id, old.post_id)::text);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists explore_likes_sync_counts on public.explore_post_likes;
create trigger explore_likes_sync_counts
after insert or delete on public.explore_post_likes
for each row execute function public.explore_sync_reaction_count();

drop trigger if exists explore_saves_sync_counts on public.explore_post_saves;
create trigger explore_saves_sync_counts
after insert or delete on public.explore_post_saves
for each row execute function public.explore_sync_reaction_count();

create or replace function public.explore_notify_comment_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_record record;
  actor_record record;
  actor_display_name text;
  actor_avatar text;
  media_label text;
begin
  if new.parent_comment_id is not null then
    return new;
  end if;

  select * into post_record
  from public.explore_posts
  where id = new.post_id;

  if post_record.user_id is null or post_record.user_id = new.user_id then
    return new;
  end if;

  select display_name, avatar_url into actor_record
  from public.explore_profiles
  where user_id = new.user_id;

  actor_display_name := coalesce(nullif(actor_record.display_name, ''), nullif(new.author_name, ''), 'Someone');
  actor_avatar := coalesce(nullif(actor_record.avatar_url, ''), nullif(new.author_avatar_url, ''), '');
  media_label := case
    when post_record.video_url is not null and post_record.video_url <> '' then 'Swip video'
    when post_record.feed_scope = 'swip' then 'Swip video'
    when post_record.image_url is not null and post_record.image_url <> '' then 'photo post'
    when post_record.audio_url is not null and post_record.audio_url <> '' then 'voice post'
    else 'post'
  end;

  if exists (
    select 1
    from public.explore_notifications
    where user_id = post_record.user_id
      and actor_user_id = new.user_id
      and type = 'comment'
      and post_id = new.post_id
      and created_at >= now() - interval '5 minutes'
  ) then
    return new;
  end if;

  insert into public.explore_notifications (
    user_id,
    actor_user_id,
    actor_name,
    actor_avatar_url,
    type,
    media_type,
    message,
    read,
    post_id,
    post_preview,
    priority,
    category,
    group_key
  )
  values (
    post_record.user_id,
    new.user_id,
    actor_display_name,
    actor_avatar,
    'comment',
    media_label,
    actor_display_name || ' commented on your ' || media_label,
    false,
    new.post_id,
    coalesce(nullif(new.body, ''), nullif(post_record.body, ''), 'New comment'),
    'high',
    'activity',
    'comment:' || new.post_id::text
  );

  return new;
end;
$$;

drop trigger if exists explore_comments_notify_owner on public.explore_post_comments;
create trigger explore_comments_notify_owner
after insert on public.explore_post_comments
for each row execute function public.explore_notify_comment_owner();

create or replace function public.explore_notify_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_record record;
  actor_record record;
  actor_display_name text;
  actor_avatar text;
  notification_type text;
  media_label text;
  notification_message text;
begin
  select * into post_record
  from public.explore_posts
  where id = new.post_id;

  if post_record.user_id is null or post_record.user_id = new.user_id then
    return new;
  end if;

  select display_name, avatar_url into actor_record
  from public.explore_profiles
  where user_id = new.user_id;

  actor_display_name := coalesce(nullif(actor_record.display_name, ''), 'Someone');
  actor_avatar := coalesce(nullif(actor_record.avatar_url, ''), '');
  notification_type := case when tg_table_name = 'explore_post_saves' then 'save' else 'reaction' end;
  media_label := case
    when post_record.video_url is not null and post_record.video_url <> '' then 'Swip video'
    when post_record.feed_scope = 'swip' then 'Swip video'
    when post_record.image_url is not null and post_record.image_url <> '' then 'photo post'
    when post_record.audio_url is not null and post_record.audio_url <> '' then 'voice post'
    else 'post'
  end;
  notification_message := case
    when notification_type = 'save' then actor_display_name || ' saved your ' || media_label
    else actor_display_name || ' reacted to your ' || media_label
  end;

  if exists (
    select 1
    from public.explore_notifications
    where user_id = post_record.user_id
      and actor_user_id = new.user_id
      and type = notification_type
      and post_id = new.post_id
      and created_at >= now() - interval '5 minutes'
  ) then
    return new;
  end if;

  insert into public.explore_notifications (
    user_id,
    actor_user_id,
    actor_name,
    actor_avatar_url,
    type,
    media_type,
    message,
    read,
    post_id,
    post_preview,
    priority,
    category,
    group_key
  )
  values (
    post_record.user_id,
    new.user_id,
    actor_display_name,
    actor_avatar,
    notification_type,
    media_label,
    notification_message,
    false,
    new.post_id,
    coalesce(nullif(post_record.body, ''), notification_message),
    'medium',
    'activity',
    notification_type || ':' || new.post_id::text
  );

  return new;
end;
$$;

drop trigger if exists explore_likes_notify_owner on public.explore_post_likes;
create trigger explore_likes_notify_owner
after insert on public.explore_post_likes
for each row execute function public.explore_notify_post_reaction();

drop trigger if exists explore_saves_notify_owner on public.explore_post_saves;
create trigger explore_saves_notify_owner
after insert on public.explore_post_saves
for each row execute function public.explore_notify_post_reaction();

drop policy if exists "Explore profiles are readable" on public.explore_profiles;
create policy "Explore profiles are readable" on public.explore_profiles for select using (true);

drop policy if exists "Users manage own explore profile" on public.explore_profiles;
create policy "Users manage own explore profile" on public.explore_profiles for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Explore posts are readable" on public.explore_posts;
create policy "Explore posts are readable" on public.explore_posts for select using (true);

drop policy if exists "Users create own explore posts" on public.explore_posts;
create policy "Users create own explore posts" on public.explore_posts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users update own explore posts" on public.explore_posts;
create policy "Users update own explore posts" on public.explore_posts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own explore posts" on public.explore_posts;
create policy "Users delete own explore posts" on public.explore_posts for delete
using (auth.uid() = user_id);

drop policy if exists "Users manage own likes" on public.explore_post_likes;
drop policy if exists "Post likes are readable" on public.explore_post_likes;
create policy "Post likes are readable" on public.explore_post_likes for select using (true);

create policy "Users manage own likes" on public.explore_post_likes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own saves" on public.explore_post_saves;
drop policy if exists "Post saves are readable" on public.explore_post_saves;
create policy "Post saves are readable" on public.explore_post_saves for select using (true);

create policy "Users manage own saves" on public.explore_post_saves for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Comments are readable" on public.explore_post_comments;
create policy "Comments are readable" on public.explore_post_comments for select using (true);

drop policy if exists "Users create own comments" on public.explore_post_comments;
create policy "Users create own comments" on public.explore_post_comments for insert
with check (auth.uid() = user_id);

drop policy if exists "Users manage own comments" on public.explore_post_comments;
create policy "Users manage own comments" on public.explore_post_comments for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete own comments" on public.explore_post_comments;
create policy "Users delete own comments" on public.explore_post_comments for delete
using (auth.uid() = user_id);

drop policy if exists "Follows are readable" on public.explore_follows;
create policy "Follows are readable" on public.explore_follows for select using (true);

drop policy if exists "Users manage own follows" on public.explore_follows;
create policy "Users manage own follows" on public.explore_follows for all
using (auth.uid() = follower_id)
with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "Users read own notifications" on public.explore_notifications;
create policy "Users read own notifications" on public.explore_notifications for select
using (auth.uid() = user_id);

drop policy if exists "Users update own notifications" on public.explore_notifications;
create policy "Users update own notifications" on public.explore_notifications for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Authenticated users create notifications" on public.explore_notifications;
create policy "Authenticated users create notifications" on public.explore_notifications for insert
with check (auth.uid() = actor_user_id and user_id <> auth.uid());

drop policy if exists "Users read participant conversations" on public.explore_conversations;
create policy "Users read participant conversations" on public.explore_conversations for select
using (
  auth.uid() = created_by
  or auth.uid() = any(participant_ids)
);

drop policy if exists "Users create own participant conversations" on public.explore_conversations;
create policy "Users create own participant conversations" on public.explore_conversations for insert
with check (
  auth.uid() = created_by
  and participant_ids is not null
  and auth.uid() = any(participant_ids)
);

drop policy if exists "Users update participant conversations" on public.explore_conversations;
create policy "Users update participant conversations" on public.explore_conversations for update
using (
  auth.uid() = any(participant_ids)
)
with check (
  auth.uid() = any(participant_ids)
);

drop policy if exists "Users read own conversation memberships" on public.explore_conversation_members;
create policy "Users read own conversation memberships" on public.explore_conversation_members for select
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.explore_conversations c
    where c.id = conversation_id and auth.uid() = any(c.participant_ids)
  )
);

drop policy if exists "Users insert memberships for own conversations" on public.explore_conversation_members;
create policy "Users insert memberships for own conversations" on public.explore_conversation_members for insert
with check (
  exists (
    select 1 from public.explore_conversations c
    where c.id = conversation_id
      and (c.created_by = auth.uid() or auth.uid() = any(c.participant_ids))
      and user_id = any(c.participant_ids)
  )
);

drop policy if exists "Users read participant messages" on public.explore_messages;
create policy "Users read participant messages" on public.explore_messages for select
using (
  exists (
    select 1 from public.explore_conversation_members m
    where m.conversation_id = conversation_id and m.user_id = auth.uid()
  )
);

drop policy if exists "Users send own participant messages" on public.explore_messages;
create policy "Users send own participant messages" on public.explore_messages for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1 from public.explore_conversation_members m
    where m.conversation_id = conversation_id and m.user_id = auth.uid()
  )
);

drop policy if exists "Users update participant messages" on public.explore_messages;
create policy "Users update participant messages" on public.explore_messages for update
using (
  exists (
    select 1 from public.explore_conversation_members m
    where m.conversation_id = conversation_id and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.explore_conversation_members m
    where m.conversation_id = conversation_id and m.user_id = auth.uid()
  )
);
