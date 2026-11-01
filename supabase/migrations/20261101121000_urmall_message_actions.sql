-- Message actions in UrMall buyer/seller chats (2026-11-01): reply, edit
-- within 15 minutes, delete for everyone within 24 hours, delete for me.
--
-- A message's words live in `preview`. Rows did not record which account sent
-- them (only sender_role), so sent_by is stamped from now on; an older row
-- belongs to its buyer (buyer messages) or the business owner (seller
-- messages).

alter table public.marketplace_customer_messages
  add column if not exists sent_by uuid references auth.users(id) on delete set null,
  add column if not exists reply_to_id uuid references public.marketplace_customer_messages(id) on delete set null,
  add column if not exists reply_snapshot jsonb,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists marketplace_customer_messages_reply_to_idx
  on public.marketplace_customer_messages (reply_to_id)
  where reply_to_id is not null;

-- ---------------------------------------------------------------------------
-- 1. Sender and reply are stamped by the database
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_stamp_message_actions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quoted public.marketplace_customer_messages;
begin
  if auth.uid() is not null then
    new.sent_by := auth.uid();
  end if;
  new.reply_snapshot := null;
  new.edited_at := null;
  new.deleted_at := null;
  if new.reply_to_id is null then
    return new;
  end if;

  -- Only a message from the same buyer's thread with the same business.
  select * into quoted
  from public.marketplace_customer_messages message
  where message.id = new.reply_to_id
    and message.business_id = new.business_id
    and message.buyer_id is not distinct from new.buyer_id;

  if not found then
    new.reply_to_id := null;
    return new;
  end if;

  new.reply_snapshot := jsonb_build_object(
    'from', coalesce(quoted.sender_role, 'buyer'),
    'body', left(coalesce(quoted.preview, ''), 160),
    'type', coalesce(quoted.media_type, 'text'),
    'deleted', quoted.deleted_at is not null
  );
  return new;
end;
$$;

drop trigger if exists marketplace_customer_messages_stamp_actions on public.marketplace_customer_messages;
create trigger marketplace_customer_messages_stamp_actions
  before insert on public.marketplace_customer_messages
  for each row execute function public.marketplace_stamp_message_actions();

-- Whether the caller sent this message.
create or replace function public.marketplace_message_sent_by_caller(target public.marketplace_customer_messages)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then false
    when target.sent_by is not null then target.sent_by = auth.uid()
    when coalesce(target.sender_role, 'buyer') = 'buyer' then target.buyer_id = auth.uid()
    else exists (
      select 1 from public.marketplace_businesses business
      where business.id = target.business_id and business.user_id = auth.uid()
    )
  end;
$$;

revoke all on function public.marketplace_message_sent_by_caller(public.marketplace_customer_messages) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Edit your own text message within 15 minutes
-- ---------------------------------------------------------------------------

create or replace function public.edit_marketplace_message(p_message_id uuid, p_body text)
returns public.marketplace_customer_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_customer_messages;
  next_body text := btrim(coalesce(p_body, ''));
begin
  select * into target from public.marketplace_customer_messages where id = p_message_id for update;

  if not found or not public.marketplace_message_sent_by_caller(target) then
    raise exception 'You can only edit your own messages.' using errcode = '42501';
  end if;
  if target.deleted_at is not null then
    raise exception 'This message was deleted.' using errcode = '22023';
  end if;
  if coalesce(target.media_url, '') <> '' then
    raise exception 'Only text messages can be edited.' using errcode = '22023';
  end if;
  if target.created_at < now() - interval '15 minutes' then
    raise exception 'Messages can only be edited for 15 minutes.' using errcode = '22023';
  end if;
  if next_body = '' or char_length(next_body) > 4000 then
    raise exception 'Write a message between 1 and 4000 characters.' using errcode = '22023';
  end if;
  if next_body = target.preview then
    return target;
  end if;

  update public.marketplace_customer_messages
  set preview = next_body,
      edited_at = now()
  where id = p_message_id
  returning * into target;

  update public.marketplace_customer_messages
  set reply_snapshot = coalesce(reply_snapshot, '{}'::jsonb) || jsonb_build_object('body', left(next_body, 160))
  where reply_to_id = p_message_id;

  return target;
end;
$$;

revoke all on function public.edit_marketplace_message(uuid, text) from public, anon;
grant execute on function public.edit_marketplace_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Delete your own message for everyone within 24 hours
-- ---------------------------------------------------------------------------

create or replace function public.delete_marketplace_message_for_everyone(p_message_id uuid)
returns public.marketplace_customer_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_customer_messages;
begin
  select * into target from public.marketplace_customer_messages where id = p_message_id for update;

  if not found or not public.marketplace_message_sent_by_caller(target) then
    raise exception 'You can only delete your own messages for everyone.' using errcode = '42501';
  end if;
  if target.deleted_at is not null then
    return target;
  end if;
  if target.created_at < now() - interval '24 hours' then
    raise exception 'Messages can only be deleted for everyone for 24 hours.' using errcode = '22023';
  end if;

  update public.marketplace_customer_messages
  set preview = '',
      media_url = '',
      media_type = 'text',
      deleted_at = now()
  where id = p_message_id
  returning * into target;

  update public.marketplace_customer_messages
  set reply_snapshot = coalesce(reply_snapshot, '{}'::jsonb) || jsonb_build_object('body', '', 'deleted', true)
  where reply_to_id = p_message_id;

  return target;
end;
$$;

revoke all on function public.delete_marketplace_message_for_everyone(uuid) from public, anon;
grant execute on function public.delete_marketplace_message_for_everyone(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Delete for me
-- ---------------------------------------------------------------------------

create table if not exists public.marketplace_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.marketplace_customer_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists marketplace_message_hidden_message_idx
  on public.marketplace_message_hidden (message_id);

alter table public.marketplace_message_hidden enable row level security;

drop policy if exists "people read the marketplace messages they hid" on public.marketplace_message_hidden;
create policy "people read the marketplace messages they hid"
on public.marketplace_message_hidden for select to authenticated
using (user_id = auth.uid());

-- Only a message the person can read (message policies apply in the check).
drop policy if exists "people hide marketplace messages they can read" on public.marketplace_message_hidden;
create policy "people hide marketplace messages they can read"
on public.marketplace_message_hidden for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.marketplace_customer_messages message where message.id = message_id)
);

drop policy if exists "people unhide their marketplace messages" on public.marketplace_message_hidden;
create policy "people unhide their marketplace messages"
on public.marketplace_message_hidden for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.marketplace_message_hidden to authenticated;
