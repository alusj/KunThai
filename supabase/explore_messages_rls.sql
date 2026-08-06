-- Explore direct messages RLS setup.
-- Run this in the Supabase SQL editor for the project that backs the deployed app.

alter table public.explore_conversations
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists participant_ids uuid[] not null default '{}',
  add column if not exists conversation_key text;

create unique index if not exists explore_conversations_conversation_key_idx
  on public.explore_conversations (conversation_key)
  where conversation_key is not null;

alter table public.explore_conversations enable row level security;
alter table public.explore_conversation_members enable row level security;
alter table public.explore_messages enable row level security;

drop policy if exists "participants can read conversations" on public.explore_conversations;
drop policy if exists "participants can create conversations" on public.explore_conversations;
drop policy if exists "participants can update conversations" on public.explore_conversations;

create policy "participants can read conversations"
on public.explore_conversations
for select
to authenticated
using (
  auth.uid() = any(participant_ids)
);

create policy "participants can create conversations"
on public.explore_conversations
for insert
to authenticated
with check (
  created_by = auth.uid()
  and auth.uid() = any(participant_ids)
  and array_length(participant_ids, 1) = 2
);

create policy "participants can update conversations"
on public.explore_conversations
for update
to authenticated
using (
  auth.uid() = any(participant_ids)
)
with check (
  auth.uid() = any(participant_ids)
);

drop policy if exists "conversation participants can read member rows" on public.explore_conversation_members;
drop policy if exists "conversation creator can add member rows" on public.explore_conversation_members;

create policy "conversation participants can read member rows"
on public.explore_conversation_members
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_conversation_members.conversation_id
      and (
        c.created_by = auth.uid()
        or auth.uid() = any(c.participant_ids)
      )
  )
);

create policy "conversation creator can add member rows"
on public.explore_conversation_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  or exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_conversation_members.conversation_id
      and c.created_by = auth.uid()
      and explore_conversation_members.user_id = any(c.participant_ids)
  )
);

drop policy if exists "conversation participants can read messages" on public.explore_messages;
drop policy if exists "conversation participants can send messages" on public.explore_messages;
drop policy if exists "conversation participants can update messages" on public.explore_messages;

create policy "conversation participants can read messages"
on public.explore_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_messages.conversation_id
      and (
        auth.uid() = any(c.participant_ids)
      )
  )
);

create policy "conversation participants can send messages"
on public.explore_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_messages.conversation_id
      and (
        auth.uid() = any(c.participant_ids)
      )
  )
);

create policy "conversation participants can update messages"
on public.explore_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_messages.conversation_id
      and (
        auth.uid() = any(c.participant_ids)
      )
  )
)
with check (
  exists (
    select 1
    from public.explore_conversations c
    where c.id = explore_messages.conversation_id
      and (
        auth.uid() = any(c.participant_ids)
      )
  )
);
