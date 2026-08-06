-- KunThai Explore realtime social schema support.
-- Run in Supabase SQL editor after reviewing existing table definitions.

create table if not exists public.explore_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_user_id uuid,
  actor_name text not null default 'Someone',
  actor_avatar_url text not null default '',
  type text not null,
  media_type text not null default 'post',
  message text not null,
  read boolean not null default false,
  post_id text,
  post_preview text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists explore_notifications_user_created_idx
  on public.explore_notifications (user_id, created_at desc);

create index if not exists explore_notifications_unread_idx
  on public.explore_notifications (user_id, read);

create table if not exists public.explore_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  request boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.explore_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.explore_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index if not exists explore_conversation_members_user_idx
  on public.explore_conversation_members (user_id, conversation_id);

create table if not exists public.explore_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.explore_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  media_url text,
  media_type text not null default 'text',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists explore_messages_conversation_created_idx
  on public.explore_messages (conversation_id, created_at);

create index if not exists explore_messages_unread_idx
  on public.explore_messages (conversation_id, sender_id, read);

create or replace function public.is_explore_conversation_member(target_conversation_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.explore_conversation_members m
    where m.conversation_id = target_conversation_id
    and m.user_id = target_user_id
  );
$$;

revoke all on function public.is_explore_conversation_member(uuid, uuid) from public;
grant execute on function public.is_explore_conversation_member(uuid, uuid) to authenticated;

alter table public.explore_notifications enable row level security;
alter table public.explore_conversations enable row level security;
alter table public.explore_conversation_members enable row level security;
alter table public.explore_messages enable row level security;

drop policy if exists "Explore posts can be deleted by owner" on public.explore_posts;
create policy "Explore posts can be deleted by owner"
  on public.explore_posts for delete
  using (auth.uid() = user_id);

drop policy if exists "Explore notifications are visible to recipient" on public.explore_notifications;
create policy "Explore notifications are visible to recipient"
  on public.explore_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Explore notifications can be created by authenticated users" on public.explore_notifications;
create policy "Explore notifications can be created by authenticated users"
  on public.explore_notifications for insert
  with check (auth.uid() is not null and auth.uid() <> user_id);

drop policy if exists "Explore notification recipient can mark read" on public.explore_notifications;
create policy "Explore notification recipient can mark read"
  on public.explore_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "members_read_conversations" on public.explore_conversations;
drop policy if exists "Explore conversations are visible to participants" on public.explore_conversations;
create policy "Explore conversations are visible to participants"
  on public.explore_conversations for select
  using (public.is_explore_conversation_member(explore_conversations.id, auth.uid()));

drop policy if exists "authenticated_users_create_conversations" on public.explore_conversations;
drop policy if exists "Explore conversations can be created by participants" on public.explore_conversations;
create policy "Explore conversations can be created by participants"
  on public.explore_conversations for insert
  with check (auth.uid() = created_by);

drop policy if exists "Explore conversations can be updated by participants" on public.explore_conversations;
create policy "Explore conversations can be updated by participants"
  on public.explore_conversations for update
  using (public.is_explore_conversation_member(explore_conversations.id, auth.uid()))
  with check (public.is_explore_conversation_member(explore_conversations.id, auth.uid()));

drop policy if exists "members_read_conversation_members" on public.explore_conversation_members;
drop policy if exists "Explore conversation members are visible to participants" on public.explore_conversation_members;
create policy "Explore conversation members are visible to participants"
  on public.explore_conversation_members for select
  using (
    user_id = auth.uid()
    or public.is_explore_conversation_member(explore_conversation_members.conversation_id, auth.uid())
  );

drop policy if exists "authenticated_users_create_conversation_members" on public.explore_conversation_members;
drop policy if exists "Explore conversation members can be created by participants" on public.explore_conversation_members;
create policy "Explore conversation members can be created by participants"
  on public.explore_conversation_members for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.explore_conversations c
      where c.id = explore_conversation_members.conversation_id and c.created_by = auth.uid()
    )
  );

drop policy if exists "members_read_messages" on public.explore_messages;
drop policy if exists "Explore messages are visible to conversation participants" on public.explore_messages;
create policy "Explore messages are visible to conversation participants"
  on public.explore_messages for select
  using (public.is_explore_conversation_member(explore_messages.conversation_id, auth.uid()));

drop policy if exists "members_create_messages" on public.explore_messages;
drop policy if exists "Explore messages can be sent by conversation participants" on public.explore_messages;
create policy "Explore messages can be sent by conversation participants"
  on public.explore_messages for insert
  with check (
    auth.uid() = sender_id
    and public.is_explore_conversation_member(explore_messages.conversation_id, auth.uid())
  );

drop policy if exists "Explore messages can be marked read by conversation participants" on public.explore_messages;
create policy "Explore messages can be marked read by conversation participants"
  on public.explore_messages for update
  using (public.is_explore_conversation_member(explore_messages.conversation_id, auth.uid()))
  with check (public.is_explore_conversation_member(explore_messages.conversation_id, auth.uid()));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_notifications') then
    alter publication supabase_realtime add table public.explore_notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_conversations') then
    alter publication supabase_realtime add table public.explore_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_messages') then
    alter publication supabase_realtime add table public.explore_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_conversation_members') then
    alter publication supabase_realtime add table public.explore_conversation_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_follows') then
    alter publication supabase_realtime add table public.explore_follows;
  end if;
end $$;
