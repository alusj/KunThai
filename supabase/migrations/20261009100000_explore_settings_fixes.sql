-- Explore Settings / Privacy fixes from the 2026-10-09 audit.
--
--  1. explore_user_preferences is part of the repo now. Production already
--     has it (created by hand, with "Users read own explore preferences" and
--     "Users update own explore preferences"), but nobody could INSERT a row,
--     so the app's upsert failed and settings never reached the server. This
--     creates the table when it is missing, adds missing columns, makes
--     user_id unique (upsert on user_id needs it) and adds owner-only
--     select / insert / update policies. The hand-made policies are kept.
--  2. Message privacy "Connections" is enforced when a NEW direct
--     conversation is created: only people the recipient follows can start
--     one ("Only connections can chat"). "No one" still blocks every new
--     conversation. Existing threads are not affected by either setting.
--     A recipient who never saved the setting keeps the open behaviour
--     (strangers arrive as message requests), which the app now shows as
--     "Everyone".
--  3. explore_peer_read_receipts_enabled(peer) lets a conversation member
--     check whether the other person shares read receipts, so "Seen" is not
--     shown when they switched receipts off.
--
-- Safe to run more than once. The backfill switches user triggers off
-- around its update so hand-made triggers never see legacy rows.

begin;

-- ===========================================================================
-- 1. explore_user_preferences
-- ===========================================================================

create table if not exists public.explore_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.explore_user_preferences
  add column if not exists user_id uuid,
  add column if not exists settings jsonb,
  add column if not exists updated_at timestamptz;

alter table public.explore_user_preferences alter column settings set default '{}'::jsonb;
alter table public.explore_user_preferences alter column updated_at set default now();

do $$
declare
  has_unique boolean;
begin
  -- Legacy rows: empty settings become {} so the column can be NOT NULL.
  if exists (select 1 from public.explore_user_preferences where settings is null or updated_at is null) then
    alter table public.explore_user_preferences disable trigger user;
    update public.explore_user_preferences
    set settings = coalesce(settings, '{}'::jsonb),
        updated_at = coalesce(updated_at, now())
    where settings is null or updated_at is null;
    alter table public.explore_user_preferences enable trigger user;
  end if;

  alter table public.explore_user_preferences alter column settings set not null;

  -- Upsert on user_id needs a unique index or constraint covering exactly it.
  select exists (
    select 1
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where i.indrelid = 'public.explore_user_preferences'::regclass
      and i.indisunique
      and i.indnkeyatts = 1
      and i.indpred is null
      and a.attname = 'user_id'
  ) into has_unique;

  if not has_unique then
    -- Keep the newest row per user if hand-made data ever doubled up.
    delete from public.explore_user_preferences older
    using public.explore_user_preferences newer
    where older.user_id = newer.user_id
      and older.ctid <> newer.ctid
      and (coalesce(older.updated_at, '-infinity'::timestamptz), older.ctid::text)
        < (coalesce(newer.updated_at, '-infinity'::timestamptz), newer.ctid::text);
    create unique index if not exists explore_user_preferences_user_id_key
      on public.explore_user_preferences (user_id);
  end if;
end $$;

alter table public.explore_user_preferences enable row level security;

drop policy if exists explore_user_preferences_owner_select on public.explore_user_preferences;
create policy explore_user_preferences_owner_select
  on public.explore_user_preferences for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists explore_user_preferences_owner_insert on public.explore_user_preferences;
create policy explore_user_preferences_owner_insert
  on public.explore_user_preferences for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists explore_user_preferences_owner_update on public.explore_user_preferences;
create policy explore_user_preferences_owner_update
  on public.explore_user_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.explore_user_preferences to authenticated;

comment on table public.explore_user_preferences is
  'Per-account Explore settings (notifications, video, feed, messages, feedback). Owner-only; read by notify_explore_mentions and explore_peer_read_receipts_enabled.';

-- ===========================================================================
-- 2. Direct conversations respect "Who can message you"
-- ===========================================================================

create or replace function public.get_or_create_explore_direct_conversation(
  recipient_user_id uuid
)
returns public.explore_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_user_id uuid := auth.uid();
  canonical_participants uuid[];
  canonical_key text;
  selected_conversation public.explore_conversations;
  recipient_message_mode text;
  recipient_follows_actor boolean := false;
  should_request boolean := true;
begin
  if actor_user_id is null then
    raise exception 'Authentication is required to create a conversation.' using errcode = '28000';
  end if;

  if recipient_user_id is null or recipient_user_id = actor_user_id then
    raise exception 'A different recipient is required.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = recipient_user_id) then
    raise exception 'The recipient account does not exist.' using errcode = '22023';
  end if;

  canonical_participants := array[
    least(actor_user_id, recipient_user_id),
    greatest(actor_user_id, recipient_user_id)
  ];
  canonical_key := array_to_string(canonical_participants, '__');

  select conversation.*
  into selected_conversation
  from public.explore_conversations conversation
  where conversation.conversation_key = canonical_key
    or (
      cardinality(conversation.participant_ids) = 2
      and conversation.participant_ids @> canonical_participants
      and conversation.participant_ids <@ canonical_participants
    )
    or conversation.id in (
      select member.conversation_id
      from public.explore_conversation_members member
      group by member.conversation_id
      having count(distinct member.user_id) = 2
        and count(distinct member.user_id) filter (where member.user_id = any(canonical_participants)) = 2
    )
  order by (conversation.conversation_key = canonical_key) desc, conversation.created_at
  limit 1;

  if selected_conversation.id is null then
    if to_regclass('public.explore_user_privacy_settings') is not null then
      execute $privacy$
        select nullif(lower(settings->>'allowMessages'), '')
        from public.explore_user_privacy_settings
        where user_id = $1
      $privacy$
      into recipient_message_mode
      using recipient_user_id;
    end if;
    -- Never saved: open inbox, strangers arrive as message requests.
    recipient_message_mode := coalesce(recipient_message_mode, 'everyone');

    select exists (
      select 1 from public.explore_follows
      where follower_id = recipient_user_id and following_id = actor_user_id
    ) into recipient_follows_actor;

    if recipient_message_mode = 'none' then
      raise exception 'This account is not accepting new messages.' using errcode = '42501';
    end if;

    -- "Connections": the recipient must follow the sender.
    if recipient_message_mode = 'followers' and not recipient_follows_actor then
      raise exception 'Only connections can chat' using errcode = '42501',
        hint = 'The recipient only accepts new conversations from people they follow.';
    end if;

    should_request := not recipient_follows_actor;

    insert into public.explore_conversations (
      created_by,
      participant_ids,
      conversation_key,
      request,
      updated_at
    )
    values (
      actor_user_id,
      canonical_participants,
      canonical_key,
      should_request,
      timezone('utc', now())
    )
    on conflict (conversation_key) where conversation_key is not null
    do update set updated_at = public.explore_conversations.updated_at
    returning * into selected_conversation;
  else
    update public.explore_conversations
    set participant_ids = canonical_participants,
        conversation_key = canonical_key,
        created_by = coalesce(created_by, actor_user_id)
    where id = selected_conversation.id
    returning * into selected_conversation;
  end if;

  insert into public.explore_conversation_members (conversation_id, user_id)
  values
    (selected_conversation.id, actor_user_id),
    (selected_conversation.id, recipient_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return selected_conversation;
end;
$$;

revoke all on function public.get_or_create_explore_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_explore_direct_conversation(uuid) to authenticated;

-- ===========================================================================
-- 3. Read receipts: does the other person share them?
-- ===========================================================================

-- True unless the peer switched read receipts off. Only answers for someone
-- the caller shares a conversation with; anyone else reads as false.
create or replace function public.explore_peer_read_receipts_enabled(peer_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null or peer_user_id is null then false
    when not exists (
      select 1
      from public.explore_conversation_members mine
      join public.explore_conversation_members theirs on theirs.conversation_id = mine.conversation_id
      where mine.user_id = auth.uid() and theirs.user_id = peer_user_id
    ) then false
    else coalesce((
      select (preference.settings -> 'messages' ->> 'readReceipts')::boolean
      from public.explore_user_preferences preference
      where preference.user_id = peer_user_id
        and jsonb_typeof(preference.settings -> 'messages' -> 'readReceipts') = 'boolean'
      limit 1
    ), true)
  end;
$$;

revoke all on function public.explore_peer_read_receipts_enabled(uuid) from public, anon;
grant execute on function public.explore_peer_read_receipts_enabled(uuid) to authenticated;

commit;
