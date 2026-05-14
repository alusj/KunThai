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
create policy "Users manage own likes" on public.explore_post_likes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own saves" on public.explore_post_saves;
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
