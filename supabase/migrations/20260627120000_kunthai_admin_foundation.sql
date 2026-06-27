-- KunThai administration foundation.
-- Provides scoped RBAC, Chief Admin access, cases, audit history, campaigns,
-- feature controls, source intake, and guards for admin-owned fields.

create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  role_key text not null unique,
  name text not null,
  description text not null default '',
  rank smallint not null default 10 check (rank between 1 and 100),
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_permissions (
  permission_key text primary key,
  name text not null,
  description text not null default '',
  permission_group text not null default 'platform',
  created_at timestamptz not null default now()
);

create table if not exists public.admin_role_permissions (
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  permission_key text not null references public.admin_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

create table if not exists public.admin_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete restrict,
  sector_scopes text[] not null default array['all']::text[],
  region_scopes text[] not null default array['all']::text[],
  authority_level smallint not null default 2 check (authority_level between 1 and 5),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  grant_reason text not null default '',
  expires_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_id)
);

insert into public.admin_roles (role_key, name, description, rank)
values
  ('super_admin', 'Super Admin', 'Platform owner with security and Chief Admin authority.', 100),
  ('chief_admin', 'Chief Admin', 'Full operational access across every KunThai sector.', 90),
  ('operations_lead', 'Operations Lead', 'Cross-sector operations, queues, and escalations.', 75),
  ('explore_manager', 'Explore Manager', 'Explore content, community, and safety operations.', 60),
  ('marketplace_manager', 'UrMall Manager', 'Seller, product, order, and commerce operations.', 60),
  ('transport_manager', 'Transport Manager', 'Operator, company, fleet, trip, and Area View operations.', 60),
  ('reports_officer', 'Reports and Safety Officer', 'Reports, moderation, incidents, and account safety.', 40),
  ('verification_officer', 'Verification Officer', 'Identity, seller, company, operator, and fleet verification.', 40),
  ('support_officer', 'Support Officer', 'Support tickets, complaints, and disputes.', 35),
  ('finance_officer', 'Finance Officer', 'Payout, refund, transaction, and reconciliation operations.', 45),
  ('notification_officer', 'Notification Officer', 'Campaign drafting, targeting, and delivery operations.', 35),
  ('risk_officer', 'Risk and Fraud Officer', 'Fraud, abuse patterns, and high-risk investigations.', 50),
  ('analyst', 'Analyst', 'Read-only operational analytics.', 20),
  ('auditor', 'Auditor', 'Read-only cases and immutable audit history.', 25),
  ('technical_admin', 'Technical Admin', 'Feature controls, integration health, and technical operations.', 55)
on conflict (role_key) do update
set name = excluded.name,
    description = excluded.description,
    rank = excluded.rank,
    updated_at = now();

insert into public.admin_permissions (permission_key, name, permission_group)
values
  ('admin.access', 'Access admin workspace', 'platform'),
  ('dashboard.view', 'View command center', 'platform'),
  ('cases.view', 'View cases', 'cases'),
  ('cases.manage', 'Assign and progress cases', 'cases'),
  ('cases.approve', 'Approve sensitive decisions', 'cases'),
  ('users.view', 'View user directory', 'users'),
  ('users.manage', 'Restrict or restore users', 'users'),
  ('explore.view', 'View Explore operations', 'explore'),
  ('explore.moderate', 'Moderate Explore content', 'explore'),
  ('marketplace.view', 'View UrMall operations', 'marketplace'),
  ('marketplace.verify', 'Verify UrMall sellers', 'marketplace'),
  ('marketplace.moderate', 'Moderate UrMall listings', 'marketplace'),
  ('transport.view', 'View Transport operations', 'transport'),
  ('transport.verify', 'Verify operators, companies, and fleets', 'transport'),
  ('transport.safety', 'Manage trips, incidents, and Area View safety', 'transport'),
  ('verification.view', 'View verification queues', 'verification'),
  ('verification.manage', 'Decide verification cases', 'verification'),
  ('reports.view', 'View reports and incidents', 'reports'),
  ('reports.manage', 'Decide reports and safety cases', 'reports'),
  ('support.view', 'View support and disputes', 'support'),
  ('support.manage', 'Resolve support and disputes', 'support'),
  ('finance.view', 'View financial operations', 'finance'),
  ('finance.manage', 'Approve financial operations', 'finance'),
  ('notifications.view', 'View notification campaigns', 'notifications'),
  ('notifications.manage', 'Create notification campaigns', 'notifications'),
  ('notifications.approve', 'Approve and publish notification campaigns', 'notifications'),
  ('analytics.view', 'View operational analytics', 'analytics'),
  ('team.view', 'View admin team', 'team'),
  ('team.manage', 'Manage admin access', 'team'),
  ('audit.view', 'View admin audit history', 'audit'),
  ('settings.view', 'View platform settings', 'settings'),
  ('settings.manage', 'Manage platform settings', 'settings')
on conflict (permission_key) do update
set name = excluded.name,
    permission_group = excluded.permission_group;

-- Full-access roles are deliberately explicit so the effective permission list
-- remains inspectable in the admin UI and audit exports.
insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.permission_key
from public.admin_roles role
cross join public.admin_permissions permission
where role.role_key in ('super_admin', 'chief_admin')
on conflict do nothing;

with role_permissions(role_key, permissions) as (
  values
    ('operations_lead', array['admin.access','dashboard.view','cases.view','cases.manage','cases.approve','users.view','users.manage','explore.view','explore.moderate','marketplace.view','marketplace.verify','marketplace.moderate','transport.view','transport.verify','transport.safety','verification.view','verification.manage','reports.view','reports.manage','support.view','support.manage','finance.view','notifications.view','notifications.manage','analytics.view','team.view','audit.view','settings.view']),
    ('explore_manager', array['admin.access','dashboard.view','cases.view','cases.manage','cases.approve','users.view','users.manage','explore.view','explore.moderate','verification.view','verification.manage','reports.view','reports.manage','support.view','support.manage','notifications.view','analytics.view','audit.view']),
    ('marketplace_manager', array['admin.access','dashboard.view','cases.view','cases.manage','cases.approve','users.view','users.manage','marketplace.view','marketplace.verify','marketplace.moderate','verification.view','verification.manage','reports.view','reports.manage','support.view','support.manage','finance.view','notifications.view','analytics.view','audit.view']),
    ('transport_manager', array['admin.access','dashboard.view','cases.view','cases.manage','cases.approve','users.view','users.manage','transport.view','transport.verify','transport.safety','verification.view','verification.manage','reports.view','reports.manage','support.view','support.manage','finance.view','notifications.view','analytics.view','audit.view']),
    ('reports_officer', array['admin.access','dashboard.view','cases.view','cases.manage','users.view','explore.view','marketplace.view','transport.view','reports.view','reports.manage','support.view','audit.view']),
    ('verification_officer', array['admin.access','dashboard.view','cases.view','cases.manage','users.view','marketplace.view','marketplace.verify','transport.view','transport.verify','verification.view','verification.manage','audit.view']),
    ('support_officer', array['admin.access','dashboard.view','cases.view','cases.manage','users.view','support.view','support.manage','reports.view','audit.view']),
    ('finance_officer', array['admin.access','dashboard.view','cases.view','cases.manage','users.view','marketplace.view','transport.view','finance.view','finance.manage','audit.view']),
    ('notification_officer', array['admin.access','dashboard.view','notifications.view','notifications.manage','analytics.view','audit.view']),
    ('risk_officer', array['admin.access','dashboard.view','cases.view','cases.manage','cases.approve','users.view','users.manage','explore.view','explore.moderate','marketplace.view','marketplace.moderate','transport.view','transport.safety','reports.view','reports.manage','finance.view','analytics.view','audit.view']),
    ('analyst', array['admin.access','dashboard.view','cases.view','users.view','explore.view','marketplace.view','transport.view','verification.view','reports.view','support.view','finance.view','notifications.view','analytics.view']),
    ('auditor', array['admin.access','dashboard.view','cases.view','users.view','audit.view','analytics.view']),
    ('technical_admin', array['admin.access','dashboard.view','analytics.view','audit.view','settings.view','settings.manage'])
)
insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission_key
from role_permissions mapping
join public.admin_roles role on role.role_key = mapping.role_key
cross join lateral unnest(mapping.permissions) permission_key
on conflict do nothing;

create or replace function public.admin_assignment_is_active(assignment public.admin_assignments)
returns boolean
language sql
stable
as $$
  select assignment.status = 'active'
    and (assignment.expires_at is null or assignment.expires_at > now());
$$;

create or replace function public.is_kunthai_admin(user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_assignments assignment
    where assignment.user_id = user_uuid
      and public.admin_assignment_is_active(assignment)
  );
$$;

create or replace function public.admin_has_role(role_keys text[], user_uuid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_assignments assignment
    join public.admin_roles role on role.id = assignment.role_id
    where assignment.user_id = user_uuid
      and public.admin_assignment_is_active(assignment)
      and role.role_key = any(role_keys)
  );
$$;

create or replace function public.admin_has_permission(
  requested_permission text,
  requested_sector text default null,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
    where assignment.user_id = user_uuid
      and public.admin_assignment_is_active(assignment)
      and role_permission.permission_key = requested_permission
      and (
        requested_sector is null
        or 'all' = any(assignment.sector_scopes)
        or requested_sector = any(assignment.sector_scopes)
      )
  );
$$;

create or replace function public.admin_authority_level(
  requested_sector text default null,
  user_uuid uuid default auth.uid()
)
returns smallint
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(max(assignment.authority_level), 0)::smallint
  from public.admin_assignments assignment
  where assignment.user_id = user_uuid
    and public.admin_assignment_is_active(assignment)
    and (
      requested_sector is null
      or 'all' = any(assignment.sector_scopes)
      or requested_sector = any(assignment.sector_scopes)
    );
$$;

create sequence if not exists public.admin_case_number_seq start 1000;

create table if not exists public.admin_cases (
  id uuid primary key default gen_random_uuid(),
  case_number bigint not null unique default nextval('public.admin_case_number_seq'),
  sector text not null check (sector in ('platform', 'explore', 'marketplace', 'transport')),
  queue text not null,
  case_type text not null,
  resource_type text not null,
  resource_id uuid,
  title text not null,
  description text not null default '',
  status text not null default 'new' check (status in ('new','triaged','assigned','in_review','waiting_information','action_proposed','approval_required','actioned','appeal_window','resolved','closed','reopened')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent','critical')),
  subject_user_id uuid references auth.users(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  sla_due_at timestamptz,
  resolution_code text,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  unique (resource_type, resource_id)
);

create table if not exists public.admin_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.admin_cases(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.admin_cases(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (length(btrim(body)) > 0),
  visibility text not null default 'internal' check (visibility in ('internal','user_visible','approval')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.admin_cases(id) on delete cascade,
  action_type text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  request_note text not null default '',
  review_note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role_keys text[] not null default '{}'::text[],
  action_key text not null,
  sector text,
  resource_type text,
  resource_id uuid,
  case_id uuid references public.admin_cases(id) on delete set null,
  reason text not null default '',
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  sector text not null default 'platform' check (sector in ('platform','explore','marketplace','transport')),
  audience_type text not null default 'all' check (audience_type in ('all','sector_users','specific_users','region','account_type')),
  audience_filter jsonb not null default '{}'::jsonb,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','scheduled','sending','completed','failed','cancelled')),
  scheduled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  sent_at timestamptz,
  delivery_count integer not null default 0,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.admin_notification_campaigns(id) on delete set null,
  sector text not null default 'platform',
  notification_type text not null default 'admin_message',
  title text not null,
  body text not null,
  priority text not null default 'normal',
  status text not null default 'unread' check (status in ('unread','read','archived')),
  action_target text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.admin_feature_flags (
  flag_key text primary key,
  name text not null,
  description text not null default '',
  sector text not null default 'platform',
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','warned','restricted','suspended','banned')),
  reason text not null default '',
  restricted_sectors text[] not null default array['all']::text[],
  expires_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_feature_flags (flag_key, name, description, sector, enabled)
values
  ('content_moderation', 'Automated content moderation', 'Automated Explore media and text safety checks.', 'explore', true),
  ('seller_onboarding', 'Seller onboarding', 'Allow new UrMall business registrations.', 'marketplace', true),
  ('transport_onboarding', 'Transport onboarding', 'Allow new operator and company registrations.', 'transport', true),
  ('notification_broadcasts', 'Notification broadcasts', 'Allow approved administrators to schedule campaigns.', 'platform', true),
  ('financial_actions', 'Financial actions', 'Allow finance workflows after the payment provider is connected.', 'platform', false)
on conflict (flag_key) do nothing;

create index if not exists admin_assignments_user_status_idx on public.admin_assignments(user_id, status);
create index if not exists admin_cases_queue_status_idx on public.admin_cases(queue, status, priority, created_at desc);
create index if not exists admin_cases_sector_status_idx on public.admin_cases(sector, status, created_at desc);
create index if not exists admin_cases_assignee_idx on public.admin_cases(assignee_user_id, status, updated_at desc);
create index if not exists admin_case_events_case_idx on public.admin_case_events(case_id, created_at desc);
create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_user_id, created_at desc);
create index if not exists admin_audit_logs_resource_idx on public.admin_audit_logs(resource_type, resource_id, created_at desc);
create index if not exists platform_notifications_user_idx on public.platform_notifications(user_id, status, created_at desc);
create unique index if not exists platform_notifications_campaign_user_idx
on public.platform_notifications(campaign_id, user_id)
where campaign_id is not null;

alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_assignments enable row level security;
alter table public.admin_cases enable row level security;
alter table public.admin_case_events enable row level security;
alter table public.admin_case_notes enable row level security;
alter table public.admin_approvals enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_notification_campaigns enable row level security;
alter table public.platform_notifications enable row level security;
alter table public.admin_feature_flags enable row level security;
alter table public.platform_account_controls enable row level security;

drop policy if exists "admins read role catalog" on public.admin_roles;
drop policy if exists "admins read permission catalog" on public.admin_permissions;
drop policy if exists "admins read role permissions" on public.admin_role_permissions;
drop policy if exists "admins read scoped assignments" on public.admin_assignments;
drop policy if exists "team managers create assignments" on public.admin_assignments;
drop policy if exists "team managers update assignments" on public.admin_assignments;
drop policy if exists "admins read scoped cases" on public.admin_cases;
drop policy if exists "admins read scoped case events" on public.admin_case_events;
drop policy if exists "admins read scoped case notes" on public.admin_case_notes;
drop policy if exists "case managers create notes" on public.admin_case_notes;
drop policy if exists "admins read scoped approvals" on public.admin_approvals;
drop policy if exists "admins read audit history" on public.admin_audit_logs;
drop policy if exists "notification officers read campaigns" on public.admin_notification_campaigns;
drop policy if exists "users read own platform notifications" on public.platform_notifications;
drop policy if exists "users update own platform notifications" on public.platform_notifications;
drop policy if exists "admins read feature flags" on public.admin_feature_flags;
drop policy if exists "users read own account control" on public.platform_account_controls;
drop policy if exists "admins read account controls" on public.platform_account_controls;

create policy "admins read role catalog" on public.admin_roles for select to authenticated
using (public.is_kunthai_admin());
create policy "admins read permission catalog" on public.admin_permissions for select to authenticated
using (public.is_kunthai_admin());
create policy "admins read role permissions" on public.admin_role_permissions for select to authenticated
using (public.is_kunthai_admin());
create policy "admins read scoped assignments" on public.admin_assignments for select to authenticated
using (user_id = auth.uid() or public.admin_has_permission('team.view'));
create policy "team managers create assignments" on public.admin_assignments for insert to authenticated
with check (public.admin_has_permission('team.manage'));
create policy "team managers update assignments" on public.admin_assignments for update to authenticated
using (public.admin_has_permission('team.manage'))
with check (public.admin_has_permission('team.manage'));
create policy "admins read scoped cases" on public.admin_cases for select to authenticated
using (public.admin_has_permission('cases.view', sector));
create policy "admins read scoped case events" on public.admin_case_events for select to authenticated
using (exists (select 1 from public.admin_cases c where c.id = case_id and public.admin_has_permission('cases.view', c.sector)));
create policy "admins read scoped case notes" on public.admin_case_notes for select to authenticated
using (exists (select 1 from public.admin_cases c where c.id = case_id and public.admin_has_permission('cases.view', c.sector)));
create policy "case managers create notes" on public.admin_case_notes for insert to authenticated
with check (author_user_id = auth.uid() and exists (select 1 from public.admin_cases c where c.id = case_id and public.admin_has_permission('cases.manage', c.sector)));
create policy "admins read scoped approvals" on public.admin_approvals for select to authenticated
using (case_id is null or exists (select 1 from public.admin_cases c where c.id = case_id and public.admin_has_permission('cases.view', c.sector)));
create policy "admins read audit history" on public.admin_audit_logs for select to authenticated
using (public.admin_has_permission('audit.view'));
create policy "notification officers read campaigns" on public.admin_notification_campaigns for select to authenticated
using (public.admin_has_permission('notifications.view', sector));
create policy "users read own platform notifications" on public.platform_notifications for select to authenticated
using (user_id = auth.uid());
create policy "users update own platform notifications" on public.platform_notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "admins read feature flags" on public.admin_feature_flags for select to authenticated
using (public.admin_has_permission('settings.view'));
create policy "users read own account control" on public.platform_account_controls for select to authenticated
using (user_id = auth.uid());
create policy "admins read account controls" on public.platform_account_controls for select to authenticated
using (public.admin_has_permission('users.view'));

create or replace function public.admin_prevent_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Admin history is immutable';
end;
$$;

drop trigger if exists admin_audit_logs_immutable on public.admin_audit_logs;
create trigger admin_audit_logs_immutable
before update or delete on public.admin_audit_logs
for each row execute function public.admin_prevent_history_mutation();

drop trigger if exists admin_case_events_immutable on public.admin_case_events;
create trigger admin_case_events_immutable
before update or delete on public.admin_case_events
for each row execute function public.admin_prevent_history_mutation();

create or replace function public.admin_log_action(
  action_key text,
  sector_key text default null,
  resource_kind text default null,
  resource_uuid uuid default null,
  case_uuid uuid default null,
  action_reason text default '',
  previous_state jsonb default null,
  next_state jsonb default null,
  action_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  log_id uuid;
  roles text[];
begin
  select coalesce(array_agg(distinct role.role_key), '{}'::text[])
  into roles
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  where assignment.user_id = auth.uid()
    and public.admin_assignment_is_active(assignment);

  insert into public.admin_audit_logs (
    actor_user_id, actor_role_keys, action_key, sector, resource_type,
    resource_id, case_id, reason, before_state, after_state, metadata
  ) values (
    auth.uid(), roles, action_key, sector_key, resource_kind,
    resource_uuid, case_uuid, coalesce(action_reason, ''), previous_state, next_state,
    coalesce(action_metadata, '{}'::jsonb)
  ) returning id into log_id;

  return log_id;
end;
$$;

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
    where assignment.user_id = auth.uid()
      and public.admin_assignment_is_active(assignment)
  ), effective_permissions as (
    select distinct role_permission.permission_key
    from active_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
  )
  select jsonb_build_object(
    'isAdmin', exists(select 1 from active_assignments),
    'roles', coalesce((select jsonb_agg(jsonb_build_object(
      'assignmentId', id,
      'key', role_key,
      'name', role_name,
      'rank', rank,
      'sectors', sector_scopes,
      'regions', region_scopes,
      'authorityLevel', authority_level
    ) order by rank desc) from active_assignments), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(permission_key order by permission_key) from effective_permissions), '[]'::jsonb),
    'sectors', coalesce((select to_jsonb(array_agg(distinct sector)) from active_assignments, lateral unnest(sector_scopes) sector), '[]'::jsonb),
    'authorityLevel', coalesce((select max(authority_level) from active_assignments), 0),
    'requiresMfa', true
  );
$$;

create or replace function public.admin_dashboard_summary()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with visible_cases as (
    select * from public.admin_cases c
    where public.admin_has_permission('cases.view', c.sector)
  )
  select jsonb_build_object(
    'openCases', count(*) filter (where status not in ('resolved','closed')),
    'urgentCases', count(*) filter (where priority in ('urgent','critical') and status not in ('resolved','closed')),
    'unassignedCases', count(*) filter (where assignee_user_id is null and status not in ('resolved','closed')),
    'overdueCases', count(*) filter (where sla_due_at < now() and status not in ('resolved','closed')),
    'resolvedToday', count(*) filter (where resolved_at >= date_trunc('day', now())),
    'bySector', jsonb_build_object(
      'explore', count(*) filter (where sector = 'explore' and status not in ('resolved','closed')),
      'marketplace', count(*) filter (where sector = 'marketplace' and status not in ('resolved','closed')),
      'transport', count(*) filter (where sector = 'transport' and status not in ('resolved','closed'))
    ),
    'byQueue', coalesce((
      select jsonb_object_agg(queue, total)
      from (select queue, count(*) total from visible_cases where status not in ('resolved','closed') group by queue) grouped
    ), '{}'::jsonb)
  )
  from visible_cases;
$$;

create or replace function public.admin_claim_case(case_uuid uuid)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_case public.admin_cases;
  updated_case public.admin_cases;
begin
  select * into previous_case from public.admin_cases where id = case_uuid for update;
  if previous_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', previous_case.sector) then raise exception 'Not authorized'; end if;

  update public.admin_cases
  set assignee_user_id = auth.uid(),
      assigned_at = now(),
      status = case when status in ('new','triaged','reopened') then 'assigned' else status end,
      updated_at = now()
  where id = case_uuid
  returning * into updated_case;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary)
  values (case_uuid, auth.uid(), 'claimed', previous_case.status, updated_case.status, 'Case claimed');
  perform public.admin_log_action('case.claimed', updated_case.sector, updated_case.resource_type, updated_case.resource_id, case_uuid, '', to_jsonb(previous_case), to_jsonb(updated_case));
  return updated_case;
end;
$$;

create or replace function public.admin_transition_case(
  case_uuid uuid,
  next_status text,
  transition_note text default ''
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_case public.admin_cases;
  updated_case public.admin_cases;
begin
  select * into previous_case from public.admin_cases where id = case_uuid for update;
  if previous_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', previous_case.sector) then raise exception 'Not authorized'; end if;
  if next_status not in ('new','triaged','assigned','in_review','waiting_information','action_proposed','approval_required','actioned','appeal_window','resolved','closed','reopened') then
    raise exception 'Invalid case status';
  end if;

  update public.admin_cases
  set status = next_status,
      updated_at = now(),
      resolved_at = case when next_status = 'resolved' then now() else resolved_at end,
      closed_at = case when next_status = 'closed' then now() else closed_at end,
      resolution_note = case when next_status in ('resolved','closed') then nullif(btrim(transition_note), '') else resolution_note end
  where id = case_uuid
  returning * into updated_case;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary)
  values (case_uuid, auth.uid(), 'status_changed', previous_case.status, next_status, coalesce(nullif(btrim(transition_note), ''), 'Case status updated'));
  perform public.admin_log_action('case.status_changed', updated_case.sector, updated_case.resource_type, updated_case.resource_id, case_uuid, transition_note, to_jsonb(previous_case), to_jsonb(updated_case));
  return updated_case;
end;
$$;

create or replace function public.admin_add_case_note(
  case_uuid uuid,
  note_body text,
  note_visibility text default 'internal'
)
returns public.admin_case_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  target_case public.admin_cases;
  created_note public.admin_case_notes;
begin
  select * into target_case from public.admin_cases where id = case_uuid;
  if target_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', target_case.sector) then raise exception 'Not authorized'; end if;
  if note_visibility not in ('internal','user_visible','approval') then raise exception 'Invalid note visibility'; end if;

  insert into public.admin_case_notes(case_id, author_user_id, body, visibility)
  values (case_uuid, auth.uid(), btrim(note_body), note_visibility)
  returning * into created_note;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, summary)
  values (case_uuid, auth.uid(), 'note_added', 'Case note added');
  perform public.admin_log_action('case.note_added', target_case.sector, target_case.resource_type, target_case.resource_id, case_uuid);
  return created_note;
end;
$$;

create or replace function public.admin_apply_case_decision(
  case_uuid uuid,
  decision_key text,
  decision_reason text
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  target_case public.admin_cases;
  updated_case public.admin_cases;
  normalized_decision text := lower(btrim(decision_key));
  normalized_reason text := btrim(decision_reason);
begin
  select * into target_case from public.admin_cases where id = case_uuid for update;
  if target_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', target_case.sector) then raise exception 'Not authorized'; end if;
  if normalized_reason = '' then raise exception 'A decision reason is required'; end if;
  if normalized_decision not in ('approve','reject','dismiss','remove','restrict','suspend','resolve','request_information') then
    raise exception 'Unsupported decision';
  end if;
  if normalized_decision in ('approve','reject','remove','restrict','suspend')
    and public.admin_authority_level(target_case.sector) < 3 then
    raise exception 'This decision requires authority level 3';
  end if;

  if normalized_decision in ('remove','suspend')
    and not public.admin_has_role(array['super_admin'])
    and not exists (
      select 1 from public.admin_approvals approval
      where approval.case_id = case_uuid
        and approval.action_type = 'case_decision:' || normalized_decision
        and approval.status = 'approved'
    )
  then
    insert into public.admin_approvals(case_id, action_type, requested_by, request_note, payload)
    select case_uuid, 'case_decision:' || normalized_decision, auth.uid(), normalized_reason,
      jsonb_build_object('decision', normalized_decision, 'reason', normalized_reason)
    where not exists (
      select 1 from public.admin_approvals approval
      where approval.case_id = case_uuid
        and approval.action_type = 'case_decision:' || normalized_decision
        and approval.status = 'pending'
    );

    update public.admin_cases set status = 'approval_required', updated_at = now() where id = case_uuid returning * into updated_case;
    insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
    values (case_uuid, auth.uid(), 'approval_requested', target_case.status, 'approval_required', normalized_reason, jsonb_build_object('decision', normalized_decision));
    perform public.admin_log_action('case.approval_requested', target_case.sector, target_case.resource_type, target_case.resource_id, case_uuid, normalized_reason, to_jsonb(target_case), to_jsonb(updated_case), jsonb_build_object('decision', normalized_decision));
    return updated_case;
  end if;

  if target_case.resource_type = 'explore_post_report' and to_regclass('public.explore_post_reports') is not null then
    update public.explore_post_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
    if normalized_decision in ('remove','restrict') and to_regclass('public.explore_posts') is not null then
      update public.explore_posts post set moderation_status = 'blocked'
      from public.explore_post_reports report where report.id = target_case.resource_id and post.id = report.post_id;
    end if;
  elsif target_case.resource_type = 'explore_comment_report' and to_regclass('public.explore_comment_reports') is not null then
    update public.explore_comment_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
  elsif target_case.resource_type = 'explore_profile_report' and to_regclass('public.explore_profile_reports') is not null then
    update public.explore_profile_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
  elsif target_case.resource_type = 'marketplace_verification' and to_regclass('public.marketplace_seller_verification_requests') is not null then
    update public.marketplace_seller_verification_requests
    set status = case when normalized_decision = 'approve' then 'approved' when normalized_decision = 'reject' then 'rejected' else 'pending' end,
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = target_case.resource_id;
    if normalized_decision in ('approve','reject') and to_regclass('public.marketplace_businesses') is not null then
      update public.marketplace_businesses business
      set verification_status = case when normalized_decision = 'approve' then 'verified' else 'rejected' end, updated_at = now()
      from public.marketplace_seller_verification_requests request
      where request.id = target_case.resource_id and business.id = request.business_id;
    end if;
  elsif target_case.resource_type = 'marketplace_case' and to_regclass('public.marketplace_seller_cases') is not null then
    update public.marketplace_seller_cases set status = case when normalized_decision = 'request_information' then 'in_review' else 'resolved' end,
      resolved_at = case when normalized_decision = 'request_information' then null else now() end, updated_at = now()
    where id = target_case.resource_id;
  elsif target_case.resource_type = 'transport_support' and to_regclass('public.transport_support_tickets') is not null then
    update public.transport_support_tickets set status = case when normalized_decision = 'request_information' then 'in_review' else 'resolved' end, updated_at = now()
    where id = target_case.resource_id;
  elsif target_case.resource_type = 'transport_operator_verification' and to_regclass('public.transport_operators') is not null then
    update public.transport_operators
    set verification_status = case when normalized_decision = 'approve' then 'verified'::public.transport_verification_status else 'not_verified'::public.transport_verification_status end,
        account_status = case when normalized_decision = 'approve' then 'approved' else 'rejected' end,
        verification_note = normalized_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = target_case.resource_id and normalized_decision in ('approve','reject');
  elsif target_case.resource_type = 'transport_company_verification' and to_regclass('public.transport_companies') is not null then
    update public.transport_companies
    set verification_status = case when normalized_decision = 'approve' then 'verified' else 'rejected' end,
        account_status = case when normalized_decision = 'approve' then 'approved' else 'rejected' end,
        admin_note = normalized_reason, rejection_reason = case when normalized_decision = 'reject' then normalized_reason else null end,
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = target_case.resource_id and normalized_decision in ('approve','reject');
  elsif target_case.resource_type = 'transport_fleet_verification' and to_regclass('public.transport_company_fleets') is not null then
    update public.transport_company_fleets
    set verification_status = case when normalized_decision = 'approve' then 'verified' else 'rejected' end, updated_at = now()
    where id = target_case.resource_id and normalized_decision in ('approve','reject');
  elsif target_case.resource_type = 'area_report' and to_regclass('public.nearby_area_reports') is not null then
    update public.nearby_area_reports
    set status = case when normalized_decision = 'approve' then 'verified' when normalized_decision = 'dismiss' then 'rejected' else 'cleared' end,
        updated_at = now()
    where id = target_case.resource_id;
  end if;

  update public.admin_cases
  set status = case when normalized_decision = 'request_information' then 'waiting_information' else 'resolved' end,
      resolution_code = normalized_decision,
      resolution_note = normalized_reason,
      resolved_at = case when normalized_decision = 'request_information' then null else now() end,
      updated_at = now()
  where id = case_uuid
  returning * into updated_case;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
  values (case_uuid, auth.uid(), 'decision_applied', target_case.status, updated_case.status, normalized_reason, jsonb_build_object('decision', normalized_decision));
  perform public.admin_log_action('case.decision_applied', target_case.sector, target_case.resource_type, target_case.resource_id, case_uuid, normalized_reason, to_jsonb(target_case), to_jsonb(updated_case), jsonb_build_object('decision', normalized_decision));
  return updated_case;
end;
$$;

create or replace function public.admin_review_approval(
  approval_uuid uuid,
  approve_action boolean,
  review_reason text
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  approval public.admin_approvals;
  target_case public.admin_cases;
  decision_key text;
  decision_reason text;
begin
  select * into approval from public.admin_approvals where id = approval_uuid for update;
  if approval.id is null or approval.status <> 'pending' then raise exception 'Pending approval not found'; end if;
  select * into target_case from public.admin_cases where id = approval.case_id for update;
  if target_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.approve', target_case.sector) or public.admin_authority_level(target_case.sector) < 4 then
    raise exception 'This approval requires authority level 4';
  end if;
  if approval.requested_by = auth.uid() then raise exception 'A different administrator must review this request'; end if;
  if btrim(coalesce(review_reason, '')) = '' then raise exception 'A review reason is required'; end if;

  update public.admin_approvals
  set status = case when approve_action then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(review_reason)
  where id = approval_uuid;

  if not approve_action then
    update public.admin_cases set status = 'in_review', updated_at = now() where id = target_case.id returning * into target_case;
    insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary)
    values (target_case.id, auth.uid(), 'approval_rejected', 'approval_required', 'in_review', btrim(review_reason));
    perform public.admin_log_action('case.approval_rejected', target_case.sector, target_case.resource_type, target_case.resource_id, target_case.id, review_reason);
    return target_case;
  end if;

  decision_key := approval.payload ->> 'decision';
  decision_reason := coalesce(approval.payload ->> 'reason', approval.request_note);
  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary)
  values (target_case.id, auth.uid(), 'approval_granted', 'approval_required', 'action_proposed', btrim(review_reason));
  perform public.admin_log_action('case.approval_granted', target_case.sector, target_case.resource_type, target_case.resource_id, target_case.id, review_reason);
  return public.admin_apply_case_decision(target_case.id, decision_key, decision_reason);
end;
$$;

create or replace function public.admin_create_campaign(
  campaign_title text,
  campaign_body text,
  campaign_sector text default 'platform',
  campaign_audience text default 'all',
  campaign_priority text default 'normal',
  campaign_filter jsonb default '{}'::jsonb,
  campaign_schedule timestamptz default null
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  created_campaign public.admin_notification_campaigns;
begin
  if not public.admin_has_permission('notifications.manage', campaign_sector) then raise exception 'Not authorized'; end if;
  if btrim(campaign_title) = '' or btrim(campaign_body) = '' then raise exception 'Title and message are required'; end if;

  insert into public.admin_notification_campaigns (
    title, body, sector, audience_type, audience_filter, priority, status, scheduled_at, created_by
  ) values (
    btrim(campaign_title), btrim(campaign_body), campaign_sector, campaign_audience,
    coalesce(campaign_filter, '{}'::jsonb), campaign_priority,
    case when campaign_schedule is null then 'draft' else 'pending_approval' end,
    campaign_schedule, auth.uid()
  ) returning * into created_campaign;

  perform public.admin_log_action('notification.campaign_created', campaign_sector, 'notification_campaign', created_campaign.id, null, '', null, to_jsonb(created_campaign));
  return created_campaign;
end;
$$;

create or replace function public.admin_approve_campaign(campaign_uuid uuid)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_campaign public.admin_notification_campaigns;
  updated_campaign public.admin_notification_campaigns;
begin
  select * into previous_campaign from public.admin_notification_campaigns where id = campaign_uuid for update;
  if previous_campaign.id is null then raise exception 'Campaign not found'; end if;
  if not public.admin_has_permission('notifications.approve', previous_campaign.sector) then raise exception 'Not authorized'; end if;
  if previous_campaign.created_by = auth.uid() and not public.admin_has_role(array['super_admin','chief_admin']) then
    raise exception 'A different administrator must approve this campaign';
  end if;

  update public.admin_notification_campaigns
  set status = case when scheduled_at is null or scheduled_at <= now() then 'approved' else 'scheduled' end,
      approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = campaign_uuid returning * into updated_campaign;

  perform public.admin_log_action('notification.campaign_approved', updated_campaign.sector, 'notification_campaign', campaign_uuid, null, '', to_jsonb(previous_campaign), to_jsonb(updated_campaign));
  return updated_campaign;
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
    user_id, campaign_id, sector, notification_type, title, body, priority
  )
  select users.id, campaign.id, campaign.sector, 'admin_message', campaign.title, campaign.body, campaign.priority
  from auth.users users
  where
    campaign.audience_type = 'all'
    or (
      campaign.audience_type = 'specific_users'
      and (
        users.id::text in (select jsonb_array_elements_text(coalesce(campaign.audience_filter -> 'userIds', '[]'::jsonb)))
        or lower(users.email) in (select lower(value) from jsonb_array_elements_text(coalesce(campaign.audience_filter -> 'emails', '[]'::jsonb)) value)
      )
    )
    or (
      campaign.audience_type = 'account_type'
      and lower(coalesce(users.raw_user_meta_data ->> 'account_type', 'personal')) = lower(coalesce(campaign.audience_filter ->> 'accountType', 'personal'))
    )
    or (
      campaign.audience_type = 'region'
      and lower(coalesce(users.raw_user_meta_data ->> 'country', users.raw_user_meta_data ->> 'city', '')) = lower(coalesce(campaign.audience_filter ->> 'region', ''))
    )
    or (
      campaign.audience_type = 'sector_users'
      and (
        (campaign.sector = 'explore' and exists(select 1 from public.explore_profiles profile where profile.user_id = users.id))
        or (campaign.sector = 'marketplace' and exists(select 1 from public.marketplace_businesses business where business.user_id = users.id))
        or (campaign.sector = 'transport' and (
          exists(select 1 from public.transport_operators operator where operator.user_id = users.id)
          or exists(select 1 from public.transport_companies company where company.owner_user_id = users.id)
        ))
      )
    )
  on conflict (campaign_id, user_id) where campaign_id is not null do nothing;

  get diagnostics delivered = row_count;

  update public.admin_notification_campaigns
  set status = 'completed', sent_at = now(), delivery_count = delivered,
      failure_count = 0, updated_at = now()
  where id = campaign_uuid
  returning * into campaign;

  perform public.admin_log_action('notification.campaign_published', campaign.sector, 'notification_campaign', campaign.id, null, '', null, to_jsonb(campaign), jsonb_build_object('deliveryCount', delivered));
  return campaign;
exception
  when others then
    update public.admin_notification_campaigns
    set status = 'failed', failure_count = failure_count + 1, updated_at = now()
    where id = campaign_uuid;
    raise;
end;
$$;

create or replace function public.admin_publish_due_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due_campaign record;
  published integer := 0;
begin
  for due_campaign in
    select id from public.admin_notification_campaigns
    where status = 'scheduled' and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    begin
      perform public.admin_publish_campaign(due_campaign.id);
      published := published + 1;
    exception when others then
      -- admin_publish_campaign records the failed state; continue the queue.
    end;
  end loop;
  return published;
end;
$$;

create or replace function public.admin_update_feature_flag(
  target_flag_key text,
  next_enabled boolean,
  next_configuration jsonb default null,
  change_reason text default ''
)
returns public.admin_feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_flag public.admin_feature_flags;
  updated_flag public.admin_feature_flags;
begin
  if not public.admin_has_permission('settings.manage') then raise exception 'Not authorized'; end if;
  select * into previous_flag from public.admin_feature_flags where flag_key = target_flag_key for update;
  if previous_flag.flag_key is null then raise exception 'Feature flag not found'; end if;

  update public.admin_feature_flags
  set enabled = next_enabled,
      configuration = coalesce(next_configuration, configuration),
      updated_by = auth.uid(), updated_at = now()
  where flag_key = target_flag_key returning * into updated_flag;

  perform public.admin_log_action('settings.feature_flag_updated', updated_flag.sector, 'feature_flag', null, null, change_reason, to_jsonb(previous_flag), to_jsonb(updated_flag), jsonb_build_object('flagKey', target_flag_key));
  return updated_flag;
end;
$$;

create or replace function public.admin_list_team()
returns table (
  assignment_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role_key text,
  role_name text,
  sector_scopes text[],
  region_scopes text[],
  authority_level smallint,
  status text,
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
    assignment.authority_level, assignment.status, assignment.last_access_at, assignment.created_at
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  join auth.users users on users.id = assignment.user_id
  where public.admin_has_permission('team.view')
  order by role.rank desc, assignment.created_at;
$$;

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
  caller_rank smallint;
begin
  if not public.admin_has_permission('team.manage') then raise exception 'Not authorized'; end if;

  select max(role.rank) into caller_rank
  from public.admin_assignments current_assignment
  join public.admin_roles role on role.id = current_assignment.role_id
  where current_assignment.user_id = auth.uid() and public.admin_assignment_is_active(current_assignment);

  select * into target_role from public.admin_roles where role_key = target_role_key;
  if target_role.id is null then raise exception 'Unknown admin role'; end if;
  if target_role.rank >= caller_rank and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can grant this role';
  end if;
  if target_role_key = 'super_admin' and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can appoint another Super Admin';
  end if;

  select id into target_user_id from auth.users where lower(email) = lower(btrim(target_email)) limit 1;
  if target_user_id is null then raise exception 'No KunThai account uses this email'; end if;

  insert into public.admin_assignments (
    user_id, role_id, sector_scopes, region_scopes, authority_level, status, granted_by, grant_reason
  ) values (
    target_user_id, target_role.id,
    coalesce(nullif(target_sectors, '{}'::text[]), array['all']::text[]),
    coalesce(nullif(target_regions, '{}'::text[]), array['all']::text[]),
    greatest(1, least(5, target_authority)), 'active', auth.uid(), coalesce(reason, '')
  )
  on conflict (user_id, role_id) do update
  set sector_scopes = excluded.sector_scopes,
      region_scopes = excluded.region_scopes,
      authority_level = excluded.authority_level,
      status = 'active', granted_by = auth.uid(), grant_reason = excluded.grant_reason,
      expires_at = null, updated_at = now()
  returning * into assignment;

  perform public.admin_log_action('team.access_granted', 'platform', 'admin_assignment', assignment.id, null, reason, null, to_jsonb(assignment), jsonb_build_object('targetUserId', target_user_id, 'role', target_role_key));
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
  target_role_key text;
begin
  if not public.admin_has_permission('team.manage') then raise exception 'Not authorized'; end if;
  select assignment.* into previous_assignment
  from public.admin_assignments assignment
  where assignment.id = assignment_uuid
  for update;
  if previous_assignment.id is null then raise exception 'Assignment not found'; end if;
  select role.role_key into target_role_key
  from public.admin_roles role
  where role.id = previous_assignment.role_id;
  if target_role_key = 'super_admin' and not public.admin_has_role(array['super_admin']) then raise exception 'Only a Super Admin can revoke Super Admin access'; end if;
  if previous_assignment.user_id = auth.uid() then raise exception 'You cannot revoke your own active assignment'; end if;

  update public.admin_assignments set status = 'revoked', updated_at = now()
  where id = assignment_uuid returning * into updated_assignment;
  perform public.admin_log_action('team.access_revoked', 'platform', 'admin_assignment', assignment_uuid, null, reason, to_jsonb(previous_assignment), to_jsonb(updated_assignment));
  return updated_assignment;
end;
$$;

create or replace function public.admin_search_users(search_text text, result_limit integer default 25)
returns table (
  user_id uuid,
  email text,
  phone text,
  display_name text,
  username text,
  account_type text,
  account_status text,
  status_reason text,
  status_expires_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select users.id, users.email::text, users.phone::text,
    coalesce(profile.display_name, users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1))::text,
    coalesce(profile.username, users.raw_user_meta_data ->> 'username')::text,
    coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal')::text,
    coalesce(control.status, 'active')::text,
    coalesce(control.reason, '')::text,
    control.expires_at,
    users.created_at
  from auth.users users
  left join public.explore_profiles profile on profile.user_id = users.id
  left join public.platform_account_controls control on control.user_id = users.id
  where public.admin_has_permission('users.view')
    and (
      coalesce(btrim(search_text), '') = ''
      or users.email ilike '%' || btrim(search_text) || '%'
      or users.phone ilike '%' || btrim(search_text) || '%'
      or profile.display_name ilike '%' || btrim(search_text) || '%'
      or profile.username ilike '%' || btrim(search_text) || '%'
    )
  order by users.created_at desc
  limit greatest(1, least(coalesce(result_limit, 25), 100));
$$;

create or replace function public.admin_set_user_status(
  target_user_id uuid,
  next_status text,
  action_reason text,
  target_sectors text[] default array['all']::text[],
  status_expires_at timestamptz default null
)
returns public.platform_account_controls
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  previous_control public.platform_account_controls;
  updated_control public.platform_account_controls;
begin
  if not public.admin_has_permission('users.manage') then raise exception 'Not authorized'; end if;
  if next_status not in ('active','warned','restricted','suspended','banned') then raise exception 'Invalid account status'; end if;
  if btrim(coalesce(action_reason, '')) = '' then raise exception 'An action reason is required'; end if;
  if next_status = 'suspended' and public.admin_authority_level() < 3 then raise exception 'This action requires authority level 3'; end if;
  if next_status = 'banned' and not public.admin_has_role(array['super_admin']) then raise exception 'Only a Super Admin can permanently ban an account'; end if;
  if target_user_id = auth.uid() then raise exception 'You cannot change your own account status'; end if;
  if public.admin_has_role(array['super_admin','chief_admin'], target_user_id)
    and not public.admin_has_role(array['super_admin']) then
    raise exception 'Only a Super Admin can restrict a Chief or Super Admin account';
  end if;

  select * into previous_control from public.platform_account_controls where user_id = target_user_id;
  insert into public.platform_account_controls(user_id, status, reason, restricted_sectors, expires_at, updated_by)
  values (target_user_id, next_status, btrim(action_reason), coalesce(nullif(target_sectors, '{}'::text[]), array['all']::text[]), status_expires_at, auth.uid())
  on conflict (user_id) do update
  set status = excluded.status, reason = excluded.reason, restricted_sectors = excluded.restricted_sectors,
      expires_at = excluded.expires_at, updated_by = auth.uid(), updated_at = now()
  returning * into updated_control;

  insert into public.platform_notifications(user_id, sector, notification_type, title, body, priority)
  values (
    target_user_id,
    'platform',
    'account_status',
    case next_status
      when 'active' then 'Your KunThai account access was restored'
      when 'warned' then 'Important account notice'
      when 'restricted' then 'Your KunThai access was restricted'
      when 'suspended' then 'Your KunThai account was suspended'
      else 'Your KunThai account access ended'
    end,
    btrim(action_reason),
    case when next_status in ('suspended','banned') then 'urgent' when next_status in ('warned','restricted') then 'high' else 'normal' end
  );

  perform public.admin_log_action('user.status_changed', 'platform', 'user', target_user_id, null, action_reason, to_jsonb(previous_control), to_jsonb(updated_control));
  return updated_control;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'platform_account_controls'
    )
  then
    alter publication supabase_realtime add table public.platform_account_controls;
  end if;
end;
$$;

-- Controlled bootstrap. Call from the Supabase SQL editor or a service-role
-- deployment task after the target account has been created.
create or replace function public.bootstrap_kunthai_chief_admin(
  target_user_id uuid,
  appoint_as_super_admin boolean default true
)
returns public.admin_assignments
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_role_id uuid;
  assignment public.admin_assignments;
begin
  if not exists(select 1 from auth.users where id = target_user_id) then raise exception 'Target account does not exist'; end if;
  select id into selected_role_id from public.admin_roles
  where role_key = case when appoint_as_super_admin then 'super_admin' else 'chief_admin' end;

  insert into public.admin_assignments(user_id, role_id, sector_scopes, region_scopes, authority_level, status, grant_reason)
  values (target_user_id, selected_role_id, array['all'], array['all'], 5, 'active', 'Secure platform bootstrap')
  on conflict (user_id, role_id) do update
  set status = 'active', sector_scopes = array['all'], region_scopes = array['all'], authority_level = 5, updated_at = now()
  returning * into assignment;
  return assignment;
end;
$$;

revoke all on function public.bootstrap_kunthai_chief_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.bootstrap_kunthai_chief_admin(uuid, boolean) to service_role;

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
begin
  source_id := nullif(source_row ->> 'id', '')::uuid;
  if source_id is null then return null; end if;
  source_status := lower(coalesce(source_row ->> 'status', source_row ->> 'account_status', source_row ->> 'verification_status', 'open'));
  if source_status not in ('open','pending','submitted','pending_review','under_review','in_review','verification_pending') then return null; end if;

  source_title := coalesce(nullif(source_row ->> 'title',''), nullif(source_row ->> 'topic',''), nullif(source_row ->> 'business_name',''), nullif(source_row ->> 'company_name',''), nullif(source_row ->> 'full_name',''), initcap(replace(source_case_type, '_', ' ')));
  source_description := coalesce(source_row ->> 'description', source_row ->> 'reason', source_row ->> 'body', source_row ->> 'note', '');
  source_priority := lower(coalesce(source_row ->> 'priority', 'normal'));
  if source_priority not in ('low','normal','high','urgent','critical') then source_priority := 'normal'; end if;
  source_subject := nullif(coalesce(source_row ->> 'reported_user_id', source_row ->> 'operator_user_id', source_row ->> 'passenger_id'), '')::uuid;
  source_reporter := nullif(coalesce(source_row ->> 'reporter_id', source_row ->> 'user_id', source_row ->> 'passenger_id'), '')::uuid;

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, subject_user_id, reporter_user_id, sla_due_at, metadata
  ) values (
    source_sector, source_queue, source_case_type, source_resource_type, source_id,
    source_title, source_description, source_priority, source_subject, source_reporter,
    now() + case source_priority when 'critical' then interval '30 minutes' when 'urgent' then interval '2 hours' when 'high' then interval '8 hours' when 'low' then interval '72 hours' else interval '24 hours' end,
    jsonb_build_object('source', source_row)
  )
  on conflict (resource_type, resource_id) do update
  set title = excluded.title,
      description = excluded.description,
      priority = excluded.priority,
      metadata = excluded.metadata,
      updated_at = now()
  returning id into source_case_id;
  return source_case_id;
end;
$$;

create or replace function public.admin_capture_source_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_upsert_source_case(to_jsonb(new), tg_argv[0], tg_argv[1], tg_argv[2], tg_argv[3]);
  return new;
end;
$$;

do $$
declare
  source record;
begin
  for source in
    select * from (values
      ('explore_post_reports','admin_intake_explore_post_reports','explore_post_report','explore','reports','content_report'),
      ('explore_comment_reports','admin_intake_explore_comment_reports','explore_comment_report','explore','reports','comment_report'),
      ('explore_profile_reports','admin_intake_explore_profile_reports','explore_profile_report','explore','reports','profile_report'),
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
      execute format(
        'select public.admin_upsert_source_case(to_jsonb(source_row), %L, %L, %L, %L) from public.%I source_row',
        source.resource_type, source.sector, source.queue_name, source.case_type, source.table_name
      );
    end if;
  end loop;
end;
$$;

-- Move existing one-purpose Area View admins into the scoped admin model.
do $$
begin
  if to_regclass('public.nearby_area_admins') is not null then
    insert into public.admin_assignments(user_id, role_id, sector_scopes, region_scopes, authority_level, grant_reason)
    select legacy.user_id, role.id, array['transport'], array['all'], 3, 'Migrated from nearby_area_admins'
    from public.nearby_area_admins legacy
    join public.admin_roles role on role.role_key = 'transport_manager'
    on conflict (user_id, role_id) do nothing;
  end if;
end;
$$;

-- Seller-owned rows may remain editable, but admin-owned decision fields cannot.
create or replace function public.guard_marketplace_business_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.admin_has_permission('marketplace.verify', 'marketplace') then
    new.verification_status := old.verification_status;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.marketplace_businesses') is not null then
    drop trigger if exists guard_marketplace_business_admin_fields_trigger on public.marketplace_businesses;
    create trigger guard_marketplace_business_admin_fields_trigger before update on public.marketplace_businesses
    for each row execute function public.guard_marketplace_business_admin_fields();
  end if;

  if to_regclass('public.marketplace_payout_transactions') is not null then
    drop policy if exists "business owners manage payout transactions" on public.marketplace_payout_transactions;
    drop policy if exists "business owners read payout transactions" on public.marketplace_payout_transactions;
    create policy "business owners read payout transactions" on public.marketplace_payout_transactions
      for select to authenticated using (exists (
        select 1 from public.marketplace_businesses business
        where business.id = business_id and business.user_id = auth.uid()
      ));
  end if;

  if to_regclass('public.marketplace_seller_verification_requests') is not null then
    drop policy if exists "business owners manage verification requests" on public.marketplace_seller_verification_requests;
    drop policy if exists "business owners read verification requests" on public.marketplace_seller_verification_requests;
    drop policy if exists "business owners create verification requests" on public.marketplace_seller_verification_requests;
    create policy "business owners read verification requests" on public.marketplace_seller_verification_requests
      for select to authenticated using (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()));
    create policy "business owners create verification requests" on public.marketplace_seller_verification_requests
      for insert to authenticated with check (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);
  end if;

  if to_regclass('public.marketplace_seller_cases') is not null then
    drop policy if exists "business owners manage seller cases" on public.marketplace_seller_cases;
    drop policy if exists "business owners read seller cases" on public.marketplace_seller_cases;
    drop policy if exists "business owners create seller cases" on public.marketplace_seller_cases;
    create policy "business owners read seller cases" on public.marketplace_seller_cases
      for select to authenticated using (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()));
    create policy "business owners create seller cases" on public.marketplace_seller_cases
      for insert to authenticated with check (exists (select 1 from public.marketplace_businesses business where business.id = business_id and business.user_id = auth.uid()) and status = 'open' and resolved_at is null);
  end if;
end;
$$;

create or replace function public.guard_transport_operator_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.admin_has_permission('transport.verify', 'transport') then
    new := jsonb_populate_record(new, jsonb_build_object(
      'account_status', to_jsonb(old) -> 'account_status',
      'verification_status', to_jsonb(old) -> 'verification_status',
      'verification_note', to_jsonb(old) -> 'verification_note',
      'reviewed_at', to_jsonb(old) -> 'reviewed_at',
      'reviewed_by', to_jsonb(old) -> 'reviewed_by',
      'wallet_balance', to_jsonb(old) -> 'wallet_balance',
      'pending_payout', to_jsonb(old) -> 'pending_payout'
    ));
  end if;
  return new;
end;
$$;

create or replace function public.guard_platform_notification_user_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_kunthai_admin() then
    new.user_id := old.user_id;
    new.campaign_id := old.campaign_id;
    new.sector := old.sector;
    new.notification_type := old.notification_type;
    new.title := old.title;
    new.body := old.body;
    new.priority := old.priority;
    new.action_target := old.action_target;
    new.created_at := old.created_at;
    if new.status not in ('unread','read','archived') then new.status := old.status; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_platform_notification_user_update_trigger on public.platform_notifications;
create trigger guard_platform_notification_user_update_trigger
before update on public.platform_notifications
for each row execute function public.guard_platform_notification_user_update();

do $$
begin
  if to_regclass('public.transport_operators') is not null then
    drop trigger if exists guard_transport_operator_admin_fields_trigger on public.transport_operators;
    create trigger guard_transport_operator_admin_fields_trigger before update on public.transport_operators
    for each row execute function public.guard_transport_operator_admin_fields();
  end if;
end;
$$;

revoke all on table public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_assignments, public.admin_cases, public.admin_case_events, public.admin_case_notes,
  public.admin_approvals, public.admin_audit_logs, public.admin_notification_campaigns,
  public.admin_feature_flags, public.platform_account_controls from anon;
revoke all on table public.platform_notifications from anon;

grant select on table public.admin_roles, public.admin_permissions, public.admin_role_permissions,
  public.admin_assignments, public.admin_cases, public.admin_case_events, public.admin_case_notes,
  public.admin_approvals, public.admin_audit_logs, public.admin_notification_campaigns,
  public.admin_feature_flags, public.platform_account_controls to authenticated;
grant select, update on table public.platform_notifications to authenticated;

revoke all on function public.admin_log_action(text, text, text, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_upsert_source_case(jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_capture_source_case() from public, anon, authenticated;
revoke all on function public.admin_prevent_history_mutation() from public, anon, authenticated;
revoke all on function public.guard_marketplace_business_admin_fields() from public, anon, authenticated;
revoke all on function public.guard_transport_operator_admin_fields() from public, anon, authenticated;
revoke all on function public.guard_platform_notification_user_update() from public, anon, authenticated;

revoke all on function public.get_my_admin_access() from public, anon;
revoke all on function public.admin_dashboard_summary() from public, anon;
revoke all on function public.admin_claim_case(uuid) from public, anon;
revoke all on function public.admin_transition_case(uuid, text, text) from public, anon;
revoke all on function public.admin_add_case_note(uuid, text, text) from public, anon;
revoke all on function public.admin_apply_case_decision(uuid, text, text) from public, anon;
revoke all on function public.admin_review_approval(uuid, boolean, text) from public, anon;
revoke all on function public.admin_create_campaign(text, text, text, text, text, jsonb, timestamptz) from public, anon;
revoke all on function public.admin_approve_campaign(uuid) from public, anon;
revoke all on function public.admin_publish_campaign(uuid) from public, anon;
revoke all on function public.admin_publish_due_campaigns() from public, anon, authenticated;
revoke all on function public.admin_update_feature_flag(text, boolean, jsonb, text) from public, anon;
revoke all on function public.admin_list_team() from public, anon;
revoke all on function public.admin_grant_access(text, text, text[], text[], smallint, text) from public, anon;
revoke all on function public.admin_revoke_access(uuid, text) from public, anon;
revoke all on function public.admin_search_users(text, integer) from public, anon;
revoke all on function public.admin_set_user_status(uuid, text, text, text[], timestamptz) from public, anon;

grant execute on function public.get_my_admin_access() to authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
grant execute on function public.admin_claim_case(uuid) to authenticated;
grant execute on function public.admin_transition_case(uuid, text, text) to authenticated;
grant execute on function public.admin_add_case_note(uuid, text, text) to authenticated;
grant execute on function public.admin_apply_case_decision(uuid, text, text) to authenticated;
grant execute on function public.admin_review_approval(uuid, boolean, text) to authenticated;
grant execute on function public.admin_create_campaign(text, text, text, text, text, jsonb, timestamptz) to authenticated;
grant execute on function public.admin_approve_campaign(uuid) to authenticated;
grant execute on function public.admin_publish_campaign(uuid) to authenticated;
grant execute on function public.admin_publish_due_campaigns() to service_role;
grant execute on function public.admin_update_feature_flag(text, boolean, jsonb, text) to authenticated;
grant execute on function public.admin_list_team() to authenticated;
grant execute on function public.admin_grant_access(text, text, text[], text[], smallint, text) to authenticated;
grant execute on function public.admin_revoke_access(uuid, text) to authenticated;
grant execute on function public.admin_search_users(text, integer) to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text, text[], timestamptz) to authenticated;
