-- Keep Explore direct messages isolated across accounts, make legacy membership
-- data usable, and expose only the mutations required by the client.

alter table public.explore_conversations
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists participant_ids uuid[] not null default '{}',
  add column if not exists conversation_key text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.explore_messages
  add column if not exists media_url text,
  add column if not exists media_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read boolean not null default false;

-- Older schema snapshots only allowed the first four media types. The client
-- also persists private location request/share messages and system messages.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'explore_messages'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%media_type%'
  loop
    execute format('alter table public.explore_messages drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.explore_messages
  add constraint explore_messages_media_type_check
  check (media_type in ('text', 'image', 'audio', 'video', 'location_request', 'location_share', 'system'))
  not valid;

-- Recover participant arrays from every trustworthy source available locally.
-- This repairs conversations created before participant_ids became mandatory.
with discovered_participants as (
  select source.conversation_id, array_agg(distinct source.user_id order by source.user_id) as user_ids
  from (
    select conversation_id, user_id
    from public.explore_conversation_members
    union all
    select id, created_by
    from public.explore_conversations
    where created_by is not null
    union all
    select conversation_id, sender_id
    from public.explore_messages
    union all
    select c.id, split_part(c.conversation_key, '__', 1)::uuid
    from public.explore_conversations c
    where c.conversation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}__[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    union all
    select c.id, split_part(c.conversation_key, '__', 2)::uuid
    from public.explore_conversations c
    where c.conversation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}__[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) source
  where source.user_id is not null
  group by source.conversation_id
), merged_participants as (
  select c.id,
    array(
      select distinct participant_id
      from unnest(coalesce(c.participant_ids, '{}') || discovered.user_ids) participant_id
      order by participant_id
    ) as user_ids
  from public.explore_conversations c
  join discovered_participants discovered on discovered.conversation_id = c.id
)
update public.explore_conversations conversation
set participant_ids = merged.user_ids
from merged_participants merged
where conversation.id = merged.id
  and conversation.participant_ids is distinct from merged.user_ids;

insert into public.explore_conversation_members (conversation_id, user_id)
select conversation.id, participant_id
from public.explore_conversations conversation
cross join lateral unnest(conversation.participant_ids) participant_id
on conflict (conversation_id, user_id) do nothing;

create unique index if not exists explore_conversations_conversation_key_idx
  on public.explore_conversations (conversation_key)
  where conversation_key is not null;

create index if not exists explore_conversation_members_user_idx
  on public.explore_conversation_members (user_id, conversation_id);

create index if not exists explore_messages_conversation_created_idx
  on public.explore_messages (conversation_id, created_at);

create or replace function public.explore_is_conversation_member(
  conversation_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select user_uuid = auth.uid()
    and exists (
      select 1
      from public.explore_conversations conversation
      where conversation.id = conversation_uuid
        and (
          user_uuid = any(conversation.participant_ids)
          or exists (
            select 1
            from public.explore_conversation_members member
            where member.conversation_id = conversation.id
              and member.user_id = user_uuid
          )
        )
    );
$$;

create or replace function public.is_explore_conversation_member(
  target_conversation_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    and public.explore_is_conversation_member(target_conversation_id, target_user_id);
$$;

revoke all on function public.explore_is_conversation_member(uuid, uuid) from public, anon;
revoke all on function public.is_explore_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.explore_is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.is_explore_conversation_member(uuid, uuid) to authenticated;

alter table public.explore_conversations enable row level security;
alter table public.explore_conversation_members enable row level security;
alter table public.explore_messages enable row level security;

-- Policies are permissive by default, so every historical policy name must be
-- removed before installing the definitive policy set.
drop policy if exists "members_read_conversations" on public.explore_conversations;
drop policy if exists "Explore conversations are visible to participants" on public.explore_conversations;
drop policy if exists "participants can read conversations" on public.explore_conversations;
drop policy if exists "explore conversations participants read v2" on public.explore_conversations;
drop policy if exists "authenticated_users_create_conversations" on public.explore_conversations;
drop policy if exists "Explore conversations can be created by participants" on public.explore_conversations;
drop policy if exists "participants can create conversations" on public.explore_conversations;
drop policy if exists "explore conversations participants create v2" on public.explore_conversations;
drop policy if exists "Explore conversations can be updated by participants" on public.explore_conversations;
drop policy if exists "participants can update conversations" on public.explore_conversations;
drop policy if exists "explore conversations participants update v2" on public.explore_conversations;

drop policy if exists "members_read_conversation_members" on public.explore_conversation_members;
drop policy if exists "Explore conversation members are visible to participants" on public.explore_conversation_members;
drop policy if exists "conversation participants can read member rows" on public.explore_conversation_members;
drop policy if exists "explore conversation members read v2" on public.explore_conversation_members;
drop policy if exists "authenticated_users_create_conversation_members" on public.explore_conversation_members;
drop policy if exists "members_or_creator_create_conversation_members" on public.explore_conversation_members;
drop policy if exists "Explore conversation members can be created by participants" on public.explore_conversation_members;
drop policy if exists "conversation creator can add member rows" on public.explore_conversation_members;
drop policy if exists "explore participants can repair member rows" on public.explore_conversation_members;
drop policy if exists "explore conversation members create v2" on public.explore_conversation_members;

drop policy if exists "members_read_messages" on public.explore_messages;
drop policy if exists "Explore messages are visible to conversation participants" on public.explore_messages;
drop policy if exists "conversation participants can read messages" on public.explore_messages;
drop policy if exists "explore messages participants read v2" on public.explore_messages;
drop policy if exists "members_create_messages" on public.explore_messages;
drop policy if exists "Explore messages can be sent by conversation participants" on public.explore_messages;
drop policy if exists "conversation participants can send messages" on public.explore_messages;
drop policy if exists "explore messages participants create v2" on public.explore_messages;
drop policy if exists "Explore messages can be marked read by conversation participants" on public.explore_messages;
drop policy if exists "conversation participants can update messages" on public.explore_messages;
drop policy if exists "explore messages participants update v2" on public.explore_messages;
drop policy if exists "explore message senders delete own" on public.explore_messages;

-- Remove any dashboard-created or previously renamed permissive policy too.
-- These three tables are private messaging internals and the v3 policies below
-- are their complete access contract.
do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('explore_conversations', 'explore_conversation_members', 'explore_messages')
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end $$;

create policy "explore conversations participants read v3"
on public.explore_conversations
for select to authenticated
using (public.explore_is_conversation_member(id, auth.uid()));

create policy "explore conversations participants create v3"
on public.explore_conversations
for insert to authenticated
with check (
  created_by = auth.uid()
  and auth.uid() = any(participant_ids)
  and cardinality(participant_ids) = 2
  and participant_ids[1] <> participant_ids[2]
);

create policy "explore conversations participants update timestamp v3"
on public.explore_conversations
for update to authenticated
using (public.explore_is_conversation_member(id, auth.uid()))
with check (public.explore_is_conversation_member(id, auth.uid()));

create policy "explore conversation members read v3"
on public.explore_conversation_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.explore_is_conversation_member(conversation_id, auth.uid())
);

create policy "explore conversation members create v3"
on public.explore_conversation_members
for insert to authenticated
with check (
  public.explore_is_conversation_member(conversation_id, auth.uid())
  and exists (
    select 1
    from public.explore_conversations conversation
    where conversation.id = explore_conversation_members.conversation_id
      and explore_conversation_members.user_id = any(conversation.participant_ids)
  )
);

create policy "explore messages participants read v3"
on public.explore_messages
for select to authenticated
using (public.explore_is_conversation_member(conversation_id, auth.uid()));

create policy "explore messages participants create v3"
on public.explore_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.explore_is_conversation_member(conversation_id, auth.uid())
);

create policy "explore message recipients mark read v3"
on public.explore_messages
for update to authenticated
using (
  sender_id <> auth.uid()
  and public.explore_is_conversation_member(conversation_id, auth.uid())
)
with check (
  read = true
  and sender_id <> auth.uid()
  and public.explore_is_conversation_member(conversation_id, auth.uid())
);

create policy "explore message senders delete own v3"
on public.explore_messages
for delete to authenticated
using (
  sender_id = auth.uid()
  and public.explore_is_conversation_member(conversation_id, auth.uid())
);

-- Prevent participants from rewriting membership, sender identity, message
-- content, or conversation keys through PostgREST updates.
revoke update on table public.explore_conversations from anon, authenticated;
grant update (updated_at) on table public.explore_conversations to authenticated;
revoke update on table public.explore_messages from anon, authenticated;
grant update (read) on table public.explore_messages to authenticated;

-- DELETE payloads should expose only the primary key. INSERT/UPDATE still carry
-- the new row and are filtered by the SELECT RLS policies above.
alter table public.explore_messages replica identity default;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_conversations'
  ) then
    alter publication supabase_realtime add table public.explore_conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_conversation_members'
  ) then
    alter publication supabase_realtime add table public.explore_conversation_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'explore_messages'
  ) then
    alter publication supabase_realtime add table public.explore_messages;
  end if;
exception
  when undefined_object then null;
end $$;
