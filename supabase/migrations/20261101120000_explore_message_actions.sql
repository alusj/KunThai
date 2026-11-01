-- Message actions in Explore messages (2026-11-01): reply, edit within 15
-- minutes, delete for everyone within 24 hours. "Delete for me" already uses
-- explore_message_hidden.
--
-- reply_snapshot is written by the database from the quoted message (never by
-- the sender), so a reply cannot quote words the other person did not send.
-- Editing or deleting the quoted message updates every snapshot of it.

alter table public.explore_messages
  add column if not exists reply_to_id uuid references public.explore_messages(id) on delete set null,
  add column if not exists reply_snapshot jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists explore_messages_reply_to_idx
  on public.explore_messages (reply_to_id)
  where reply_to_id is not null;

-- ---------------------------------------------------------------------------
-- 1. Replies quote a message from the same conversation
-- ---------------------------------------------------------------------------

create or replace function public.explore_stamp_message_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quoted public.explore_messages;
begin
  new.reply_snapshot := null;
  new.edited_at := null;
  new.deleted_at := null;
  if new.reply_to_id is null then
    return new;
  end if;

  select * into quoted
  from public.explore_messages message
  where message.id = new.reply_to_id
    and message.conversation_id = new.conversation_id;

  if not found then
    new.reply_to_id := null;
    return new;
  end if;

  new.reply_snapshot := jsonb_build_object(
    'senderId', quoted.sender_id,
    'body', left(coalesce(quoted.body, ''), 160),
    'type', coalesce(quoted.media_type, 'text'),
    'deleted', quoted.deleted_at is not null
  );
  return new;
end;
$$;

drop trigger if exists explore_messages_stamp_reply on public.explore_messages;
create trigger explore_messages_stamp_reply
  before insert on public.explore_messages
  for each row execute function public.explore_stamp_message_reply();

-- ---------------------------------------------------------------------------
-- 2. Edit your own text message within 15 minutes
-- ---------------------------------------------------------------------------

create or replace function public.edit_explore_message(p_message_id uuid, p_body text)
returns public.explore_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.explore_messages;
  next_body text := btrim(coalesce(p_body, ''));
begin
  select * into target from public.explore_messages where id = p_message_id for update;

  if not found or target.sender_id is distinct from auth.uid() then
    raise exception 'You can only edit your own messages.' using errcode = '42501';
  end if;
  if target.deleted_at is not null then
    raise exception 'This message was deleted.' using errcode = '22023';
  end if;
  if coalesce(target.media_type, 'text') <> 'text' then
    raise exception 'Only text messages can be edited.' using errcode = '22023';
  end if;
  if target.created_at < timezone('utc', now()) - interval '15 minutes' then
    raise exception 'Messages can only be edited for 15 minutes.' using errcode = '22023';
  end if;
  if next_body = '' or char_length(next_body) > 4000 then
    raise exception 'Write a message between 1 and 4000 characters.' using errcode = '22023';
  end if;
  if next_body = target.body then
    return target;
  end if;

  update public.explore_messages
  set body = next_body,
      edited_at = timezone('utc', now())
  where id = p_message_id
  returning * into target;

  update public.explore_messages
  set reply_snapshot = coalesce(reply_snapshot, '{}'::jsonb) || jsonb_build_object('body', left(next_body, 160))
  where reply_to_id = p_message_id;

  return target;
end;
$$;

revoke all on function public.edit_explore_message(uuid, text) from public, anon;
grant execute on function public.edit_explore_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Delete your own message for everyone within 24 hours
-- ---------------------------------------------------------------------------

-- The row stays so both people see "This message was deleted" in its place;
-- its words, file link and live-location details are cleared. The Space
-- "sent by" label (metadata.actor) is kept.
create or replace function public.delete_explore_message_for_everyone(p_message_id uuid)
returns public.explore_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.explore_messages;
begin
  select * into target from public.explore_messages where id = p_message_id for update;

  if not found or target.sender_id is distinct from auth.uid() then
    raise exception 'You can only delete your own messages for everyone.' using errcode = '42501';
  end if;
  if target.deleted_at is not null then
    return target;
  end if;
  if target.created_at < timezone('utc', now()) - interval '24 hours' then
    raise exception 'Messages can only be deleted for everyone for 24 hours.' using errcode = '22023';
  end if;

  update public.explore_messages
  set body = '',
      media_url = '',
      media_type = 'text',
      metadata = case
        when coalesce(metadata, '{}'::jsonb) ? 'actor' then jsonb_build_object('actor', metadata -> 'actor')
        else '{}'::jsonb
      end,
      deleted_at = timezone('utc', now())
  where id = p_message_id
  returning * into target;

  update public.explore_messages
  set reply_snapshot = coalesce(reply_snapshot, '{}'::jsonb) || jsonb_build_object('body', '', 'deleted', true)
  where reply_to_id = p_message_id;

  return target;
end;
$$;

revoke all on function public.delete_explore_message_for_everyone(uuid) from public, anon;
grant execute on function public.delete_explore_message_for_everyone(uuid) to authenticated;
