-- Explore messages, connections and Join KunThai fixes (2026-10-09).
--
-- 1. Blocking is enforced on the server. A message is refused when anyone on
--    the receiving side of the conversation has blocked the sender (person to
--    person through explore_user_blocks or explore_identity_blocks, and a
--    Space's team replies when the customer has blocked that Space). Starting
--    a new direct conversation, or re-adding a member, is refused the same way.
--    get_or_create_explore_direct_conversation is left untouched: the checks
--    are triggers on the tables it writes, so its message-privacy rules stay
--    wherever they are maintained.
-- 2. explore_message_hidden: "Hide for me" on someone else's message is kept
--    per account on the server instead of only on one device.
-- 3. list_explore_conversations / list_explore_messages: the inbox in one
--    query (each conversation with its last visible message and unread
--    count) and a thread read page by page (newest 50, then older).
-- 4. remove_explore_follower: Connections -> Followers -> Remove really
--    removes that person's follow of you.
-- 5. explore-message-media: a private bucket for photos, voice notes and
--    videos sent in messages. Files live under <conversation id>/<sender id>/
--    and only the conversation's participants (and, for a Space thread, the
--    Space team allowed to reply) can read them. Messages sent earlier keep
--    their public URLs and still render.
--
-- Re-runnable: every object is created with "if not exists" or replaced, and
-- nothing here rewrites existing rows, so existing data cannot make it fail.

begin;

-- ---------------------------------------------------------------------------
-- 1. Blocking
-- ---------------------------------------------------------------------------

-- Whether p_blocker has blocked the person p_target_user, or the Space
-- p_target_space. Internal: it reveals who blocked whom, so only the trigger
-- functions below (running as the table owner) call it.
create or replace function public.explore_has_blocked(
  p_blocker uuid,
  p_target_user uuid,
  p_target_space uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_blocker is not null and (
    (
      p_target_user is not null
      and p_target_user <> p_blocker
      and (
        exists (
          select 1 from public.explore_user_blocks block
          where block.blocker_id = p_blocker and block.blocked_id = p_target_user
        )
        or exists (
          select 1 from public.explore_identity_blocks block
          where block.blocker_user_id = p_blocker
            and block.target_type = 'profile'
            and block.target_profile_user_id = p_target_user
        )
      )
    )
    or (
      p_target_space is not null
      and exists (
        select 1 from public.explore_identity_blocks block
        where block.blocker_user_id = p_blocker
          and block.target_type = 'space'
          and block.target_space_id = p_target_space
      )
    )
  );
$$;

revoke all on function public.explore_has_blocked(uuid, uuid, uuid) from public;
do $$ begin
  revoke all on function public.explore_has_blocked(uuid, uuid, uuid) from anon, authenticated;
exception when undefined_object then null;
end $$;

-- A uuid from text, or null when the text is not one (client metadata).
create or replace function public.explore_try_uuid(p_value text)
returns uuid
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid
    else null
  end;
$$;

create or replace function public.explore_guard_message_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conversation_space uuid;
  conversation_participants uuid[];
  sender_space uuid;
  refused boolean := false;
begin
  -- System notices are written by the app itself, not by the sender.
  if new.media_type = 'system' then
    return new;
  end if;

  select conversation.space_id, coalesce(conversation.participant_ids, '{}'::uuid[])
  into conversation_space, conversation_participants
  from public.explore_conversations conversation
  where conversation.id = new.conversation_id;

  if conversation_space is not null then
    -- A Space thread: the customer writing to the Space is not checked (a
    -- Space cannot block anyone yet); a team reply is refused when the
    -- customer has blocked the Space or the person replying.
    if new.sender_id = any(conversation_participants) then
      return new;
    end if;
    select exists (
      select 1
      from unnest(conversation_participants) as customer(user_id)
      where public.explore_has_blocked(customer.user_id, new.sender_id, conversation_space)
    ) into refused;
  else
    -- A direct thread: everyone in it except the sender is a recipient. A
    -- message sent while acting as a Space is also refused when a recipient
    -- has blocked that Space.
    sender_space := public.explore_try_uuid(coalesce(new.metadata, '{}'::jsonb) #>> '{actor,spaceId}');
    select exists (
      select 1
      from (
        select unnest(conversation_participants) as user_id
        union
        select member.user_id
        from public.explore_conversation_members member
        where member.conversation_id = new.conversation_id
      ) recipient
      where recipient.user_id is distinct from new.sender_id
        and public.explore_has_blocked(recipient.user_id, new.sender_id, sender_space)
    ) into refused;
  end if;

  if refused then
    raise exception 'You can''t message this account.'
      using errcode = '42501', hint = 'explore_blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_messages_guard_blocks on public.explore_messages;
create trigger explore_messages_guard_blocks
  before insert on public.explore_messages
  for each row execute function public.explore_guard_message_blocks();

-- New conversations: a direct thread cannot be opened with someone who has
-- blocked the person opening it, and a Space team cannot open a thread with a
-- customer who has blocked the Space. Only checked for signed-in callers, so
-- maintenance and backfills by the service role are never refused.
create or replace function public.explore_guard_conversation_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  refused boolean := false;
begin
  if actor is null then
    return new;
  end if;

  if new.space_id is null then
    select exists (
      select 1
      from unnest(coalesce(new.participant_ids, '{}'::uuid[])) as participant(user_id)
      where participant.user_id <> actor
        and public.explore_has_blocked(participant.user_id, actor, null)
    ) into refused;
  elsif not (actor = any(coalesce(new.participant_ids, '{}'::uuid[]))) then
    select exists (
      select 1
      from unnest(coalesce(new.participant_ids, '{}'::uuid[])) as customer(user_id)
      where public.explore_has_blocked(customer.user_id, actor, new.space_id)
    ) into refused;
  end if;

  if refused then
    raise exception 'You can''t message this account.'
      using errcode = '42501', hint = 'explore_blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_conversations_guard_blocks on public.explore_conversations;
create trigger explore_conversations_guard_blocks
  before insert on public.explore_conversations
  for each row execute function public.explore_guard_conversation_blocks();

-- Adding someone to a direct thread (the RPC and the older client path both
-- add the two members) is refused when that person has blocked the caller.
create or replace function public.explore_guard_conversation_member_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  conversation_space uuid;
begin
  if actor is null or new.user_id = actor then
    return new;
  end if;

  select conversation.space_id into conversation_space
  from public.explore_conversations conversation
  where conversation.id = new.conversation_id;

  if conversation_space is null and public.explore_has_blocked(new.user_id, actor, null) then
    raise exception 'You can''t message this account.'
      using errcode = '42501', hint = 'explore_blocked';
  end if;
  if conversation_space is not null and public.explore_has_blocked(new.user_id, actor, conversation_space) then
    raise exception 'You can''t message this account.'
      using errcode = '42501', hint = 'explore_blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists explore_conversation_members_guard_blocks on public.explore_conversation_members;
create trigger explore_conversation_members_guard_blocks
  before insert on public.explore_conversation_members
  for each row execute function public.explore_guard_conversation_member_blocks();

-- ---------------------------------------------------------------------------
-- 2. Messages hidden for one account
-- ---------------------------------------------------------------------------

create table if not exists public.explore_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.explore_messages(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, message_id)
);

create index if not exists explore_message_hidden_message_idx
  on public.explore_message_hidden (message_id);

alter table public.explore_message_hidden enable row level security;

drop policy if exists "people read the messages they hid" on public.explore_message_hidden;
create policy "people read the messages they hid"
on public.explore_message_hidden for select to authenticated
using (user_id = auth.uid());

-- Only a message the person can read (message policies apply in the check).
drop policy if exists "people hide messages they can read" on public.explore_message_hidden;
create policy "people hide messages they can read"
on public.explore_message_hidden for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.explore_messages message where message.id = message_id)
);

drop policy if exists "people unhide their messages" on public.explore_message_hidden;
create policy "people unhide their messages"
on public.explore_message_hidden for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.explore_message_hidden to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Inbox and thread pages
-- ---------------------------------------------------------------------------

create index if not exists explore_messages_unread_idx
  on public.explore_messages (conversation_id, sender_id)
  where read = false;

-- The caller's conversations, newest first, each with its last message the
-- caller has not hidden and how many unread messages wait. With p_space_id it
-- is that Space's shared inbox (unread = the customer's unread messages).
-- Runs as the caller, so the conversation and message policies still decide
-- what is visible.
create or replace function public.list_explore_conversations(
  p_space_id uuid default null,
  p_limit integer default 200
)
returns table (
  id uuid,
  created_by uuid,
  participant_ids uuid[],
  member_ids uuid[],
  request boolean,
  space_id uuid,
  updated_at timestamptz,
  last_message jsonb,
  unread_count integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with caller as (
    select auth.uid() as uid
  ),
  conversations as (
    select conversation.*
    from public.explore_conversations conversation, caller
    where caller.uid is not null
      and (
        (
          p_space_id is null
          and (
            caller.uid = any(coalesce(conversation.participant_ids, '{}'::uuid[]))
            or exists (
              select 1 from public.explore_conversation_members member
              where member.conversation_id = conversation.id and member.user_id = caller.uid
            )
          )
        )
        or (
          p_space_id is not null
          and conversation.space_id = p_space_id
          and public.explore_space_can_reply_messages(p_space_id, caller.uid)
        )
      )
    order by conversation.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  )
  select
    conversation.id,
    conversation.created_by,
    coalesce(conversation.participant_ids, '{}'::uuid[]),
    coalesce((
      select array_agg(member.user_id order by member.created_at)
      from public.explore_conversation_members member
      where member.conversation_id = conversation.id
    ), '{}'::uuid[]),
    conversation.request,
    conversation.space_id,
    conversation.updated_at,
    (
      select to_jsonb(message)
      from public.explore_messages message
      where message.conversation_id = conversation.id
        and not exists (
          select 1 from public.explore_message_hidden hidden
          where hidden.message_id = message.id and hidden.user_id = (select uid from caller)
        )
      order by message.created_at desc
      limit 1
    ),
    (
      select count(*)::integer
      from public.explore_messages message
      where message.conversation_id = conversation.id
        and message.read = false
        and case
          when p_space_id is not null then message.sender_id = any(coalesce(conversation.participant_ids, '{}'::uuid[]))
          else message.sender_id <> (select uid from caller)
        end
        and not exists (
          select 1 from public.explore_message_hidden hidden
          where hidden.message_id = message.id and hidden.user_id = (select uid from caller)
        )
    )
  from conversations conversation
  order by conversation.updated_at desc;
$$;

revoke all on function public.list_explore_conversations(uuid, integer) from public, anon;
grant execute on function public.list_explore_conversations(uuid, integer) to authenticated;

-- One page of a thread, newest first: the latest p_limit messages, or those
-- older than p_before. Messages the caller hid are left out.
create or replace function public.list_explore_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns setof public.explore_messages
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select message.*
  from public.explore_messages message
  where message.conversation_id = p_conversation_id
    and (p_before is null or message.created_at < p_before)
    and not exists (
      select 1 from public.explore_message_hidden hidden
      where hidden.message_id = message.id and hidden.user_id = auth.uid()
    )
  order by message.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_explore_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.list_explore_messages(uuid, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Remove a follower
-- ---------------------------------------------------------------------------

create or replace function public.remove_explore_follower(p_follower uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  removed integer := 0;
  removed_identity integer := 0;
begin
  if actor is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_follower is null or p_follower = actor then
    raise exception 'Choose one of your followers.' using errcode = '22023';
  end if;

  delete from public.explore_follows
  where follower_id = p_follower and following_id = actor;
  get diagnostics removed = row_count;

  if to_regclass('public.explore_identity_connections') is not null then
    delete from public.explore_identity_connections
    where connector_user_id = p_follower
      and target_type = 'profile'
      and target_profile_user_id = actor;
    get diagnostics removed_identity = row_count;
  end if;

  return removed + removed_identity;
end;
$$;

revoke all on function public.remove_explore_follower(uuid) from public, anon;
grant execute on function public.remove_explore_follower(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private message media
-- ---------------------------------------------------------------------------

-- Whether the caller may read a file stored as <conversation id>/<sender id>/…
create or replace function public.explore_can_read_message_media(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  conversation_uuid uuid := public.explore_try_uuid(split_part(coalesce(p_object_name, ''), '/', 1));
begin
  if conversation_uuid is null or auth.uid() is null then
    return false;
  end if;
  return public.explore_is_conversation_member(conversation_uuid, auth.uid());
end;
$$;

revoke all on function public.explore_can_read_message_media(text) from public, anon;
grant execute on function public.explore_can_read_message_media(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'explore-message-media',
  'explore-message-media',
  false,
  52428800,
  array['image/*', 'audio/*', 'video/*']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Explore message media upload to own folder" on storage.objects;
create policy "Explore message media upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'explore-message-media'
  and split_part(name, '/', 2) = auth.uid()::text
  and public.explore_can_read_message_media(name)
);

drop policy if exists "Explore message media read by participants" on storage.objects;
create policy "Explore message media read by participants"
on storage.objects for select to authenticated
using (
  bucket_id = 'explore-message-media'
  and public.explore_can_read_message_media(name)
);

drop policy if exists "Explore message media removed by sender" on storage.objects;
create policy "Explore message media removed by sender"
on storage.objects for delete to authenticated
using (
  bucket_id = 'explore-message-media'
  and split_part(name, '/', 2) = auth.uid()::text
);

comment on table public.explore_message_hidden is
  'Messages a person chose to hide for themselves ("Hide for me"). Other participants still see them.';

commit;
