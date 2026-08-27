-- Unified notification receipts, richer campaigns, advanced admin assignments,
-- and audited UrMall message supervision.
--
-- Explore conversations remain deliberately outside every admin function in
-- this migration. UrMall message content is exposed only through the audited
-- security-definer RPC below; no broad admin SELECT policy is added.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- User notification delivery state and preferences
-- ---------------------------------------------------------------------------

alter table public.platform_notifications
  add column if not exists category text not null default 'system',
  add column if not exists workspace text not null default 'platform',
  add column if not exists workspace_id uuid,
  add column if not exists action_data jsonb not null default '{}'::jsonb,
  add column if not exists channels text[] not null default array['in_app']::text[],
  add column if not exists presentation text not null default 'inbox',
  add column if not exists dedupe_key text,
  add column if not exists seen_at timestamptz,
  add column if not exists displayed_at timestamptz,
  add column if not exists actioned_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_failure_count integer not null default 0;

create unique index if not exists platform_notifications_user_dedupe_idx
on public.platform_notifications(user_id, dedupe_key)
where dedupe_key is not null;

create index if not exists platform_notifications_campaign_delivery_idx
on public.platform_notifications(campaign_id, displayed_at, read_at, actioned_at)
where campaign_id is not null;

-- Users may acknowledge their own delivery, but cannot rewrite message content,
-- targeting, campaign metadata, or push accounting.
create or replace function public.guard_platform_notification_user_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_kunthai_admin() then
    new.user_id := old.user_id;
    new.campaign_id := old.campaign_id;
    new.sector := old.sector;
    new.notification_type := old.notification_type;
    new.title := old.title;
    new.body := old.body;
    new.priority := old.priority;
    new.category := old.category;
    new.workspace := old.workspace;
    new.workspace_id := old.workspace_id;
    new.action_target := old.action_target;
    new.action_data := old.action_data;
    new.channels := old.channels;
    new.presentation := old.presentation;
    new.dedupe_key := old.dedupe_key;
    new.expires_at := old.expires_at;
    new.push_sent_at := old.push_sent_at;
    new.push_failure_count := old.push_failure_count;
    new.created_at := old.created_at;
    if new.status not in ('unread','read','archived') then new.status := old.status; end if;
    if old.seen_at is not null then new.seen_at := old.seen_at;
    elsif new.seen_at is not null then new.seen_at := now(); end if;
    if old.displayed_at is not null then new.displayed_at := old.displayed_at;
    elsif new.displayed_at is not null then new.displayed_at := now(); end if;
    if old.actioned_at is not null then new.actioned_at := old.actioned_at;
    elsif new.actioned_at is not null then new.actioned_at := now(); end if;
    if old.dismissed_at is not null then new.dismissed_at := old.dismissed_at;
    elsif new.dismissed_at is not null then new.dismissed_at := now(); end if;
    if old.read_at is not null then new.read_at := old.read_at;
    elsif new.read_at is not null or new.status = 'read' then new.read_at := now(); end if;
  end if;
  return new;
end;
$$;

create table if not exists public.user_notification_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  source text not null default 'platform',
  seen_at timestamptz,
  read_at timestamptz,
  displayed_at timestamptz,
  actioned_at timestamptz,
  dismissed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists user_notification_receipts_user_updated_idx
on public.user_notification_receipts(user_id, updated_at desc);

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  floating_enabled boolean not null default true,
  push_enabled boolean not null default false,
  social_enabled boolean not null default true,
  commerce_enabled boolean not null default true,
  transport_enabled boolean not null default true,
  marketing_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists p256dh text not null default '',
  add column if not exists auth text not null default '',
  add column if not exists user_agent text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id, updated_at desc);
create unique index if not exists push_subscriptions_endpoint_uidx on public.push_subscriptions(endpoint);

alter table public.user_notification_receipts enable row level security;
alter table public.user_notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "users manage own unified notification receipts" on public.user_notification_receipts;
create policy "users manage own unified notification receipts"
on public.user_notification_receipts for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users manage own notification preferences" on public.user_notification_preferences;
create policy "users manage own notification preferences"
on public.user_notification_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
on public.push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_notification_receipts to authenticated;
grant select, insert, update on public.user_notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Financial, account, and safety records must not disappear after ten days.
-- Social activity remains short-lived, while durable platform notices get a
-- longer window and explicit expiries are always honoured.
create or replace function public.cleanup_expired_user_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  affected integer := 0;
begin
  if to_regclass('public.explore_notifications') is not null then
    delete from public.explore_notifications where created_at < now() - interval '30 days';
    get diagnostics affected = row_count;
    removed := removed + affected;
  end if;

  delete from public.platform_notifications
  where (expires_at is not null and expires_at < now())
     or (
       expires_at is null
       and created_at < now() - case
         when category in ('payment','account','safety','security') then interval '365 days'
         else interval '90 days'
       end
     );
  get diagnostics affected = row_count;
  return removed + affected;
end;
$$;

-- ---------------------------------------------------------------------------
-- Advanced campaign controls and truthful delivery analytics
-- ---------------------------------------------------------------------------

alter table public.admin_notification_campaigns
  add column if not exists channels text[] not null default array['in_app']::text[],
  add column if not exists presentation text not null default 'inbox',
  add column if not exists category text not null default 'announcement',
  add column if not exists action_target text,
  add column if not exists action_data jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists estimated_audience integer not null default 0,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz;

create or replace function public.admin_campaign_recipient_ids(
  campaign_sector text,
  campaign_audience text,
  campaign_filter jsonb default '{}'::jsonb
)
returns setof uuid
language sql
security definer
stable
set search_path = public, auth
as $$
  select users.id
  from auth.users users
  where
    campaign_audience = 'all'
    or (
      campaign_audience = 'specific_users'
      and (
        users.id::text in (select jsonb_array_elements_text(coalesce(campaign_filter -> 'userIds', '[]'::jsonb)))
        or lower(users.email) in (select lower(value) from jsonb_array_elements_text(coalesce(campaign_filter -> 'emails', '[]'::jsonb)) value)
      )
    )
    or (
      campaign_audience = 'account_type'
      and lower(coalesce(users.raw_user_meta_data ->> 'account_type', 'personal')) = lower(coalesce(campaign_filter ->> 'accountType', 'personal'))
    )
    or (
      campaign_audience = 'region'
      and lower(coalesce(users.raw_user_meta_data ->> 'country', users.raw_user_meta_data ->> 'city', '')) = lower(coalesce(campaign_filter ->> 'region', ''))
    )
    or (
      campaign_audience = 'sector_users'
      and (
        (campaign_sector = 'explore' and exists(select 1 from public.explore_profiles profile where profile.user_id = users.id))
        or (campaign_sector = 'marketplace' and (
          exists(select 1 from public.marketplace_businesses business where business.user_id = users.id)
          or exists(select 1 from public.marketplace_customer_messages message where message.buyer_id = users.id)
        ))
        or (campaign_sector = 'transport' and (
          exists(select 1 from public.transport_operators operator where operator.user_id = users.id)
          or exists(select 1 from public.transport_companies company where company.owner_user_id = users.id)
          or exists(select 1 from public.transport_trips trip where trip.passenger_id = users.id)
        ))
      )
    );
$$;

create or replace function public.admin_estimate_campaign_audience(
  campaign_sector text default 'platform',
  campaign_audience text default 'all',
  campaign_filter jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  total integer;
begin
  if not public.admin_has_permission('notifications.view', campaign_sector) then raise exception 'Not authorized'; end if;
  select count(*)::integer into total
  from public.admin_campaign_recipient_ids(campaign_sector, campaign_audience, campaign_filter);
  return coalesce(total, 0);
end;
$$;

-- High-impact broadcasts always require a second administrator. Lower-risk
-- campaigns retain the existing Super/Chief emergency override.
create or replace function public.admin_approve_campaign(campaign_uuid uuid)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_campaign public.admin_notification_campaigns;
  updated_campaign public.admin_notification_campaigns;
  requires_independent_approval boolean;
begin
  select * into previous_campaign
  from public.admin_notification_campaigns
  where id = campaign_uuid
  for update;

  if previous_campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.approve', previous_campaign.sector) then raise exception 'Not authorized'; end if;
  if previous_campaign.status not in ('draft', 'pending_approval') then raise exception 'Only draft campaigns can be approved'; end if;

  requires_independent_approval := previous_campaign.audience_type = 'all'
    or previous_campaign.priority = 'urgent'
    or previous_campaign.presentation = 'urgent';

  if previous_campaign.created_by = auth.uid()
     and (requires_independent_approval or not public.admin_has_role(array['super_admin','chief_admin'])) then
    raise exception 'A different administrator must approve this campaign';
  end if;

  update public.admin_notification_campaigns
  set status = case when scheduled_at is null or scheduled_at <= now() then 'approved' else 'scheduled' end,
      approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = campaign_uuid
  returning * into updated_campaign;

  perform public.admin_log_action(
    'notification.campaign_approved', updated_campaign.sector,
    'notification_campaign', campaign_uuid, null, '',
    to_jsonb(previous_campaign), to_jsonb(updated_campaign),
    jsonb_build_object('independentApprovalRequired', requires_independent_approval)
  );
  return updated_campaign;
end;
$$;

drop function if exists public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz);
create function public.admin_create_campaign(
  campaign_title text,
  campaign_body text,
  campaign_sector text default 'platform',
  campaign_audience text default 'all',
  campaign_priority text default 'normal',
  campaign_filter jsonb default '{}'::jsonb,
  campaign_schedule timestamptz default null,
  campaign_channels text[] default array['in_app']::text[],
  campaign_presentation text default 'inbox',
  campaign_category text default 'announcement',
  campaign_action_target text default null,
  campaign_action_data jsonb default '{}'::jsonb,
  campaign_expires_at timestamptz default null
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  created_campaign public.admin_notification_campaigns;
  audience_total integer;
begin
  if not public.admin_has_permission('notifications.manage', campaign_sector) then raise exception 'Not authorized'; end if;
  if btrim(campaign_title) = '' or btrim(campaign_body) = '' then raise exception 'Title and message are required'; end if;
  if campaign_presentation not in ('inbox','floating','inline','urgent') then raise exception 'Invalid presentation'; end if;
  if campaign_presentation = 'urgent' and campaign_priority <> 'urgent' then raise exception 'Urgent presentation requires urgent priority'; end if;

  audience_total := public.admin_estimate_campaign_audience(campaign_sector, campaign_audience, campaign_filter);
  insert into public.admin_notification_campaigns (
    title, body, sector, audience_type, audience_filter, priority, status, scheduled_at, created_by,
    channels, presentation, category, action_target, action_data, expires_at, estimated_audience
  ) values (
    btrim(campaign_title), btrim(campaign_body), campaign_sector, campaign_audience,
    coalesce(campaign_filter, '{}'::jsonb), campaign_priority,
    case when campaign_schedule is null then 'draft' else 'pending_approval' end,
    campaign_schedule, auth.uid(),
    coalesce(nullif(campaign_channels, '{}'::text[]), array['in_app']::text[]),
    campaign_presentation, btrim(campaign_category), nullif(btrim(campaign_action_target), ''),
    coalesce(campaign_action_data, '{}'::jsonb), campaign_expires_at, audience_total
  ) returning * into created_campaign;

  perform public.admin_log_action('notification.campaign_created', campaign_sector, 'notification_campaign', created_campaign.id, null, '', null, to_jsonb(created_campaign));
  return created_campaign;
end;
$$;

create or replace function public.admin_publish_campaign(campaign_uuid uuid)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  campaign public.admin_notification_campaigns;
  delivered integer := 0;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if auth.uid() is not null and not public.admin_has_permission('notifications.approve', campaign.sector) then raise exception 'Not authorized'; end if;
  if campaign.status not in ('approved','scheduled') then raise exception 'Campaign must be approved before publication'; end if;
  if campaign.status = 'scheduled' and campaign.scheduled_at > now() then raise exception 'The scheduled publication time has not arrived'; end if;

  update public.admin_notification_campaigns set status = 'sending', updated_at = now() where id = campaign_uuid;

  insert into public.platform_notifications (
    user_id, campaign_id, sector, notification_type, title, body, priority,
    category, workspace, action_target, action_data, channels, presentation,
    dedupe_key, expires_at
  )
  select recipient_id, campaign.id, campaign.sector, 'admin_message', campaign.title, campaign.body, campaign.priority,
    campaign.category, campaign.sector, campaign.action_target, campaign.action_data,
    campaign.channels, campaign.presentation, 'campaign:' || campaign.id::text, campaign.expires_at
  from public.admin_campaign_recipient_ids(campaign.sector, campaign.audience_type, campaign.audience_filter) recipient_id
  on conflict (campaign_id, user_id) where campaign_id is not null do nothing;

  get diagnostics delivered = row_count;
  update public.admin_notification_campaigns
  set status = 'completed', sent_at = now(), delivery_count = delivered,
      failure_count = 0, updated_at = now()
  where id = campaign_uuid
  returning * into campaign;

  perform public.admin_log_action('notification.campaign_published', campaign.sector, 'notification_campaign', campaign.id, null, '', null, to_jsonb(campaign), jsonb_build_object('recipientRowsCreated', delivered));
  return campaign;
exception
  when others then
    update public.admin_notification_campaigns
    set status = 'failed', failure_count = failure_count + 1, updated_at = now()
    where id = campaign_uuid;
    raise;
end;
$$;

create or replace function public.admin_send_campaign_test(campaign_uuid uuid)
returns public.platform_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.admin_notification_campaigns;
  created_notification public.platform_notifications;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.manage', campaign.sector) then raise exception 'Not authorized'; end if;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, dedupe_key, expires_at
  ) values (
    auth.uid(), campaign.sector, 'admin_test', '[TEST] ' || campaign.title, campaign.body,
    campaign.priority, campaign.category, campaign.sector, campaign.action_target,
    campaign.action_data, campaign.channels, campaign.presentation,
    'campaign-test:' || campaign.id::text || ':' || auth.uid()::text, now() + interval '1 day'
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do update
  set title = excluded.title, body = excluded.body, priority = excluded.priority,
      category = excluded.category, workspace = excluded.workspace,
      action_target = excluded.action_target, action_data = excluded.action_data,
      channels = excluded.channels, presentation = excluded.presentation,
      status = 'unread', read_at = null, seen_at = null, displayed_at = null,
      actioned_at = null, dismissed_at = null, created_at = now()
  returning * into created_notification;

  perform public.admin_log_action('notification.campaign_tested', campaign.sector, 'notification_campaign', campaign.id);
  return created_notification;
end;
$$;

create or replace function public.admin_cancel_campaign(campaign_uuid uuid, cancel_reason text)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.admin_notification_campaigns;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.manage', campaign.sector) then raise exception 'Not authorized'; end if;
  if campaign.status in ('completed','cancelled') then raise exception 'This campaign can no longer be cancelled'; end if;
  if length(btrim(cancel_reason)) < 5 then raise exception 'A cancellation reason is required'; end if;

  update public.admin_notification_campaigns
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), updated_at = now()
  where id = campaign_uuid returning * into campaign;
  perform public.admin_log_action('notification.campaign_cancelled', campaign.sector, 'notification_campaign', campaign.id, null, cancel_reason);
  return campaign;
end;
$$;

create or replace function public.admin_get_campaign_metrics(campaign_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  campaign public.admin_notification_campaigns;
  result jsonb;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.view', campaign.sector) then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'created', count(*),
    'displayed', count(*) filter (where displayed_at is not null),
    'read', count(*) filter (where read_at is not null),
    'actioned', count(*) filter (where actioned_at is not null),
    'dismissed', count(*) filter (where dismissed_at is not null),
    'pushSent', count(*) filter (where push_sent_at is not null),
    'pushFailures', coalesce(sum(push_failure_count), 0)
  ) into result
  from public.platform_notifications where campaign_id = campaign_uuid;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin responsibilities and temporary access
-- ---------------------------------------------------------------------------

alter table public.admin_assignments
  add column if not exists responsibilities text[] not null default '{}'::text[];

drop function if exists public.admin_list_team();
create function public.admin_list_team()
returns table (
  assignment_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role_key text,
  role_name text,
  sector_scopes text[],
  region_scopes text[],
  responsibilities text[],
  authority_level smallint,
  status text,
  expires_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select assignment.id, assignment.user_id, users.email::text,
    coalesce(users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1))::text,
    role.role_key, role.name, assignment.sector_scopes, assignment.region_scopes,
    assignment.responsibilities, assignment.authority_level, assignment.status,
    assignment.expires_at, assignment.last_access_at, assignment.created_at
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  join auth.users users on users.id = assignment.user_id
  where public.admin_has_permission('team.view')
  order by role.rank desc, assignment.created_at;
$$;

drop function if exists public.admin_grant_access(text,text,text[],text[],smallint,text);
create function public.admin_grant_access(
  target_email text,
  target_role_key text,
  target_sectors text[] default array['all']::text[],
  target_regions text[] default array['all']::text[],
  target_authority smallint default 2,
  reason text default '',
  target_responsibilities text[] default '{}'::text[],
  target_expires_at timestamptz default null
)
returns public.admin_assignments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  target_role public.admin_roles;
  assignment public.admin_assignments;
  previous_assignment public.admin_assignments;
  caller_rank smallint;
  caller_authority smallint;
begin
  if not public.admin_has_permission('team.manage') then raise exception 'Not authorized'; end if;
  if length(btrim(reason)) < 5 then raise exception 'An assignment reason is required'; end if;
  if nullif(btrim(target_email), '') is null then raise exception 'An existing KunThai account email is required'; end if;
  if exists (
    select 1 from unnest(coalesce(target_sectors, '{}'::text[])) sector
    where sector not in ('all','explore','marketplace','transport')
  ) then raise exception 'Unknown sector scope'; end if;

  select max(role.rank), max(current_assignment.authority_level)
  into caller_rank, caller_authority
  from public.admin_assignments current_assignment
  join public.admin_roles role on role.id = current_assignment.role_id
  where current_assignment.user_id = auth.uid() and public.admin_assignment_is_active(current_assignment);

  select * into target_role from public.admin_roles where role_key = target_role_key;
  if target_role.id is null then raise exception 'Unknown admin role'; end if;
  if target_role.rank >= caller_rank and not public.admin_has_role(array['super_admin']) then raise exception 'Only a Super Admin can grant this role'; end if;
  if target_role_key in ('super_admin','chief_admin') and not public.admin_has_role(array['super_admin']) then raise exception 'Only a Super Admin can appoint this role'; end if;
  if target_authority < 1 or target_authority > coalesce(caller_authority, 1) then raise exception 'Authority level must be between 1 and your own authority level'; end if;
  if target_expires_at is not null and target_expires_at <= now() then raise exception 'Expiry must be in the future'; end if;

  select id into target_user_id from auth.users where lower(email) = lower(btrim(target_email)) limit 1;
  if target_user_id is null then raise exception 'No KunThai account uses this email'; end if;

  select current_assignment.* into previous_assignment
  from public.admin_assignments current_assignment
  where current_assignment.user_id = target_user_id and current_assignment.role_id = target_role.id;

  insert into public.admin_assignments (
    user_id, role_id, sector_scopes, region_scopes, responsibilities,
    authority_level, status, granted_by, grant_reason, expires_at
  ) values (
    target_user_id, target_role.id,
    coalesce(nullif(target_sectors, '{}'::text[]), array['all']::text[]),
    coalesce(nullif(target_regions, '{}'::text[]), array['all']::text[]),
    coalesce(target_responsibilities, '{}'::text[]),
    target_authority, 'active', auth.uid(), btrim(reason), target_expires_at
  )
  on conflict (user_id, role_id) do update
  set sector_scopes = excluded.sector_scopes,
      region_scopes = excluded.region_scopes,
      responsibilities = excluded.responsibilities,
      authority_level = excluded.authority_level,
      status = 'active', granted_by = auth.uid(), grant_reason = excluded.grant_reason,
      expires_at = excluded.expires_at, updated_at = now()
  returning * into assignment;

  perform public.admin_log_action(
    case when previous_assignment.id is null then 'team.access_granted' else 'team.access_changed' end,
    'platform', 'admin_assignment', assignment.id, null, btrim(reason),
    case when previous_assignment.id is null then null else to_jsonb(previous_assignment) end,
    to_jsonb(assignment),
    jsonb_build_object('targetUserId', target_user_id, 'role', target_role_key)
  );
  return assignment;
end;
$$;

-- Include the new assignment dimensions in the access payload used by the UI.
create or replace function public.get_my_admin_access()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with active_assignments as (
    select assignment.*, role.role_key, role.name as role_name, role.rank
    from public.admin_assignments assignment
    join public.admin_roles role on role.id = assignment.role_id
    where assignment.user_id = auth.uid() and public.admin_assignment_is_active(assignment)
  ), effective_permissions as (
    select distinct role_permission.permission_key
    from active_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
  )
  select jsonb_build_object(
    'isAdmin', exists(select 1 from active_assignments),
    'roles', coalesce((select jsonb_agg(jsonb_build_object(
      'assignmentId', id, 'key', role_key, 'name', role_name, 'rank', rank,
      'sectors', sector_scopes, 'regions', region_scopes,
      'responsibilities', responsibilities, 'authorityLevel', authority_level,
      'expiresAt', expires_at
    ) order by rank desc) from active_assignments), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(permission_key order by permission_key) from effective_permissions), '[]'::jsonb),
    'sectors', coalesce((select to_jsonb(array_agg(distinct sector)) from active_assignments, lateral unnest(sector_scopes) sector), '[]'::jsonb),
    'responsibilities', coalesce((select to_jsonb(array_agg(distinct responsibility)) from active_assignments, lateral unnest(responsibilities) responsibility), '[]'::jsonb),
    'authorityLevel', coalesce((select max(authority_level) from active_assignments), 0),
    'requiresMfa', true
  );
$$;

-- ---------------------------------------------------------------------------
-- Audited UrMall message supervision (Explore is intentionally excluded)
-- ---------------------------------------------------------------------------

insert into public.admin_permissions(permission_key, name, description, permission_group)
values (
  'marketplace.messages.review',
  'Review supervised UrMall messages',
  'Read buyer/seller commerce conversations for safety, fraud, and dispute handling. Every access is audited.',
  'marketplace'
)
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group;

insert into public.admin_role_permissions(role_id, permission_key)
select role.id, 'marketplace.messages.review'
from public.admin_roles role
where role.role_key in ('super_admin','chief_admin','operations_lead','marketplace_manager','risk_officer','support_officer','auditor')
on conflict do nothing;

create table if not exists public.admin_marketplace_message_access_logs (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately stored without cascading foreign keys so an account, case, or
  -- shop deletion cannot erase audit history or block the underlying deletion.
  admin_user_id uuid not null,
  business_id uuid not null,
  buyer_id uuid not null,
  case_id uuid,
  reason text not null,
  message_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists admin_marketplace_message_access_actor_idx
on public.admin_marketplace_message_access_logs(admin_user_id, created_at desc);

alter table public.admin_marketplace_message_access_logs enable row level security;
drop policy if exists "authorized admins read UrMall message access logs" on public.admin_marketplace_message_access_logs;
create policy "authorized admins read UrMall message access logs"
on public.admin_marketplace_message_access_logs for select to authenticated
using (public.admin_has_permission('audit.view') or public.admin_has_permission('marketplace.messages.review', 'marketplace'));

create or replace function public.admin_prevent_marketplace_message_access_log_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'UrMall message access history is immutable';
end;
$$;

drop trigger if exists admin_marketplace_message_access_logs_immutable on public.admin_marketplace_message_access_logs;
create trigger admin_marketplace_message_access_logs_immutable
before update or delete on public.admin_marketplace_message_access_logs
for each row execute function public.admin_prevent_marketplace_message_access_log_mutation();

create or replace function public.admin_list_marketplace_conversations(
  search_text text default '',
  result_limit integer default 100
)
returns table (
  business_id uuid,
  business_name text,
  buyer_id uuid,
  buyer_name text,
  topic text,
  message_count bigint,
  last_message_at timestamptz,
  support_dispute boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select business.id,
    business.business_name,
    message.buyer_id,
    coalesce(nullif((array_agg(message.buyer_name order by message.created_at desc))[1], ''), 'Buyer')::text,
    coalesce(nullif((array_agg(message.topic order by message.created_at desc))[1], ''), 'UrMall conversation')::text,
    count(*)::bigint,
    max(message.created_at),
    bool_or(message.support_dispute)
  from public.marketplace_customer_messages message
  join public.marketplace_businesses business on business.id = message.business_id
  where message.buyer_id is not null
    and public.admin_has_permission('marketplace.messages.review', 'marketplace')
    and (
      btrim(coalesce(search_text, '')) = ''
      or business.business_name ilike '%' || btrim(search_text) || '%'
      or message.buyer_name ilike '%' || btrim(search_text) || '%'
      or message.topic ilike '%' || btrim(search_text) || '%'
      or message.buyer_id::text = btrim(search_text)
    )
  group by business.id, business.business_name, message.buyer_id
  order by max(message.created_at) desc
  limit greatest(1, least(coalesce(result_limit, 100), 250));
$$;

create or replace function public.admin_read_marketplace_conversation(
  business_uuid uuid,
  buyer_uuid uuid,
  access_reason text,
  case_uuid uuid default null,
  result_limit integer default 400
)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  buyer_id uuid,
  buyer_name text,
  sender_role text,
  topic text,
  body text,
  media_url text,
  media_type text,
  product_id uuid,
  product_name text,
  message_type text,
  support_dispute boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  accessed_count integer;
begin
  if not public.admin_has_permission('marketplace.messages.review', 'marketplace') then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(access_reason, ''))) < 10 then raise exception 'Provide a clear access reason of at least 10 characters'; end if;
  if case_uuid is not null and not exists (
    select 1 from public.admin_cases admin_case
    where admin_case.id = case_uuid
      and admin_case.sector = 'marketplace'
      and public.admin_has_permission('cases.view', admin_case.sector)
  ) then raise exception 'The selected UrMall case is not available to this administrator'; end if;

  select count(*)::integer into accessed_count
  from public.marketplace_customer_messages message
  where message.business_id = business_uuid and message.buyer_id = buyer_uuid;
  if accessed_count = 0 then raise exception 'UrMall conversation not found'; end if;

  insert into public.admin_marketplace_message_access_logs(
    admin_user_id, business_id, buyer_id, case_id, reason, message_count
  ) values (auth.uid(), business_uuid, buyer_uuid, case_uuid, btrim(access_reason), accessed_count);

  perform public.admin_log_action(
    'marketplace.messages_reviewed', 'marketplace', 'marketplace_business', business_uuid,
    case_uuid, btrim(access_reason), null, null,
    jsonb_build_object('buyerUserId', buyer_uuid, 'messageCount', accessed_count)
  );

  return query
  select message.id, message.business_id, business.business_name,
    message.buyer_id, coalesce(nullif(message.buyer_name, ''), 'Buyer')::text,
    message.sender_role, message.topic, message.preview,
    message.media_url, message.media_type, message.product_id, message.product_name,
    message.message_type, message.support_dispute, message.created_at
  from public.marketplace_customer_messages message
  join public.marketplace_businesses business on business.id = message.business_id
  where message.business_id = business_uuid and message.buyer_id = buyer_uuid
  order by message.created_at asc
  limit greatest(1, least(coalesce(result_limit, 400), 1000));
end;
$$;

revoke all on function public.admin_campaign_recipient_ids(text,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_estimate_campaign_audience(text,text,jsonb) from public, anon;
revoke all on function public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz) from public, anon;
revoke all on function public.admin_approve_campaign(uuid) from public, anon;
revoke all on function public.admin_send_campaign_test(uuid) from public, anon;
revoke all on function public.admin_cancel_campaign(uuid,text) from public, anon;
revoke all on function public.admin_get_campaign_metrics(uuid) from public, anon;
revoke all on function public.admin_list_team() from public, anon;
revoke all on function public.admin_grant_access(text,text,text[],text[],smallint,text,text[],timestamptz) from public, anon;
revoke all on function public.admin_list_marketplace_conversations(text,integer) from public, anon;
revoke all on function public.admin_read_marketplace_conversation(uuid,uuid,text,uuid,integer) from public, anon;
revoke all on function public.admin_prevent_marketplace_message_access_log_mutation() from public, anon, authenticated;

grant execute on function public.admin_estimate_campaign_audience(text,text,jsonb) to authenticated;
grant execute on function public.admin_create_campaign(text,text,text,text,text,jsonb,timestamptz,text[],text,text,text,jsonb,timestamptz) to authenticated;
grant execute on function public.admin_approve_campaign(uuid) to authenticated;
grant execute on function public.admin_send_campaign_test(uuid) to authenticated;
grant execute on function public.admin_cancel_campaign(uuid,text) to authenticated;
grant execute on function public.admin_get_campaign_metrics(uuid) to authenticated;
grant execute on function public.admin_list_team() to authenticated;
grant execute on function public.admin_grant_access(text,text,text[],text[],smallint,text,text[],timestamptz) to authenticated;
grant execute on function public.admin_list_marketplace_conversations(text,integer) to authenticated;
grant execute on function public.admin_read_marketplace_conversation(uuid,uuid,text,uuid,integer) to authenticated;
grant select on public.admin_marketplace_message_access_logs to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notification_receipts'
     ) then
    alter publication supabase_realtime add table public.user_notification_receipts;
  end if;
end;
$$;
