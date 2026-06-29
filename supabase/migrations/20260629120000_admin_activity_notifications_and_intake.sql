-- Complete the KunThai admin control loop.
--
-- 1. Every audited admin mutation creates a private activity notification for
--    active Chief and Super Admins.
-- 2. Every user report/support case creates a private notification for active,
--    appropriately scoped administrators.
-- 3. Explore and Transport support submissions are durable database records;
--    the client must never present an unsynchronised local draft as submitted.

create extension if not exists pgcrypto;

create table if not exists public.explore_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'General',
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent','critical')),
  status text not null default 'open' check (status in ('open','in_review','waiting_information','resolved','closed')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_support_tickets (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users(id) on delete cascade,
  passenger_name text not null default '',
  trip_id uuid,
  fleet_id uuid,
  topic text not null check (char_length(btrim(topic)) between 1 and 160),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent','critical')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  status text not null default 'open' check (status in ('open','in_review','waiting_information','resolved','closed')),
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Older Transport deployments already have this table. Keep their rows and
-- add only the fields required by the connected admin reply/status workflow.
alter table public.explore_support_tickets
  add column if not exists admin_reply text,
  add column if not exists updated_at timestamptz not null default now();
alter table public.transport_support_tickets
  add column if not exists admin_reply text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists explore_support_tickets_user_created_idx
  on public.explore_support_tickets(user_id, created_at desc);
create index if not exists explore_support_tickets_admin_queue_idx
  on public.explore_support_tickets(status, priority, created_at desc);
create index if not exists transport_support_tickets_passenger_created_idx
  on public.transport_support_tickets(passenger_id, created_at desc);
create index if not exists transport_support_tickets_admin_queue_idx
  on public.transport_support_tickets(status, priority, created_at desc);

create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists explore_support_ticket_updated_at on public.explore_support_tickets;
create trigger explore_support_ticket_updated_at
before update on public.explore_support_tickets
for each row execute function public.set_support_ticket_updated_at();

drop trigger if exists transport_support_ticket_updated_at on public.transport_support_tickets;
create trigger transport_support_ticket_updated_at
before update on public.transport_support_tickets
for each row execute function public.set_support_ticket_updated_at();

alter table public.explore_support_tickets enable row level security;
alter table public.transport_support_tickets enable row level security;

drop policy if exists "Users create own Explore support tickets" on public.explore_support_tickets;
create policy "Users create own Explore support tickets"
on public.explore_support_tickets for insert to authenticated
with check (user_id = auth.uid() and status = 'open' and admin_reply is null);

drop policy if exists "Users read own Explore support tickets" on public.explore_support_tickets;
create policy "Users read own Explore support tickets"
on public.explore_support_tickets for select to authenticated
using (user_id = auth.uid() or public.admin_has_permission('support.view', 'explore'));

drop policy if exists "Support admins manage Explore support tickets" on public.explore_support_tickets;
create policy "Support admins manage Explore support tickets"
on public.explore_support_tickets for update to authenticated
using (public.admin_has_permission('support.manage', 'explore'))
with check (public.admin_has_permission('support.manage', 'explore'));

drop policy if exists "Passengers create own Transport support tickets" on public.transport_support_tickets;
create policy "Passengers create own Transport support tickets"
on public.transport_support_tickets for insert to authenticated
with check (passenger_id = auth.uid() and status = 'open' and admin_reply is null);

drop policy if exists "Passengers read own Transport support tickets" on public.transport_support_tickets;
create policy "Passengers read own Transport support tickets"
on public.transport_support_tickets for select to authenticated
using (passenger_id = auth.uid() or public.admin_has_permission('support.view', 'transport'));

drop policy if exists "Support admins manage Transport support tickets" on public.transport_support_tickets;
create policy "Support admins manage Transport support tickets"
on public.transport_support_tickets for update to authenticated
using (public.admin_has_permission('support.manage', 'transport'))
with check (public.admin_has_permission('support.manage', 'transport'));

revoke all on table public.explore_support_tickets, public.transport_support_tickets from anon;
grant select, insert, update on table public.explore_support_tickets, public.transport_support_tickets to authenticated;

-- Make source-case normalisation understand every current user intake shape.
create or replace function public.admin_upsert_source_case(
  source_row jsonb,
  source_resource_type text,
  source_sector text,
  source_queue text,
  source_case_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id uuid;
  source_status text;
  source_title text;
  source_description text;
  source_priority text;
  source_subject uuid;
  source_reporter uuid;
  source_case_id uuid;
  source_business_id uuid;
begin
  source_id := nullif(source_row ->> 'id', '')::uuid;
  if source_id is null then return null; end if;

  source_status := lower(coalesce(source_row ->> 'status', source_row ->> 'account_status', source_row ->> 'verification_status', 'open'));
  if source_status not in ('new','open','pending','submitted','pending_review','under_review','in_review','verification_pending') then
    return null;
  end if;

  source_title := coalesce(
    nullif(source_row ->> 'title',''),
    nullif(source_row ->> 'subject',''),
    nullif(source_row ->> 'topic',''),
    nullif(source_row ->> 'business_name',''),
    nullif(source_row ->> 'company_name',''),
    nullif(source_row ->> 'full_name',''),
    initcap(replace(source_case_type, '_', ' '))
  );
  source_description := coalesce(
    nullif(source_row ->> 'description',''),
    nullif(source_row ->> 'reason',''),
    nullif(source_row ->> 'body',''),
    nullif(source_row ->> 'message',''),
    nullif(source_row ->> 'note',''),
    ''
  );
  source_priority := lower(coalesce(source_row ->> 'priority', case when source_row ->> 'severity' = 'critical' then 'critical' else 'normal' end));
  if source_priority not in ('low','normal','high','urgent','critical') then source_priority := 'normal'; end if;

  source_subject := nullif(coalesce(source_row ->> 'reported_user_id', source_row ->> 'operator_user_id'), '')::uuid;
  source_reporter := nullif(coalesce(source_row ->> 'reporter_id', source_row ->> 'user_id', source_row ->> 'passenger_id'), '')::uuid;

  -- Seller cases carry a business id rather than a user id. Resolve the owner
  -- inside this protected function so the report remains connected to them.
  if source_reporter is null and source_resource_type in ('marketplace_case','marketplace_verification')
     and to_regclass('public.marketplace_businesses') is not null then
    source_business_id := nullif(source_row ->> 'business_id', '')::uuid;
    if source_business_id is not null then
      select business.user_id into source_reporter
      from public.marketplace_businesses business
      where business.id = source_business_id;
    end if;
  end if;

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, subject_user_id, reporter_user_id, sla_due_at, metadata
  ) values (
    source_sector, source_queue, source_case_type, source_resource_type, source_id,
    source_title, source_description, source_priority, source_subject, source_reporter,
    now() + case source_priority
      when 'critical' then interval '30 minutes'
      when 'urgent' then interval '2 hours'
      when 'high' then interval '8 hours'
      when 'low' then interval '72 hours'
      else interval '24 hours'
    end,
    jsonb_build_object('source', source_row)
  )
  on conflict (resource_type, resource_id) do update
  set title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      subject_user_id = coalesce(excluded.subject_user_id, public.admin_cases.subject_user_id),
      reporter_user_id = coalesce(excluded.reporter_user_id, public.admin_cases.reporter_user_id),
      metadata = excluded.metadata,
      updated_at = now()
  returning id into source_case_id;

  return source_case_id;
end;
$$;

-- Re-install intake triggers because some product tables may have been added
-- after the original admin foundation migration.
do $$
declare
  source record;
begin
  for source in
    select * from (values
      ('explore_post_reports','admin_intake_explore_post_reports','explore_post_report','explore','reports','content_report'),
      ('explore_comment_reports','admin_intake_explore_comment_reports','explore_comment_report','explore','reports','comment_report'),
      ('explore_profile_reports','admin_intake_explore_profile_reports','explore_profile_report','explore','reports','profile_report'),
      ('explore_support_tickets','admin_intake_explore_support','explore_support_ticket','explore','support','explore_support'),
      ('marketplace_seller_verification_requests','admin_intake_marketplace_verification','marketplace_verification','marketplace','verification','seller_verification'),
      ('marketplace_seller_cases','admin_intake_marketplace_cases','marketplace_case','marketplace','support','seller_case'),
      ('transport_support_tickets','admin_intake_transport_support','transport_support','transport','support','trip_support'),
      ('transport_operators','admin_intake_transport_operators','transport_operator_verification','transport','verification','operator_verification'),
      ('transport_companies','admin_intake_transport_companies','transport_company_verification','transport','verification','company_verification'),
      ('transport_company_fleets','admin_intake_transport_fleets','transport_fleet_verification','transport','verification','fleet_verification'),
      ('transport_operator_documents','admin_intake_transport_documents','transport_document_verification','transport','verification','document_verification'),
      ('nearby_area_reports','admin_intake_area_reports','area_report','transport','reports','area_safety_report')
    ) as configured(table_name, trigger_name, resource_type, sector, queue_name, case_type)
  loop
    if to_regclass('public.' || source.table_name) is not null then
      execute format('drop trigger if exists %I on public.%I', source.trigger_name, source.table_name);
      execute format(
        'create trigger %I after insert or update on public.%I for each row execute function public.admin_capture_source_case(%L,%L,%L,%L)',
        source.trigger_name, source.table_name, source.resource_type, source.sector, source.queue_name, source.case_type
      );
    end if;
  end loop;
end;
$$;

-- Backfill the two durable ticket stores before alert fan-out is installed, so
-- historical tickets appear as cases without flooding administrator inboxes.
select public.admin_upsert_source_case(to_jsonb(ticket), 'explore_support_ticket', 'explore', 'support', 'explore_support')
from public.explore_support_tickets ticket;
select public.admin_upsert_source_case(to_jsonb(ticket), 'transport_support', 'transport', 'support', 'trip_support')
from public.transport_support_tickets ticket;
select public.admin_upsert_source_case(
  to_jsonb(feedback) || jsonb_build_object(
    'description', coalesce(feedback.message, 'Attachment supplied with this feedback.'),
    'priority', case when feedback.feedback_type = 'safety' then 'urgent' else 'normal' end
  ),
  'user_care_feedback', 'explore', 'support', 'user_voice'
)
from public.user_care_feedback feedback;

create table if not exists public.admin_activity_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('admin_action','case_intake','system')),
  title text not null,
  body text not null default '',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent','critical')),
  actor_user_id uuid references auth.users(id) on delete set null,
  audit_log_id uuid references public.admin_audit_logs(id) on delete cascade,
  case_id uuid references public.admin_cases(id) on delete cascade,
  sector text,
  action_key text,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_activity_notifications_recipient_idx
  on public.admin_activity_notifications(recipient_user_id, read_at, created_at desc);
create unique index if not exists admin_activity_notifications_audit_recipient_idx
  on public.admin_activity_notifications(recipient_user_id, audit_log_id)
  where audit_log_id is not null;
create unique index if not exists admin_activity_notifications_case_recipient_idx
  on public.admin_activity_notifications(recipient_user_id, case_id, notification_type)
  where case_id is not null;

alter table public.admin_activity_notifications enable row level security;
drop policy if exists "Admins read own activity notifications" on public.admin_activity_notifications;
create policy "Admins read own activity notifications"
on public.admin_activity_notifications for select to authenticated
using (recipient_user_id = auth.uid() and public.is_kunthai_admin());

revoke all on table public.admin_activity_notifications from public, anon, authenticated;
grant select on table public.admin_activity_notifications to authenticated;

create or replace function public.admin_mark_activity_notifications_read(notification_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  if not public.is_kunthai_admin() then raise exception 'Not authorized'; end if;

  update public.admin_activity_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.recipient_user_id = auth.uid()
    and notification.read_at is null
    and (notification_ids is null or notification.id = any(notification_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.admin_notify_chiefs_of_audit()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_label text := 'KunThai system';
  actor_email text := '';
begin
  if new.actor_user_id is not null then
    select
      coalesce(users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1), 'Administrator'),
      coalesce(users.email, '')
    into actor_label, actor_email
    from auth.users users
    where users.id = new.actor_user_id;
  end if;

  insert into public.admin_activity_notifications (
    recipient_user_id, notification_type, title, body, priority, actor_user_id,
    audit_log_id, case_id, sector, action_key, resource_type, resource_id, metadata
  )
  select distinct assignment.user_id, 'admin_action',
    'Admin action: ' || initcap(replace(new.action_key, '.', ' ')),
    actor_label || case when actor_email <> '' then ' (' || actor_email || ')' else '' end ||
      case when nullif(new.reason, '') is not null then ' — ' || new.reason else '' end,
    case when new.action_key like '%suspend%' or new.action_key like '%revoked%' then 'high' else 'normal' end,
    new.actor_user_id, new.id, new.case_id, coalesce(new.sector, 'platform'), new.action_key,
    new.resource_type, new.resource_id,
    jsonb_build_object('actorName', actor_label, 'actorEmail', actor_email, 'actorRoles', new.actor_role_keys)
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  where role.role_key in ('super_admin','chief_admin')
    and public.admin_assignment_is_active(assignment)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists admin_audit_notify_chiefs on public.admin_audit_logs;
create trigger admin_audit_notify_chiefs
after insert on public.admin_audit_logs
for each row execute function public.admin_notify_chiefs_of_audit();

create or replace function public.admin_notify_case_intake()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed_permission text;
begin
  needed_permission := case new.queue
    when 'reports' then 'reports.view'
    when 'support' then 'support.view'
    when 'verification' then 'verification.view'
    when 'finance' then 'finance.view'
    else 'cases.view'
  end;

  insert into public.admin_activity_notifications (
    recipient_user_id, notification_type, title, body, priority, case_id,
    sector, action_key, resource_type, resource_id, metadata
  )
  select distinct assignment.user_id, 'case_intake',
    case new.queue
      when 'reports' then 'New user report'
      when 'support' then 'New support request'
      when 'verification' then 'New verification request'
      else 'New admin case'
    end,
    new.title, new.priority, new.id, new.sector, 'case.intake', new.resource_type, new.resource_id,
    jsonb_build_object('caseNumber', new.case_number, 'queue', new.queue, 'reporterUserId', new.reporter_user_id)
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  join public.admin_role_permissions role_permission on role_permission.role_id = role.id
  where role_permission.permission_key = needed_permission
    and public.admin_assignment_is_active(assignment)
    and ('all' = any(assignment.sector_scopes) or new.sector = any(assignment.sector_scopes))
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists admin_case_notify_intake on public.admin_cases;
create trigger admin_case_notify_intake
after insert on public.admin_cases
for each row execute function public.admin_notify_case_intake();

-- Keep support source rows and their admin case in step, including a reply that
-- the submitting user can see in their recent requests.
create or replace function public.admin_sync_case_to_support_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_status text;
begin
  if old.status is not distinct from new.status
     and old.resolution_note is not distinct from new.resolution_note then
    return new;
  end if;

  source_status := case
    when new.status in ('resolved','actioned') then 'resolved'
    when new.status = 'closed' then 'closed'
    when new.status = 'waiting_information' then 'waiting_information'
    else 'in_review'
  end;

  if new.resource_type = 'explore_support_ticket' then
    update public.explore_support_tickets
    set status = source_status,
        admin_reply = coalesce(nullif(new.resolution_note, ''), admin_reply)
    where id = new.resource_id;
  elsif new.resource_type = 'transport_support' then
    update public.transport_support_tickets
    set status = source_status,
        admin_reply = coalesce(nullif(new.resolution_note, ''), admin_reply)
    where id = new.resource_id;
  elsif new.resource_type = 'user_care_feedback' and to_regclass('public.user_care_feedback') is not null then
    update public.user_care_feedback
    set status = case
          when new.status in ('resolved','actioned') then 'fixed'
          when new.status = 'closed' then 'closed'
          else 'under_review'
        end,
        admin_reply = coalesce(nullif(new.resolution_note, ''), admin_reply),
        admin_seen = true
    where id = new.resource_id;
  end if;

  return new;
end;
$$;

drop trigger if exists admin_case_sync_support_source on public.admin_cases;
create trigger admin_case_sync_support_source
after update of status, resolution_note on public.admin_cases
for each row execute function public.admin_sync_case_to_support_source();

-- Chief Admin audit view with actor identity. Email is exposed only to admins
-- who already hold the immutable audit permission.
create or replace function public.admin_get_audit_log(result_limit integer default 250)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  actor_display_name text,
  actor_role_keys text[],
  action_key text,
  sector text,
  resource_type text,
  resource_id uuid,
  case_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not public.admin_has_permission('audit.view') then raise exception 'Not authorized'; end if;
  return query
  select log.id, log.actor_user_id, users.email::text,
    coalesce(users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1), 'KunThai system')::text,
    log.actor_role_keys, log.action_key, log.sector, log.resource_type, log.resource_id,
    log.case_id, log.reason, log.before_state, log.after_state, log.metadata, log.created_at
  from public.admin_audit_logs log
  left join auth.users users on users.id = log.actor_user_id
  order by log.created_at desc
  limit greatest(1, least(coalesce(result_limit, 250), 1000));
end;
$$;

-- Tighten team governance: no empty reasons, no unknown scopes, peers cannot
-- appoint/remove peers, and the final Super Admin cannot be revoked.
create or replace function public.admin_grant_access(
  target_email text,
  target_role_key text,
  target_sectors text[] default array['all']::text[],
  target_regions text[] default array['all']::text[],
  target_authority smallint default 2,
  reason text default ''
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
  if nullif(btrim(reason), '') is null then raise exception 'An assignment reason is required'; end if;
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
  if target_role.rank >= caller_rank and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can grant an equal or higher admin role';
  end if;
  if target_role_key in ('super_admin','chief_admin') and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can appoint this role';
  end if;
  if target_authority < 1 or target_authority > coalesce(caller_authority, 1) then
    raise exception 'Authority level must be between 1 and your own authority level';
  end if;

  select id into target_user_id from auth.users where lower(email) = lower(btrim(target_email)) limit 1;
  if target_user_id is null then raise exception 'No KunThai account uses this email'; end if;

  select current_assignment.* into previous_assignment
  from public.admin_assignments current_assignment
  where current_assignment.user_id = target_user_id and current_assignment.role_id = target_role.id;

  insert into public.admin_assignments (
    user_id, role_id, sector_scopes, region_scopes, authority_level, status, granted_by, grant_reason
  ) values (
    target_user_id, target_role.id,
    coalesce(nullif(target_sectors, '{}'::text[]), array['all']::text[]),
    coalesce(nullif(target_regions, '{}'::text[]), array['all']::text[]),
    target_authority, 'active', auth.uid(), btrim(reason)
  )
  on conflict (user_id, role_id) do update
  set sector_scopes = excluded.sector_scopes,
      region_scopes = excluded.region_scopes,
      authority_level = excluded.authority_level,
      status = 'active',
      granted_by = auth.uid(),
      grant_reason = excluded.grant_reason,
      expires_at = null,
      updated_at = now()
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

create or replace function public.admin_revoke_access(assignment_uuid uuid, reason text)
returns public.admin_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_assignment public.admin_assignments;
  updated_assignment public.admin_assignments;
  target_role public.admin_roles;
  caller_rank smallint;
begin
  if not public.admin_has_permission('team.manage') then raise exception 'Not authorized'; end if;
  if nullif(btrim(reason), '') is null then raise exception 'A revocation reason is required'; end if;

  select assignment.* into previous_assignment
  from public.admin_assignments assignment
  where assignment.id = assignment_uuid
  for update;
  if previous_assignment.id is null then raise exception 'Assignment not found'; end if;
  if previous_assignment.user_id = auth.uid() then raise exception 'You cannot revoke your own active assignment'; end if;

  select role.* into target_role from public.admin_roles role where role.id = previous_assignment.role_id;
  select max(role.rank) into caller_rank
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  where assignment.user_id = auth.uid() and public.admin_assignment_is_active(assignment);

  if target_role.rank >= caller_rank and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can revoke an equal or higher admin role';
  end if;
  if target_role.role_key = 'super_admin'
     and (select count(*) from public.admin_assignments assignment
          join public.admin_roles role on role.id = assignment.role_id
          where role.role_key = 'super_admin' and public.admin_assignment_is_active(assignment)) <= 1 then
    raise exception 'The final Super Admin assignment cannot be revoked';
  end if;

  update public.admin_assignments
  set status = 'revoked', updated_at = now()
  where id = assignment_uuid
  returning * into updated_assignment;

  perform public.admin_log_action('team.access_revoked', 'platform', 'admin_assignment', assignment_uuid, null, btrim(reason), to_jsonb(previous_assignment), to_jsonb(updated_assignment));
  return updated_assignment;
end;
$$;

revoke all on function public.set_support_ticket_updated_at() from public, anon, authenticated;
revoke all on function public.admin_mark_activity_notifications_read(uuid[]) from public, anon;
revoke all on function public.admin_notify_chiefs_of_audit() from public, anon, authenticated;
revoke all on function public.admin_notify_case_intake() from public, anon, authenticated;
revoke all on function public.admin_sync_case_to_support_source() from public, anon, authenticated;
revoke all on function public.admin_get_audit_log(integer) from public, anon;
grant execute on function public.admin_mark_activity_notifications_read(uuid[]) to authenticated;
grant execute on function public.admin_get_audit_log(integer) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_activity_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_activity_notifications;
  end if;
end;
$$;
