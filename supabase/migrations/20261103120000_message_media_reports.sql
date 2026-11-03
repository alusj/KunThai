-- Reports from the long-press menu (2026-11-03): a chat message (text or
-- photo) in Explore or UrMall, or a photo shown full screen. Each report opens
-- a case in the admin panel's Reports queue (admin_capture_source_case), with
-- a snapshot of what was reported.
--
-- The snapshot is written by the database from the message itself, never by
-- the reporter, and only for a message the reporter can read. A private
-- Explore chat photo stays private: admins with reports.view may open only
-- the files named in a report.

create table if not exists public.message_media_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('explore_message', 'marketplace_message', 'image')),
  target_id text not null,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('nudity', 'harassment', 'scam', 'violence', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  title text not null default '',
  message_body text not null default '',
  media_url text not null default '',
  media_path text not null default '',
  context text not null default '' check (char_length(context) <= 40),
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists message_media_reports_media_path_idx
  on public.message_media_reports (media_path)
  where media_path <> '';

-- ---------------------------------------------------------------------------
-- 1. The database fills in what was reported
-- ---------------------------------------------------------------------------

create or replace function public.stamp_message_media_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  explore_row public.explore_messages;
  marketplace_row public.marketplace_customer_messages;
  owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to report.' using errcode = '42501';
  end if;
  new.reporter_id := auth.uid();
  new.status := 'open';
  new.details := btrim(coalesce(new.details, ''));

  if new.target_type = 'explore_message' then
    select * into explore_row from public.explore_messages where id = public.explore_try_uuid(new.target_id);
    if not found or not public.explore_is_conversation_member(explore_row.conversation_id, auth.uid()) then
      raise exception 'This message cannot be reported.' using errcode = '42501';
    end if;
    if explore_row.sender_id = auth.uid() then
      raise exception 'You cannot report your own message.' using errcode = '22023';
    end if;
    new.reported_user_id := explore_row.sender_id;
    new.message_body := left(coalesce(explore_row.body, ''), 500);
    new.media_url := coalesce(explore_row.media_url, '');
    new.media_path := case
      when new.media_url like 'private:explore-message-media/%' then substr(new.media_url, length('private:explore-message-media/') + 1)
      else ''
    end;
    new.context := 'explore_chat';
  elsif new.target_type = 'marketplace_message' then
    select * into marketplace_row from public.marketplace_customer_messages where id = public.explore_try_uuid(new.target_id);
    if not found then
      raise exception 'This message cannot be reported.' using errcode = '42501';
    end if;
    select business.user_id into owner_id from public.marketplace_businesses business where business.id = marketplace_row.business_id;
    if not (
      marketplace_row.buyer_id = auth.uid()
      or owner_id = auth.uid()
      or public.has_urmall_admin_responsibility(marketplace_row.business_id, 'messageReplies')
    ) then
      raise exception 'This message cannot be reported.' using errcode = '42501';
    end if;
    new.reported_user_id := case
      when coalesce(marketplace_row.sender_role, 'buyer') = 'buyer' then marketplace_row.buyer_id
      else coalesce(marketplace_row.sent_by, owner_id)
    end;
    if new.reported_user_id = auth.uid() then
      raise exception 'You cannot report your own message.' using errcode = '22023';
    end if;
    new.message_body := left(coalesce(marketplace_row.preview, ''), 500);
    new.media_url := coalesce(marketplace_row.media_url, '');
    new.media_path := '';
    new.context := 'urmall_chat';
  else
    -- A public photo (post, product, profile) shown full screen: its address
    -- is the report's target; who posted it comes from the app.
    if new.target_id !~ '^https://[^ ]+/storage/v1/object/public/' then
      raise exception 'This photo cannot be reported.' using errcode = '22023';
    end if;
    new.media_url := new.target_id;
    new.media_path := '';
    new.message_body := '';
    if new.reported_user_id = auth.uid() then
      new.reported_user_id := null;
    end if;
  end if;

  new.title := case
    when new.target_type = 'image' then 'Photo reported'
    when new.media_url <> '' then 'Chat photo reported'
    else 'Chat message reported'
  end;
  return new;
end;
$$;

drop trigger if exists message_media_reports_stamp on public.message_media_reports;
create trigger message_media_reports_stamp
  before insert on public.message_media_reports
  for each row execute function public.stamp_message_media_report();

-- ---------------------------------------------------------------------------
-- 2. Who can file and see reports
-- ---------------------------------------------------------------------------

alter table public.message_media_reports enable row level security;

drop policy if exists "people file their own reports" on public.message_media_reports;
create policy "people file their own reports"
on public.message_media_reports for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "people and the safety team read reports" on public.message_media_reports;
create policy "people and the safety team read reports"
on public.message_media_reports for select to authenticated
using (reporter_id = auth.uid() or public.admin_has_permission('reports.view'));

grant select, insert on public.message_media_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Each report opens a case in the admin Reports queue
-- ---------------------------------------------------------------------------

drop trigger if exists admin_intake_message_media_reports on public.message_media_reports;
create trigger admin_intake_message_media_reports
  after insert or update on public.message_media_reports
  for each row
  when (new.target_type <> 'marketplace_message')
  execute function public.admin_capture_source_case('message_media_report', 'explore', 'reports', 'media_report');

drop trigger if exists admin_intake_marketplace_message_reports on public.message_media_reports;
create trigger admin_intake_marketplace_message_reports
  after insert or update on public.message_media_reports
  for each row
  when (new.target_type = 'marketplace_message')
  execute function public.admin_capture_source_case('message_media_report', 'marketplace', 'reports', 'media_report');

-- ---------------------------------------------------------------------------
-- 4. The safety team may open a reported private chat photo (only those)
-- ---------------------------------------------------------------------------

drop policy if exists "Safety team reads reported message media" on storage.objects;
create policy "Safety team reads reported message media"
on storage.objects for select to authenticated
using (
  bucket_id = 'explore-message-media'
  and public.admin_has_permission('reports.view')
  and exists (
    select 1 from public.message_media_reports report
    where report.media_path <> '' and report.media_path = storage.objects.name
  )
);
