-- KunThai Admin operations platform
--
-- Adds what the existing admin foundation (roles, permissions, assignments,
-- audit log, account controls) did not have:
--   1. A staff career ladder (Associate -> Executive), staff profiles with a
--      staff number, department, title and their own status (active /
--      restricted / suspended / deactivated), and self-escalation guards.
--   2. Granular permissions for UrMall businesses and UrRide operators and
--      companies, plus direct notices to account owners.
--   3. A reusable enforcement engine: immutable enforcement history, current
--      enforcement state, internal notes and a direct-notice log.
--   4. Propagation: restricted/suspended businesses, operators and companies
--      are actually blocked in UrMall and UrRide (RLS + write triggers).
--   5. Server-side paged directories, detail views, a platform overview and a
--      searchable audit log for the admin console.
--
-- Everything is additive and idempotent. Columns whose presence varies between
-- environments (schema drift) are read through to_jsonb(row) ->> 'column'.

-- ===========================================================================
-- 1. Staff career ladder and staff profiles
-- ===========================================================================

create table if not exists public.admin_staff_levels (
  level_key text primary key,
  name text not null,
  rank smallint not null unique check (rank between 1 and 20),
  max_authority smallint not null check (max_authority between 1 and 5),
  summary text not null default ''
);

insert into public.admin_staff_levels (level_key, name, rank, max_authority, summary)
values
  ('associate', 'Associate', 1, 1, 'Entry level. Works assigned queues; sensitive decisions go to a senior colleague.'),
  ('specialist', 'Specialist', 2, 2, 'Independently handles routine cases, warnings and reviews in their area.'),
  ('senior_specialist', 'Senior Specialist', 3, 2, 'Handles complex cases and coaches Associates and Specialists.'),
  ('lead', 'Team Lead', 4, 3, 'Leads a team. Can apply temporary suspensions.'),
  ('manager', 'Manager', 5, 4, 'Owns a function. Can apply indefinite suspensions and manage staff below them.'),
  ('senior_manager', 'Senior Manager', 6, 4, 'Owns several teams or a region.'),
  ('director', 'Director', 7, 5, 'Owns a department across regions. Full operational authority.'),
  ('executive', 'Executive', 8, 5, 'Company leadership and platform owners.')
on conflict (level_key) do update
set name = excluded.name, rank = excluded.rank,
    max_authority = excluded.max_authority, summary = excluded.summary;

create sequence if not exists public.admin_staff_number_seq start 1001;

create table if not exists public.admin_staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  staff_number text not null unique default ('KTS-' || lpad(nextval('public.admin_staff_number_seq')::text, 5, '0')),
  level_key text not null default 'associate' references public.admin_staff_levels(level_key),
  department text not null default 'operations' check (department in (
    'operations', 'trust_safety', 'commerce', 'mobility', 'customer_support',
    'finance', 'growth_marketing', 'engineering', 'compliance_audit', 'executive'
  )),
  job_title text not null default '',
  manager_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'restricted', 'suspended', 'deactivated')),
  status_reason text not null default '',
  status_until timestamptz,
  added_by uuid references auth.users(id) on delete set null,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_profiles_status_idx on public.admin_staff_profiles (status);
create index if not exists admin_staff_profiles_department_idx on public.admin_staff_profiles (department);

alter table public.admin_staff_profiles enable row level security;
drop policy if exists "admins read staff profiles" on public.admin_staff_profiles;
create policy "admins read staff profiles" on public.admin_staff_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.admin_has_permission('team.view'));
-- No write policies: staff profiles change only through the audited RPCs below.

-- Backfill a profile for everyone who already holds admin access. The level
-- is chosen so that nobody loses authority they hold today.
insert into public.admin_staff_profiles (user_id, level_key, department, added_by, created_at)
select
  assignment.user_id,
  case
    when bool_or(role.role_key in ('super_admin', 'chief_admin')) then 'executive'
    when max(assignment.authority_level) >= 5 then 'director'
    when max(assignment.authority_level) = 4 then 'manager'
    when max(assignment.authority_level) = 3 then 'lead'
    when max(assignment.authority_level) = 2 then 'specialist'
    else 'associate'
  end,
  case
    when bool_or(role.role_key in ('super_admin', 'chief_admin')) then 'executive'
    when bool_or(role.role_key = 'marketplace_manager') then 'commerce'
    when bool_or(role.role_key = 'transport_manager') then 'mobility'
    when bool_or(role.role_key in ('reports_officer', 'risk_officer', 'verification_officer')) then 'trust_safety'
    when bool_or(role.role_key = 'support_officer') then 'customer_support'
    when bool_or(role.role_key = 'finance_officer') then 'finance'
    when bool_or(role.role_key = 'notification_officer') then 'growth_marketing'
    when bool_or(role.role_key = 'technical_admin') then 'engineering'
    when bool_or(role.role_key in ('auditor', 'analyst')) then 'compliance_audit'
    else 'operations'
  end,
  (array_agg(assignment.granted_by order by assignment.created_at))[1],
  min(assignment.created_at)
from public.admin_assignments assignment
join public.admin_roles role on role.id = assignment.role_id
group by assignment.user_id
on conflict (user_id) do nothing;

-- Every new admin gets a profile automatically.
create or replace function public.admin_ensure_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_staff_profiles (user_id, level_key, added_by)
  values (
    new.user_id,
    case
      when new.authority_level >= 5 then 'director'
      when new.authority_level = 4 then 'manager'
      when new.authority_level = 3 then 'lead'
      when new.authority_level = 2 then 'specialist'
      else 'associate'
    end,
    coalesce(new.granted_by, auth.uid())
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists admin_assignments_ensure_staff_profile on public.admin_assignments;
create trigger admin_assignments_ensure_staff_profile
after insert on public.admin_assignments
for each row execute function public.admin_ensure_staff_profile();

-- Nobody (except a Super Admin) may change their own admin access. Without
-- this, an admin could grant themselves a lower-ranked role that carries
-- permissions they do not have — an escalation through the side door.
create or replace function public.admin_guard_self_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'last_access_at' - 'updated_at') = (to_jsonb(old) - 'last_access_at' - 'updated_at') then
    return new;
  end if;
  if public.admin_has_role(array['super_admin']) then
    return new;
  end if;
  raise exception 'You cannot change your own admin access';
end;
$$;

drop trigger if exists admin_assignments_guard_self on public.admin_assignments;
create trigger admin_assignments_guard_self
before insert or update on public.admin_assignments
for each row execute function public.admin_guard_self_assignment();

-- Staff status now participates in every access check:
--   suspended (until status_until) / deactivated -> no admin access at all
--   restricted                                   -> view-only permissions
create or replace function public.admin_assignment_is_active(assignment public.admin_assignments)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select assignment.status = 'active'
    and (assignment.expires_at is null or assignment.expires_at > now())
    and not exists (
      select 1
      from public.admin_staff_profiles profile
      where profile.user_id = assignment.user_id
        and (
          profile.status = 'deactivated'
          or (profile.status = 'suspended' and (profile.status_until is null or profile.status_until > now()))
        )
    );
$$;

create or replace function public.admin_staff_is_restricted(user_uuid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_staff_profiles profile
    where profile.user_id = user_uuid
      and profile.status = 'restricted'
      and (profile.status_until is null or profile.status_until > now())
  );
$$;

create or replace function public.admin_permission_is_read_only(permission_key text)
returns boolean
language sql
immutable
as $$
  select permission_key in ('admin.access', 'dashboard.view') or permission_key like '%.view';
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
  )
  and (
    public.admin_permission_is_read_only(requested_permission)
    or not public.admin_staff_is_restricted(user_uuid)
  );
$$;

-- Authority is capped by the staff level: a Team Lead cannot act at level 5
-- even if an old assignment says so.
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
  select case when public.admin_staff_is_restricted(user_uuid) then 0 else
    coalesce(max(least(assignment.authority_level, coalesce(level.max_authority, 5))), 0)
  end::smallint
  from public.admin_assignments assignment
  left join public.admin_staff_profiles profile on profile.user_id = assignment.user_id
  left join public.admin_staff_levels level on level.level_key = profile.level_key
  where assignment.user_id = user_uuid
    and public.admin_assignment_is_active(assignment)
    and (
      requested_sector is null
      or 'all' = any(assignment.sector_scopes)
      or requested_sector = any(assignment.sector_scopes)
    );
$$;

create or replace function public.admin_staff_level_rank(user_uuid uuid default auth.uid())
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select level.rank
    from public.admin_staff_profiles profile
    join public.admin_staff_levels level on level.level_key = profile.level_key
    where profile.user_id = user_uuid
  ), 0)::smallint;
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
    where assignment.user_id = auth.uid() and public.admin_assignment_is_active(assignment)
  ), effective_permissions as (
    select distinct role_permission.permission_key
    from active_assignments assignment
    join public.admin_role_permissions role_permission on role_permission.role_id = assignment.role_id
    where public.admin_permission_is_read_only(role_permission.permission_key)
      or not public.admin_staff_is_restricted(auth.uid())
  ), staff as (
    select profile.*, level.name as level_name, level.rank as level_rank, level.max_authority
    from public.admin_staff_profiles profile
    left join public.admin_staff_levels level on level.level_key = profile.level_key
    where profile.user_id = auth.uid()
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
    'authorityLevel', public.admin_authority_level(),
    'staff', (select jsonb_build_object(
      'staffNumber', staff_number, 'levelKey', level_key, 'levelName', level_name,
      'levelRank', level_rank, 'maxAuthority', max_authority, 'department', department,
      'jobTitle', job_title, 'status', status, 'statusUntil', status_until
    ) from staff),
    'requiresMfa', true
  );
$$;

-- Presence: the console calls this when it opens (throttled client-side), so
-- "Last active" in the staff directory is real.
create or replace function public.admin_touch_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_kunthai_admin() then return; end if;
  update public.admin_staff_profiles
  set last_active_at = now()
  where user_id = auth.uid()
    and (last_active_at is null or last_active_at < now() - interval '2 minutes');
  update public.admin_assignments
  set last_access_at = now()
  where user_id = auth.uid()
    and (last_access_at is null or last_access_at < now() - interval '2 minutes');
end;
$$;

-- ===========================================================================
-- 2. Granular permissions
-- ===========================================================================

insert into public.admin_permissions (permission_key, name, description, permission_group)
values
  ('marketplace.businesses.view', 'View UrMall businesses', 'Browse the UrMall business directory and business profiles.', 'marketplace'),
  ('marketplace.businesses.enforce', 'Warn and restrict UrMall businesses', 'Issue warnings, add internal notes and restrict selected seller capabilities.', 'marketplace'),
  ('marketplace.businesses.suspend', 'Suspend and restore UrMall businesses', 'Temporarily or indefinitely suspend a business, and restore it.', 'marketplace'),
  ('transport.operators.view', 'View UrRide operators', 'Browse the operator directory and operator profiles.', 'transport'),
  ('transport.operators.enforce', 'Warn and restrict UrRide operators', 'Issue warnings, add internal notes and restrict operator capabilities.', 'transport'),
  ('transport.operators.suspend', 'Suspend and restore UrRide operators', 'Temporarily or indefinitely suspend an operator, and restore them.', 'transport'),
  ('transport.companies.view', 'View UrRide companies', 'Browse the company directory and company profiles.', 'transport'),
  ('transport.companies.enforce', 'Warn and restrict UrRide companies', 'Issue warnings, add internal notes and restrict company capabilities.', 'transport'),
  ('transport.companies.suspend', 'Suspend and restore UrRide companies', 'Temporarily or indefinitely suspend a company, and restore it.', 'transport'),
  ('notifications.direct', 'Send direct notices to owners', 'Send a one-to-one notice to the owner of a business, operator or company.', 'notifications')
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission.permission_key
from public.admin_roles role
cross join public.admin_permissions permission
where role.role_key in ('super_admin', 'chief_admin')
on conflict do nothing;

with role_permissions(role_key, permissions) as (
  values
    ('operations_lead', array[
      'marketplace.businesses.view','marketplace.businesses.enforce','marketplace.businesses.suspend',
      'transport.operators.view','transport.operators.enforce','transport.operators.suspend',
      'transport.companies.view','transport.companies.enforce','transport.companies.suspend','notifications.direct']),
    ('risk_officer', array[
      'marketplace.businesses.view','marketplace.businesses.enforce','marketplace.businesses.suspend',
      'transport.operators.view','transport.operators.enforce','transport.operators.suspend',
      'transport.companies.view','transport.companies.enforce','transport.companies.suspend','notifications.direct']),
    ('marketplace_manager', array[
      'marketplace.businesses.view','marketplace.businesses.enforce','marketplace.businesses.suspend','notifications.direct']),
    ('transport_manager', array[
      'transport.operators.view','transport.operators.enforce','transport.operators.suspend',
      'transport.companies.view','transport.companies.enforce','transport.companies.suspend','notifications.direct']),
    ('reports_officer', array[
      'marketplace.businesses.view','marketplace.businesses.enforce',
      'transport.operators.view','transport.operators.enforce',
      'transport.companies.view','transport.companies.enforce','notifications.direct']),
    ('support_officer', array[
      'marketplace.businesses.view','transport.operators.view','transport.companies.view','notifications.direct']),
    ('verification_officer', array['marketplace.businesses.view','transport.operators.view','transport.companies.view']),
    ('finance_officer', array['marketplace.businesses.view','transport.operators.view','transport.companies.view']),
    ('analyst', array['marketplace.businesses.view','transport.operators.view','transport.companies.view']),
    ('auditor', array['marketplace.businesses.view','transport.operators.view','transport.companies.view'])
)
insert into public.admin_role_permissions (role_id, permission_key)
select role.id, permission_key
from role_permissions mapping
join public.admin_roles role on role.role_key = mapping.role_key
cross join lateral unnest(mapping.permissions) permission_key
on conflict do nothing;

-- ===========================================================================
-- 3. Staff management RPCs
-- ===========================================================================

create or replace function public.admin_list_staff()
returns table (
  user_id uuid,
  email text,
  display_name text,
  public_id text,
  staff_number text,
  level_key text,
  level_name text,
  level_rank smallint,
  department text,
  job_title text,
  status text,
  status_reason text,
  status_until timestamptz,
  manager_user_id uuid,
  manager_name text,
  added_by uuid,
  added_by_name text,
  created_at timestamptz,
  last_active_at timestamptz,
  roles jsonb,
  actions_30d bigint
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    profile.user_id,
    users.email::text,
    coalesce(explore.display_name, users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1))::text,
    public.kunthai_public_user_id_from_uuid(profile.user_id)::text,
    profile.staff_number,
    profile.level_key,
    level.name,
    level.rank,
    profile.department,
    profile.job_title,
    case when profile.status in ('suspended', 'restricted') and profile.status_until is not null and profile.status_until <= now()
      then 'active' else profile.status end,
    profile.status_reason,
    profile.status_until,
    profile.manager_user_id,
    coalesce(manager.raw_user_meta_data ->> 'display_name', manager.raw_user_meta_data ->> 'full_name', split_part(manager.email, '@', 1))::text,
    profile.added_by,
    coalesce(adder.raw_user_meta_data ->> 'display_name', adder.raw_user_meta_data ->> 'full_name', split_part(adder.email, '@', 1))::text,
    profile.created_at,
    greatest(profile.last_active_at, (select max(assignment.last_access_at) from public.admin_assignments assignment where assignment.user_id = profile.user_id)),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'assignmentId', assignment.id, 'key', role.role_key, 'name', role.name, 'rank', role.rank,
        'status', assignment.status, 'sectors', assignment.sector_scopes, 'authorityLevel', assignment.authority_level,
        'expiresAt', assignment.expires_at, 'grantedAt', assignment.created_at
      ) order by role.rank desc)
      from public.admin_assignments assignment
      join public.admin_roles role on role.id = assignment.role_id
      where assignment.user_id = profile.user_id
    ), '[]'::jsonb),
    (select count(*) from public.admin_audit_logs log where log.actor_user_id = profile.user_id and log.created_at > now() - interval '30 days')
  from public.admin_staff_profiles profile
  join auth.users users on users.id = profile.user_id
  join public.admin_staff_levels level on level.level_key = profile.level_key
  left join public.explore_profiles explore on explore.user_id = profile.user_id
  left join auth.users manager on manager.id = profile.manager_user_id
  left join auth.users adder on adder.id = profile.added_by
  where public.admin_has_permission('team.view')
  order by level.rank desc, profile.created_at;
$$;

create or replace function public.admin_get_staff_activity(target_user_id uuid, result_limit integer default 50)
returns table (id uuid, action_key text, sector text, resource_type text, resource_id uuid, reason text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select log.id, log.action_key, log.sector, log.resource_type, log.resource_id, log.reason, log.created_at
  from public.admin_audit_logs log
  where (public.admin_has_permission('team.view') or public.admin_has_permission('audit.view'))
    and (log.actor_user_id = target_user_id or (log.resource_type = 'admin_staff' and log.resource_id = target_user_id))
  order by log.created_at desc
  limit greatest(1, least(coalesce(result_limit, 50), 200));
$$;

-- Shared guard: may the caller manage this staff member?
create or replace function public.admin_assert_can_manage_staff(target_user_id uuid)
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.admin_has_permission('team.manage') then
    raise exception 'Not authorized';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot change your own staff record';
  end if;
  if public.admin_has_role(array['super_admin']) then
    return;
  end if;
  if public.admin_has_role(array['super_admin', 'chief_admin'], target_user_id) then
    raise exception 'Only a Super Admin can manage a Chief or Super Admin';
  end if;
  if public.admin_staff_level_rank(target_user_id) >= public.admin_staff_level_rank(auth.uid()) then
    raise exception 'You can only manage staff below your own level';
  end if;
end;
$$;

create or replace function public.admin_update_staff_profile(
  target_user_id uuid,
  next_level_key text,
  next_department text,
  next_job_title text,
  next_manager_user_id uuid,
  change_reason text
)
returns public.admin_staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_profile public.admin_staff_profiles;
  updated_profile public.admin_staff_profiles;
  next_level public.admin_staff_levels;
begin
  perform public.admin_assert_can_manage_staff(target_user_id);
  if length(btrim(coalesce(change_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters';
  end if;

  select * into next_level from public.admin_staff_levels where level_key = next_level_key;
  if next_level.level_key is null then raise exception 'Unknown staff level'; end if;
  if next_level.rank >= public.admin_staff_level_rank(auth.uid())
    and not public.admin_has_role(array['super_admin']) then
    raise exception 'You can only assign levels below your own';
  end if;
  if next_manager_user_id = target_user_id then
    raise exception 'A staff member cannot report to themselves';
  end if;

  select * into previous_profile from public.admin_staff_profiles where user_id = target_user_id for update;
  if previous_profile.user_id is null then raise exception 'Staff member not found'; end if;

  update public.admin_staff_profiles
  set level_key = next_level.level_key,
      department = coalesce(nullif(btrim(next_department), ''), department),
      job_title = left(btrim(coalesce(next_job_title, '')), 80),
      manager_user_id = next_manager_user_id,
      updated_at = now()
  where user_id = target_user_id
  returning * into updated_profile;

  perform public.admin_log_action(
    case when previous_profile.level_key is distinct from updated_profile.level_key
      then 'team.staff_level_changed' else 'team.staff_profile_updated' end,
    'platform', 'admin_staff', target_user_id, null, btrim(change_reason),
    to_jsonb(previous_profile), to_jsonb(updated_profile)
  );
  return updated_profile;
end;
$$;

create or replace function public.admin_set_staff_status(
  target_user_id uuid,
  next_status text,
  change_reason text,
  status_until_at timestamptz default null
)
returns public.admin_staff_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_profile public.admin_staff_profiles;
  updated_profile public.admin_staff_profiles;
begin
  perform public.admin_assert_can_manage_staff(target_user_id);
  if next_status not in ('active', 'restricted', 'suspended', 'deactivated') then
    raise exception 'Invalid staff status';
  end if;
  if length(btrim(coalesce(change_reason, ''))) < 5 then
    raise exception 'Give a reason of at least 5 characters';
  end if;
  if next_status = 'deactivated' and public.admin_authority_level() < 4 then
    raise exception 'Deactivating staff requires authority level 4';
  end if;
  if status_until_at is not null and status_until_at <= now() then
    raise exception 'The end time must be in the future';
  end if;

  select * into previous_profile from public.admin_staff_profiles where user_id = target_user_id for update;
  if previous_profile.user_id is null then raise exception 'Staff member not found'; end if;

  update public.admin_staff_profiles
  set status = next_status,
      status_reason = btrim(change_reason),
      status_until = case when next_status in ('restricted', 'suspended') then status_until_at else null end,
      updated_at = now()
  where user_id = target_user_id
  returning * into updated_profile;

  perform public.admin_log_action(
    'team.staff_status_changed', 'platform', 'admin_staff', target_user_id, null, btrim(change_reason),
    to_jsonb(previous_profile), to_jsonb(updated_profile)
  );
  return updated_profile;
end;
$$;

-- ===========================================================================
-- 4. Enforcement engine
-- ===========================================================================
--
-- target_type: marketplace_business | transport_operator | transport_company
-- History is append-only (admin_enforcement_actions). The live state is one
-- row per enforced target (admin_enforcement_states); restoring deletes the
-- state row but never the history.

create table if not exists public.admin_enforcement_actions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('marketplace_business', 'transport_operator', 'transport_company')),
  target_id uuid not null,
  target_owner_user_id uuid references auth.users(id) on delete set null,
  target_label text not null default '',
  action text not null check (action in ('warning', 'restriction', 'temporary_suspension', 'suspension', 'restoration')),
  reason_code text not null,
  public_message text not null default '',
  internal_note text not null default '',
  capabilities text[] not null default '{}'::text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  previous_state jsonb,
  resulting_state jsonb,
  performed_by uuid references auth.users(id) on delete set null,
  performed_by_system boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists admin_enforcement_actions_target_idx
  on public.admin_enforcement_actions (target_type, target_id, created_at desc);
create index if not exists admin_enforcement_actions_created_idx
  on public.admin_enforcement_actions (created_at desc);

create table if not exists public.admin_enforcement_states (
  target_type text not null check (target_type in ('marketplace_business', 'transport_operator', 'transport_company')),
  target_id uuid not null,
  status text not null check (status in ('restricted', 'suspended')),
  capabilities text[] not null default '{}'::text[],
  reason_code text not null,
  public_message text not null default '',
  ends_at timestamptz,
  action_id uuid references public.admin_enforcement_actions(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (target_type, target_id)
);

create index if not exists admin_enforcement_states_ends_idx
  on public.admin_enforcement_states (ends_at) where ends_at is not null;

create table if not exists public.admin_internal_notes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  body text not null check (length(btrim(body)) between 3 and 4000),
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_internal_notes_target_idx
  on public.admin_internal_notes (target_type, target_id, created_at desc);

create table if not exists public.admin_direct_notifications (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  action_target text,
  priority text not null default 'normal',
  notification_id uuid,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists admin_direct_notifications_target_idx
  on public.admin_direct_notifications (target_type, target_id, created_at desc);

-- History tables are immutable for everyone, admins included.
drop trigger if exists admin_enforcement_actions_immutable on public.admin_enforcement_actions;
create trigger admin_enforcement_actions_immutable
before update or delete on public.admin_enforcement_actions
for each row execute function public.admin_prevent_history_mutation();

drop trigger if exists admin_internal_notes_immutable on public.admin_internal_notes;
create trigger admin_internal_notes_immutable
before update or delete on public.admin_internal_notes
for each row execute function public.admin_prevent_history_mutation();

drop trigger if exists admin_direct_notifications_immutable on public.admin_direct_notifications;
create trigger admin_direct_notifications_immutable
before update or delete on public.admin_direct_notifications
for each row execute function public.admin_prevent_history_mutation();

-- Permission key prefix for a target type.
create or replace function public.admin_enforcement_permission_prefix(p_target_type text)
returns text
language sql
immutable
as $$
  select case p_target_type
    when 'marketplace_business' then 'marketplace.businesses'
    when 'transport_operator' then 'transport.operators'
    when 'transport_company' then 'transport.companies'
  end;
$$;

create or replace function public.admin_enforcement_sector(p_target_type text)
returns text
language sql
immutable
as $$
  select case when p_target_type = 'marketplace_business' then 'marketplace' else 'transport' end;
$$;

-- Capabilities a restriction may switch off, per target type.
create or replace function public.admin_enforcement_capabilities(p_target_type text)
returns text[]
language sql
immutable
as $$
  select case p_target_type
    when 'marketplace_business' then array['listings', 'orders', 'promotions', 'messaging', 'discovery']
    when 'transport_operator' then array['trips', 'discovery']
    when 'transport_company' then array['trips', 'discovery', 'operators']
    else array[]::text[]
  end;
$$;

-- RLS read policies on the new tables (writes only through RPCs).
alter table public.admin_enforcement_actions enable row level security;
alter table public.admin_enforcement_states enable row level security;
alter table public.admin_internal_notes enable row level security;
alter table public.admin_direct_notifications enable row level security;

drop policy if exists "admins read enforcement actions" on public.admin_enforcement_actions;
create policy "admins read enforcement actions" on public.admin_enforcement_actions
  for select to authenticated
  using (public.admin_has_permission(public.admin_enforcement_permission_prefix(target_type) || '.view', public.admin_enforcement_sector(target_type)));

drop policy if exists "admins read enforcement states" on public.admin_enforcement_states;
create policy "admins read enforcement states" on public.admin_enforcement_states
  for select to authenticated
  using (public.admin_has_permission(public.admin_enforcement_permission_prefix(target_type) || '.view', public.admin_enforcement_sector(target_type)));

drop policy if exists "admins read internal notes" on public.admin_internal_notes;
create policy "admins read internal notes" on public.admin_internal_notes
  for select to authenticated
  using (public.admin_has_permission(public.admin_enforcement_permission_prefix(target_type) || '.view', public.admin_enforcement_sector(target_type)));

drop policy if exists "admins read direct notifications" on public.admin_direct_notifications;
create policy "admins read direct notifications" on public.admin_direct_notifications
  for select to authenticated
  using (public.admin_has_permission(public.admin_enforcement_permission_prefix(target_type) || '.view', public.admin_enforcement_sector(target_type)));

-- Is a capability blocked for this target right now? An expired state counts
-- as lifted immediately, even before the scheduled job tidies it up.
create or replace function public.kunthai_enforcement_blocks(p_target_type text, p_target_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_target_id is not null and exists (
    select 1
    from public.admin_enforcement_states state
    where state.target_type = p_target_type
      and state.target_id = p_target_id
      and (state.ends_at is null or state.ends_at > now())
      and (state.status = 'suspended' or p_capability = any(state.capabilities))
  );
$$;

-- Effective status label used by every admin list and by owner notices.
create or replace function public.kunthai_enforcement_status(p_target_type text, p_target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when state.status = 'suspended' and state.ends_at is not null then 'temporarily_suspended'
      else state.status
    end
    from public.admin_enforcement_states state
    where state.target_type = p_target_type
      and state.target_id = p_target_id
      and (state.ends_at is null or state.ends_at > now())
  ), 'active');
$$;

-- Owner + display label of a target (null owner = target not found).
create or replace function public.admin_enforcement_target(p_target_type text, p_target_id uuid)
returns table (owner_user_id uuid, label text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_target_type = 'marketplace_business' then
    return query select business.user_id, coalesce(business.business_name, 'UrMall business')::text
      from public.marketplace_businesses business where business.id = p_target_id;
  elsif p_target_type = 'transport_operator' then
    return query select operator.user_id, coalesce(to_jsonb(operator) ->> 'full_name', to_jsonb(operator) ->> 'operator_code', 'UrRide operator')::text
      from public.transport_operators operator where operator.id = p_target_id;
  elsif p_target_type = 'transport_company' then
    return query select company.owner_user_id, coalesce(company.company_name, 'UrRide company')::text
      from public.transport_companies company where company.id = p_target_id;
  end if;
end;
$$;

create or replace function public.admin_enforcement_notice_target(p_target_type text)
returns text
language sql
immutable
as $$
  select case p_target_type
    when 'marketplace_business' then 'urmall:business'
    when 'transport_operator' then 'urride:operator-dashboard'
    when 'transport_company' then 'urride:company-dashboard'
  end;
$$;

create or replace function public.admin_capability_label(p_capability text)
returns text
language sql
immutable
as $$
  select case p_capability
    when 'listings' then 'adding or editing listings'
    when 'orders' then 'receiving new orders and bookings'
    when 'promotions' then 'running promotions'
    when 'messaging' then 'messaging customers'
    when 'discovery' then 'appearing in search and browse'
    when 'trips' then 'taking new trips'
    when 'operators' then 'inviting operators'
    else p_capability
  end;
$$;

-- The single entry point for every enforcement decision.
create or replace function public.admin_apply_enforcement(
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_reason_code text,
  p_public_message text,
  p_internal_note text default '',
  p_capabilities text[] default '{}'::text[],
  p_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := public.admin_enforcement_permission_prefix(p_target_type);
  v_sector text := public.admin_enforcement_sector(p_target_type);
  v_owner uuid;
  v_label text;
  v_previous public.admin_enforcement_states;
  v_current_status text;
  v_capabilities text[] := '{}'::text[];
  v_action_id uuid;
  v_result jsonb;
  v_title text;
  v_body text;
  v_until text;
begin
  if v_prefix is null then raise exception 'Unknown target type'; end if;
  if p_action not in ('warning', 'restriction', 'temporary_suspension', 'suspension', 'restoration') then
    raise exception 'Unknown enforcement action';
  end if;

  -- Permission and authority ladder.
  if p_action in ('warning', 'restriction') then
    if not public.admin_has_permission(v_prefix || '.enforce', v_sector) then raise exception 'Not authorized'; end if;
    if p_action = 'restriction' and public.admin_authority_level(v_sector) < 2 then
      raise exception 'Restrictions require authority level 2';
    end if;
  elsif p_action = 'temporary_suspension' then
    if not public.admin_has_permission(v_prefix || '.suspend', v_sector) then raise exception 'Not authorized'; end if;
    if public.admin_authority_level(v_sector) < 3 then raise exception 'Temporary suspensions require authority level 3'; end if;
  elsif p_action = 'suspension' then
    if not public.admin_has_permission(v_prefix || '.suspend', v_sector) then raise exception 'Not authorized'; end if;
    if public.admin_authority_level(v_sector) < 4 then raise exception 'Indefinite suspensions require authority level 4'; end if;
  end if;

  select target.owner_user_id, target.label into v_owner, v_label
  from public.admin_enforcement_target(p_target_type, p_target_id) target;
  if v_owner is null then raise exception 'That record no longer exists'; end if;
  if v_owner = auth.uid() then raise exception 'You cannot take action on your own account'; end if;

  select * into v_previous from public.admin_enforcement_states
  where target_type = p_target_type and target_id = p_target_id
  for update;
  v_current_status := public.kunthai_enforcement_status(p_target_type, p_target_id);

  if p_action = 'restoration' then
    if v_current_status = 'active' then raise exception 'This account is not restricted or suspended'; end if;
    if v_previous.status = 'suspended' and not public.admin_has_permission(v_prefix || '.suspend', v_sector) then
      raise exception 'Restoring a suspension requires suspend permission';
    end if;
    if not public.admin_has_permission(v_prefix || '.enforce', v_sector)
      and not public.admin_has_permission(v_prefix || '.suspend', v_sector) then
      raise exception 'Not authorized';
    end if;
    if p_reason_code not in ('issue_resolved', 'appeal_upheld', 'error_correction', 'policy_update', 'other') then
      raise exception 'Choose a restoration reason';
    end if;
  elsif p_reason_code not in (
    'fraud_scam', 'counterfeit_prohibited', 'safety_violation', 'spam', 'harassment',
    'misleading_information', 'repeated_violations', 'identity_verification', 'other'
  ) then
    raise exception 'Choose a reason category';
  end if;

  if length(btrim(coalesce(p_public_message, ''))) < 10 then
    raise exception 'Explain the decision to the owner (at least 10 characters)';
  end if;
  if p_action in ('restriction', 'temporary_suspension', 'suspension')
    and length(btrim(coalesce(p_internal_note, ''))) < 5 then
    raise exception 'Add an internal note (at least 5 characters)';
  end if;

  if p_action = 'restriction' then
    select coalesce(array_agg(distinct capability), '{}'::text[]) into v_capabilities
    from unnest(coalesce(p_capabilities, '{}'::text[])) capability
    where capability = any(public.admin_enforcement_capabilities(p_target_type));
    if cardinality(v_capabilities) = 0 then raise exception 'Choose at least one capability to restrict'; end if;
    if p_ends_at is not null and p_ends_at <= now() then raise exception 'The end time must be in the future'; end if;
  elsif p_action = 'temporary_suspension' then
    if p_ends_at is null or p_ends_at <= now() then raise exception 'A temporary suspension needs a future end time'; end if;
    if p_ends_at > now() + interval '365 days' then raise exception 'Temporary suspensions are limited to 365 days'; end if;
  end if;

  -- The resulting state is computed up front: history rows are immutable.
  v_result := case
    when p_action = 'restoration' then null
    when p_action = 'warning' then to_jsonb(v_previous)
    else jsonb_build_object(
      'status', case when p_action = 'restriction' then 'restricted' else 'suspended' end,
      'capabilities', to_jsonb(v_capabilities),
      'reason_code', p_reason_code,
      'ends_at', case when p_action in ('restriction', 'temporary_suspension') then p_ends_at end
    )
  end;

  insert into public.admin_enforcement_actions (
    target_type, target_id, target_owner_user_id, target_label, action, reason_code,
    public_message, internal_note, capabilities, ends_at, previous_state, resulting_state, performed_by
  ) values (
    p_target_type, p_target_id, v_owner, v_label, p_action, p_reason_code,
    btrim(p_public_message), btrim(coalesce(p_internal_note, '')), v_capabilities,
    case when p_action in ('restriction', 'temporary_suspension') then p_ends_at end,
    to_jsonb(v_previous), v_result, auth.uid()
  ) returning id into v_action_id;

  if p_action = 'restoration' then
    delete from public.admin_enforcement_states where target_type = p_target_type and target_id = p_target_id;
  elsif p_action <> 'warning' then
    insert into public.admin_enforcement_states (target_type, target_id, status, capabilities, reason_code, public_message, ends_at, action_id, updated_at)
    values (
      p_target_type, p_target_id,
      case when p_action = 'restriction' then 'restricted' else 'suspended' end,
      v_capabilities, p_reason_code, btrim(p_public_message),
      case when p_action in ('restriction', 'temporary_suspension') then p_ends_at end,
      v_action_id, now()
    )
    on conflict (target_type, target_id) do update
    set status = excluded.status, capabilities = excluded.capabilities, reason_code = excluded.reason_code,
        public_message = excluded.public_message, ends_at = excluded.ends_at,
        action_id = excluded.action_id, updated_at = now();
  end if;

  -- Tell the owner. Internal notes are never included.
  v_until := case when p_ends_at is not null and p_action in ('restriction', 'temporary_suspension')
    then ' until ' || to_char(p_ends_at at time zone 'UTC', 'DD Mon YYYY HH24:MI') || ' UTC' else '' end;
  v_title := case p_action
    when 'warning' then 'Important notice about ' || v_label
    when 'restriction' then v_label || ' has been restricted'
    when 'temporary_suspension' then v_label || ' is temporarily suspended'
    when 'suspension' then v_label || ' has been suspended'
    else v_label || ' has been restored'
  end;
  v_body := btrim(p_public_message)
    || case
      when p_action = 'restriction' then E'\n\nRestricted' || v_until || ': '
        || (select string_agg(public.admin_capability_label(capability), ', ') from unnest(v_capabilities) capability) || '.'
      when p_action = 'temporary_suspension' then E'\n\nSuspended' || v_until || '.'
      when p_action = 'suspension' then E'\n\nThis suspension stays in place until KunThai reviews it.'
      when p_action = 'restoration' then E'\n\nEverything is working normally again.'
      else ''
    end;

  insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
  values (
    v_owner, v_sector, 'account_enforcement', left(v_title, 200), v_body,
    case when p_action in ('temporary_suspension', 'suspension') then 'urgent'
      when p_action in ('warning', 'restriction') then 'high' else 'normal' end,
    public.admin_enforcement_notice_target(p_target_type)
  );

  perform public.admin_log_action(
    'enforcement.' || p_action, v_sector, p_target_type, p_target_id, null,
    btrim(p_public_message), to_jsonb(v_previous), v_result,
    jsonb_build_object('reasonCode', p_reason_code, 'capabilities', v_capabilities, 'endsAt', p_ends_at, 'actionId', v_action_id, 'label', v_label)
  );

  return jsonb_build_object(
    'actionId', v_action_id,
    'status', public.kunthai_enforcement_status(p_target_type, p_target_id),
    'state', v_result
  );
end;
$$;

create or replace function public.admin_add_internal_note(p_target_type text, p_target_id uuid, p_body text)
returns public.admin_internal_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := public.admin_enforcement_permission_prefix(p_target_type);
  v_sector text := public.admin_enforcement_sector(p_target_type);
  v_note public.admin_internal_notes;
begin
  if v_prefix is null then raise exception 'Unknown target type'; end if;
  if not public.admin_has_permission(v_prefix || '.enforce', v_sector)
    and not public.admin_has_permission(v_prefix || '.suspend', v_sector) then
    raise exception 'Not authorized';
  end if;
  if length(btrim(coalesce(p_body, ''))) < 3 then raise exception 'Write a note first'; end if;
  if not exists (select 1 from public.admin_enforcement_target(p_target_type, p_target_id) target where target.owner_user_id is not null) then
    raise exception 'That record no longer exists';
  end if;

  insert into public.admin_internal_notes (target_type, target_id, body, author_user_id)
  values (p_target_type, p_target_id, btrim(p_body), auth.uid())
  returning * into v_note;

  perform public.admin_log_action('enforcement.note_added', v_sector, p_target_type, p_target_id, null, '', null, null,
    jsonb_build_object('noteId', v_note.id));
  return v_note;
end;
$$;

create or replace function public.admin_send_owner_notification(
  p_target_type text,
  p_target_id uuid,
  p_title text,
  p_body text,
  p_action_target text default null,
  p_priority text default 'normal'
)
returns public.admin_direct_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := public.admin_enforcement_permission_prefix(p_target_type);
  v_sector text := public.admin_enforcement_sector(p_target_type);
  v_owner uuid;
  v_label text;
  v_notification_id uuid;
  v_log public.admin_direct_notifications;
begin
  if v_prefix is null then raise exception 'Unknown target type'; end if;
  if not public.admin_has_permission('notifications.direct')
    or not public.admin_has_permission(v_prefix || '.view', v_sector) then
    raise exception 'Not authorized';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'The title must be 3 to 120 characters'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 10 and 2000 then raise exception 'The message must be 10 to 2000 characters'; end if;
  if coalesce(p_priority, 'normal') not in ('normal', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if p_action_target is not null and p_action_target !~ '^[a-z0-9:_-]{1,80}$' then raise exception 'Invalid destination'; end if;

  select target.owner_user_id, target.label into v_owner, v_label
  from public.admin_enforcement_target(p_target_type, p_target_id) target;
  if v_owner is null then raise exception 'That record no longer exists'; end if;

  insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
  values (v_owner, v_sector, 'admin_message', btrim(p_title), btrim(p_body), coalesce(p_priority, 'normal'), nullif(btrim(coalesce(p_action_target, '')), ''))
  returning id into v_notification_id;

  insert into public.admin_direct_notifications (target_type, target_id, recipient_user_id, title, body, action_target, priority, notification_id, sent_by)
  values (p_target_type, p_target_id, v_owner, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_action_target, '')), ''), coalesce(p_priority, 'normal'), v_notification_id, auth.uid())
  returning * into v_log;

  perform public.admin_log_action('notification.direct_sent', v_sector, p_target_type, p_target_id, null, btrim(p_title), null, null,
    jsonb_build_object('notificationId', v_notification_id, 'recipient', v_owner, 'label', v_label));
  return v_log;
end;
$$;

-- Scheduled tidy-up: lift expired restrictions/suspensions (with a system
-- history entry and an owner notice) and end expired staff suspensions.
create or replace function public.admin_expire_enforcements()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state record;
  v_count integer := 0;
  v_owner uuid;
  v_label text;
begin
  for v_state in
    select * from public.admin_enforcement_states where ends_at is not null and ends_at <= now()
    for update skip locked
  loop
    select target.owner_user_id, target.label into v_owner, v_label
    from public.admin_enforcement_target(v_state.target_type, v_state.target_id) target;

    insert into public.admin_enforcement_actions (
      target_type, target_id, target_owner_user_id, target_label, action, reason_code,
      public_message, previous_state, performed_by_system
    ) values (
      v_state.target_type, v_state.target_id, v_owner, coalesce(v_label, ''), 'restoration', 'expired',
      'The ' || case when v_state.status = 'suspended' then 'suspension' else 'restriction' end || ' period ended.',
      to_jsonb(v_state), true
    );

    delete from public.admin_enforcement_states
    where target_type = v_state.target_type and target_id = v_state.target_id;

    if v_owner is not null then
      insert into public.platform_notifications (user_id, sector, notification_type, title, body, priority, action_target)
      values (
        v_owner, public.admin_enforcement_sector(v_state.target_type), 'account_enforcement',
        left(coalesce(v_label, 'Your account') || ' has been restored', 200),
        'The ' || case when v_state.status = 'suspended' then 'suspension' else 'restriction' end
          || ' period has ended and everything is working normally again.',
        'normal', public.admin_enforcement_notice_target(v_state.target_type)
      );
    end if;

    perform public.admin_log_action('enforcement.expired', public.admin_enforcement_sector(v_state.target_type),
      v_state.target_type, v_state.target_id, null, 'Scheduled expiry', to_jsonb(v_state), null, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;

  update public.admin_staff_profiles
  set status = 'active', status_reason = 'Scheduled end of ' || status, status_until = null, updated_at = now()
  where status in ('suspended', 'restricted') and status_until is not null and status_until <= now();

  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kunthai-admin-enforcement-expiry';
    perform cron.schedule('kunthai-admin-enforcement-expiry', '*/5 * * * *', 'select public.admin_expire_enforcements()');
  end if;
end;
$$;

-- What the signed-in owner is currently subject to (for in-product banners).
create or replace function public.get_my_enforcement_notices()
returns table (
  target_type text,
  target_id uuid,
  label text,
  status text,
  capabilities text[],
  reason_code text,
  public_message text,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select 'marketplace_business'::text as target_type, business.id as target_id, coalesce(business.business_name, 'UrMall business')::text as label
    from public.marketplace_businesses business
    where business.user_id = auth.uid()
       or exists (
         select 1 from public.marketplace_business_admins admin
         where admin.business_id = business.id and admin.user_id = auth.uid() and admin.status = 'accepted'
       )
    union all
    select 'transport_operator', operator.id, coalesce(to_jsonb(operator) ->> 'full_name', 'UrRide operator')
    from public.transport_operators operator where operator.user_id = auth.uid()
    union all
    select 'transport_company', company.id, coalesce(company.company_name, 'UrRide company')
    from public.transport_companies company where company.owner_user_id = auth.uid()
  )
  select mine.target_type, mine.target_id, mine.label,
    public.kunthai_enforcement_status(mine.target_type, mine.target_id),
    state.capabilities, state.reason_code, state.public_message, state.ends_at
  from mine
  join public.admin_enforcement_states state
    on state.target_type = mine.target_type and state.target_id = mine.target_id
  where state.ends_at is null or state.ends_at > now();
$$;

-- ===========================================================================
-- 5. Propagation into UrMall and UrRide
-- ===========================================================================

-- --- UrMall ---------------------------------------------------------------

-- Is the signed-in user the owner or an accepted admin of this business?
create or replace function public.marketplace_is_business_staff(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.marketplace_businesses business where business.id = p_business_id and business.user_id = auth.uid())
    or exists (
      select 1 from public.marketplace_business_admins admin
      where admin.business_id = p_business_id and admin.user_id = auth.uid() and admin.status = 'accepted'
    )
  );
$$;

-- Owners and their delegated admins keep reading their own business and
-- inventory while it is suspended (needed for the seller workspace banner).
drop policy if exists "owners read own marketplace businesses" on public.marketplace_businesses;
create policy "owners read own marketplace businesses" on public.marketplace_businesses
  for select to authenticated
  using (public.marketplace_is_business_staff(id));

drop policy if exists "buyers read marketplace businesses" on public.marketplace_businesses;
create policy "buyers read marketplace businesses" on public.marketplace_businesses
  for select to anon, authenticated
  using (not public.kunthai_enforcement_blocks('marketplace_business', id, 'discovery'));

drop policy if exists "owners read own marketplace products" on public.marketplace_products;
create policy "owners read own marketplace products" on public.marketplace_products
  for select to authenticated
  using (public.marketplace_is_business_staff(business_id));

drop policy if exists "buyers read active marketplace products" on public.marketplace_products;
create policy "buyers read active marketplace products" on public.marketplace_products
  for select to anon, authenticated
  using (
    coalesce(status, 'active') = 'active'
    and not public.kunthai_enforcement_blocks('marketplace_business', business_id, 'discovery')
  );

drop policy if exists "owners read own restaurant menus" on public.marketplace_restaurant_menu_items;
create policy "owners read own restaurant menus" on public.marketplace_restaurant_menu_items
  for select to authenticated
  using (public.marketplace_is_business_staff(business_id));

drop policy if exists "buyers read restaurant menus" on public.marketplace_restaurant_menu_items;
create policy "buyers read restaurant menus" on public.marketplace_restaurant_menu_items
  for select to anon, authenticated
  using (available = true and not public.kunthai_enforcement_blocks('marketplace_business', business_id, 'discovery'));

drop policy if exists "owners read own hotel rooms" on public.marketplace_hotel_rooms;
create policy "owners read own hotel rooms" on public.marketplace_hotel_rooms
  for select to authenticated
  using (public.marketplace_is_business_staff(business_id));

drop policy if exists "buyers read hotel rooms" on public.marketplace_hotel_rooms;
create policy "buyers read hotel rooms" on public.marketplace_hotel_rooms
  for select to anon, authenticated
  using (active = true and rooms_available > 0 and not public.kunthai_enforcement_blocks('marketplace_business', business_id, 'discovery'));

drop policy if exists "owners read own hotel images" on public.marketplace_hotel_images;
create policy "owners read own hotel images" on public.marketplace_hotel_images
  for select to authenticated
  using (public.marketplace_is_business_staff(business_id));

drop policy if exists "buyers read hotel images" on public.marketplace_hotel_images;
create policy "buyers read hotel images" on public.marketplace_hotel_images
  for select to anon, authenticated
  using (not public.kunthai_enforcement_blocks('marketplace_business', business_id, 'discovery'));

drop policy if exists "owners read own property listings" on public.marketplace_property_listings;
create policy "owners read own property listings" on public.marketplace_property_listings
  for select to authenticated
  using (public.marketplace_is_business_staff(business_id));

drop policy if exists "buyers read property listings" on public.marketplace_property_listings;
create policy "buyers read property listings" on public.marketplace_property_listings
  for select to anon, authenticated
  using (
    published = true and availability_status = 'available' and expires_at > now()
    and not public.kunthai_enforcement_blocks('marketplace_business', business_id, 'discovery')
  );

-- Seller-side writes. Only the business's own staff are stopped: buyer
-- activity that touches a row (stock on checkout, for example) is unaffected.
create or replace function public.enforce_marketplace_seller_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := nullif(coalesce(to_jsonb(new) ->> 'business_id', to_jsonb(old) ->> 'business_id'), '')::uuid;
  v_capability text := tg_argv[0];
begin
  if auth.uid() is null or public.is_kunthai_admin() then
    return coalesce(new, old);
  end if;
  if public.kunthai_enforcement_blocks('marketplace_business', v_business, v_capability)
    and public.marketplace_is_business_staff(v_business) then
    raise exception using
      errcode = 'P0001',
      message = case
        when public.kunthai_enforcement_status('marketplace_business', v_business) in ('suspended', 'temporarily_suspended')
          then 'This business is suspended. Check your notifications for details.'
        else 'This business is restricted from ' || public.admin_capability_label(v_capability) || '.'
      end;
  end if;
  return coalesce(new, old);
end;
$$;

-- Buyer-side: a business that cannot take orders rejects new ones.
create or replace function public.enforce_marketplace_order_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := nullif(to_jsonb(new) ->> 'business_id', '')::uuid;
begin
  if public.kunthai_enforcement_blocks('marketplace_business', v_business, 'orders')
    and not public.is_kunthai_admin() then
    raise exception using errcode = 'P0001', message = 'This business is not accepting orders right now.';
  end if;
  return new;
end;
$$;

do $$
declare
  listing_table text;
begin
  foreach listing_table in array array[
    'marketplace_products', 'marketplace_restaurant_menu_items',
    'marketplace_property_listings', 'marketplace_hotel_rooms', 'marketplace_hotel_images'
  ] loop
    if to_regclass('public.' || listing_table) is not null then
      execute format('drop trigger if exists %I on public.%I', listing_table || '_enforce_listings', listing_table);
      execute format(
        'create trigger %I before insert or update on public.%I for each row execute function public.enforce_marketplace_seller_capability(%L)',
        listing_table || '_enforce_listings', listing_table, 'listings'
      );
    end if;
  end loop;

  if to_regclass('public.marketplace_promotions') is not null then
    drop trigger if exists marketplace_promotions_enforce_promotions on public.marketplace_promotions;
    create trigger marketplace_promotions_enforce_promotions
      before insert or update on public.marketplace_promotions
      for each row execute function public.enforce_marketplace_seller_capability('promotions');
  end if;

  if to_regclass('public.marketplace_orders') is not null then
    drop trigger if exists marketplace_orders_enforce_orders on public.marketplace_orders;
    create trigger marketplace_orders_enforce_orders
      before insert on public.marketplace_orders
      for each row execute function public.enforce_marketplace_order_capability();
  end if;

  if to_regclass('public.marketplace_vertical_bookings') is not null then
    drop trigger if exists marketplace_vertical_bookings_enforce_orders on public.marketplace_vertical_bookings;
    create trigger marketplace_vertical_bookings_enforce_orders
      before insert on public.marketplace_vertical_bookings
      for each row execute function public.enforce_marketplace_order_capability();
  end if;
end;
$$;

-- Seller replies to customers (sender_role = 'seller'). Buyers can still write.
create or replace function public.enforce_marketplace_messaging_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := nullif(to_jsonb(new) ->> 'business_id', '')::uuid;
begin
  if auth.uid() is null or public.is_kunthai_admin() then return new; end if;
  if coalesce(to_jsonb(new) ->> 'sender_role', 'buyer') = 'seller'
    and public.kunthai_enforcement_blocks('marketplace_business', v_business, 'messaging') then
    raise exception using errcode = 'P0001', message = 'This business is restricted from messaging customers.';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.marketplace_customer_messages') is not null then
    drop trigger if exists marketplace_customer_messages_enforce_messaging on public.marketplace_customer_messages;
    create trigger marketplace_customer_messages_enforce_messaging
      before insert on public.marketplace_customer_messages
      for each row execute function public.enforce_marketplace_messaging_capability();
  end if;
end;
$$;

-- --- UrRide ---------------------------------------------------------------

create or replace function public.transport_fleet_blocked(p_fleet_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_fleets fleet
    where fleet.id = p_fleet_id
      and (
        public.kunthai_enforcement_blocks('transport_operator', fleet.operator_id, p_capability)
        or (fleet.company_id is not null and public.kunthai_enforcement_blocks('transport_company', fleet.company_id, p_capability))
      )
  );
$$;

-- Owners keep seeing their own fleets; passengers stop seeing suspended ones.
drop policy if exists "operators read own fleets" on public.transport_fleets;
create policy "operators read own fleets" on public.transport_fleets
  for select to authenticated
  using (exists (select 1 from public.transport_operators operator where operator.id = operator_id and operator.user_id = auth.uid()));

drop policy if exists "passengers can read registered and visible company fleets" on public.transport_fleets;
create policy "passengers can read registered and visible company fleets"
on public.transport_fleets
for select
to anon, authenticated
using (
  (company_fleet_id is null or is_visible_to_passengers = true)
  and not public.kunthai_enforcement_blocks('transport_operator', operator_id, 'discovery')
  and (company_id is null or not public.kunthai_enforcement_blocks('transport_company', company_id, 'discovery'))
);

-- New trips and accepting trips.
create or replace function public.enforce_transport_trip_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_kunthai_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if public.transport_fleet_blocked(new.fleet_id, 'trips') then
      raise exception using errcode = 'P0001', message = 'This operator is not taking trips right now.';
    end if;
  elsif new.status::text = 'accepted' and old.status::text is distinct from 'accepted' then
    if public.transport_fleet_blocked(new.fleet_id, 'trips') then
      raise exception using errcode = 'P0001', message = 'Your account cannot accept trips right now. Check your notifications for details.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists transport_trips_enforce_capability on public.transport_trips;
create trigger transport_trips_enforce_capability
before insert or update of status on public.transport_trips
for each row execute function public.enforce_transport_trip_capability();

-- Companies restricted from 'operators' cannot send new operator invites.
create or replace function public.enforce_transport_company_invite_capability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := nullif(to_jsonb(new) ->> 'company_id', '')::uuid;
begin
  if public.is_kunthai_admin() then return new; end if;
  if public.kunthai_enforcement_blocks('transport_company', v_company, 'operators') then
    raise exception using errcode = 'P0001', message = 'This company is restricted from inviting operators.';
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.transport_company_operator_invites') is not null then
    drop trigger if exists transport_company_operator_invites_enforce on public.transport_company_operator_invites;
    create trigger transport_company_operator_invites_enforce
      before insert on public.transport_company_operator_invites
      for each row execute function public.enforce_transport_company_invite_capability();
  end if;
end;
$$;

-- Open bookings never offer a job to a blocked operator or company.
create or replace function public.transport_open_booking_eligible_fleets(
  p_uid uuid,
  p_trip_type text,
  p_fleet_type text,
  p_country text
)
returns table (fleet_id uuid, operator_id uuid, operator_user_id uuid, is_active boolean, last_active_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    fleet.id,
    operator.id,
    operator.user_id,
    lower(coalesce(fleet.active_status::text, '')) = 'active',
    fleet.last_active_at
  from public.transport_fleets fleet
  join public.transport_operators operator on operator.id = fleet.operator_id
  -- Enum columns are compared as text so '' never has to be cast to the enum.
  where lower(coalesce(fleet.fleet_type::text, '')) = p_fleet_type
    and (fleet.company_id is null or coalesce(fleet.is_visible_to_passengers, false))
    and upper(coalesce(fleet.country_iso::text, '')) = p_country
    and (
      case when p_trip_type = 'ride'
        then lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery')
        else lower(coalesce(fleet.service_category::text, '')) in ('delivery', 'both', 'delivery only', 'ride and delivery')
      end
    )
    and operator.user_id is distinct from p_uid
    -- Admin enforcement: suspended or trip-restricted operators/companies.
    and not public.kunthai_enforcement_blocks('transport_operator', operator.id, 'trips')
    and (fleet.company_id is null or not public.kunthai_enforcement_blocks('transport_company', fleet.company_id, 'trips'))
    -- An operator already on a job cannot accept another one.
    and not exists (
      select 1
      from public.transport_trips busy
      join public.transport_fleets busy_fleet on busy_fleet.id = busy.fleet_id
      where busy_fleet.operator_id = operator.id
        and busy.status::text in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
    );
$$;

revoke all on function public.transport_open_booking_eligible_fleets(uuid, text, text, text) from public, anon, authenticated;

-- ===========================================================================
-- 6. Admin directories (server-side search, filter, sort, pagination)
-- ===========================================================================

create or replace function public.admin_like_pattern(p_search text)
returns text
language sql
immutable
as $$
  select case when length(btrim(coalesce(p_search, ''))) = 0 then null else
    '%' || replace(replace(replace(lower(btrim(p_search)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
$$;

create or replace function public.admin_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    nullif(profile.display_name, ''),
    users.raw_user_meta_data ->> 'display_name',
    users.raw_user_meta_data ->> 'full_name',
    split_part(users.email, '@', 1),
    'KunThai user'
  )::text
  from auth.users users
  left join public.explore_profiles profile on profile.user_id = users.id
  where users.id = p_user_id;
$$;

-- --- UrMall businesses -----------------------------------------------------

create or replace function public.admin_list_marketplace_businesses(
  p_search text default null,
  p_kinds text[] default null,
  p_enforcement text[] default null,
  p_verification text[] default null,
  p_country text default null,
  p_city text default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  business_name text,
  public_business_id text,
  business_kind text,
  logo_url text,
  owner_user_id uuid,
  owner_name text,
  owner_public_id text,
  owner_email text,
  country text,
  city text,
  verification_status text,
  enforcement_status text,
  enforcement_ends_at timestamptz,
  listing_count bigint,
  order_count bigint,
  created_at timestamptz,
  last_activity_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_pattern text := public.admin_like_pattern(p_search);
begin
  if not public.admin_has_permission('marketplace.businesses.view', 'marketplace') then
    raise exception 'Not authorized';
  end if;

  return query
  with base as (
    select
      business.id,
      coalesce(business.business_name, 'Untitled business')::text as business_name,
      coalesce(to_jsonb(business) ->> 'public_business_id', '')::text as public_business_id,
      coalesce(to_jsonb(business) ->> 'business_kind', 'retail')::text as business_kind,
      coalesce(to_jsonb(business) ->> 'logo_url', '')::text as logo_url,
      business.user_id as owner_user_id,
      coalesce(to_jsonb(business) ->> 'country', to_jsonb(business) ->> 'country_iso', '')::text as country,
      coalesce(to_jsonb(business) ->> 'city', '')::text as city,
      coalesce(to_jsonb(business) ->> 'verification_status', 'pending')::text as verification_status,
      business.created_at,
      nullif(to_jsonb(business) ->> 'updated_at', '')::timestamptz as updated_at,
      public.kunthai_enforcement_status('marketplace_business', business.id) as enforcement_status
    from public.marketplace_businesses business
  ), filtered as (
    select base.*, users.email::text as owner_email, public.admin_display_name(base.owner_user_id) as owner_name,
      public.kunthai_public_user_id_from_uuid(base.owner_user_id)::text as owner_public_id
    from base
    left join auth.users users on users.id = base.owner_user_id
    where (v_pattern is null
        or lower(base.business_name) like v_pattern
        or lower(base.public_business_id) like v_pattern
        or lower(coalesce(users.email, '')) like v_pattern
        or lower(public.admin_display_name(base.owner_user_id)) like v_pattern
        or lower(public.kunthai_public_user_id_from_uuid(base.owner_user_id)::text) like v_pattern
        or base.id::text = lower(btrim(p_search)))
      and (coalesce(cardinality(p_kinds), 0) = 0 or base.business_kind = any(p_kinds))
      and (coalesce(cardinality(p_enforcement), 0) = 0 or base.enforcement_status = any(p_enforcement))
      and (coalesce(cardinality(p_verification), 0) = 0 or lower(base.verification_status) = any(p_verification))
      and (nullif(btrim(coalesce(p_country, '')), '') is null or lower(base.country) = lower(btrim(p_country)))
      and (nullif(btrim(coalesce(p_city, '')), '') is null or lower(base.city) like public.admin_like_pattern(p_city))
      and (p_created_from is null or base.created_at >= p_created_from)
      and (p_created_to is null or base.created_at < p_created_to)
  ), enriched as (
    select filtered.*,
      (
        (select count(*) from public.marketplace_products item where item.business_id = filtered.id)
        + (select count(*) from public.marketplace_restaurant_menu_items item where item.business_id = filtered.id)
        + (select count(*) from public.marketplace_hotel_rooms item where item.business_id = filtered.id)
        + (select count(*) from public.marketplace_property_listings item where item.business_id = filtered.id)
      )::bigint as listing_count,
      (
        (select count(*) from public.marketplace_orders item where item.business_id = filtered.id)
        + (select count(*) from public.marketplace_vertical_bookings item where item.business_id = filtered.id)
      )::bigint as order_count,
      greatest(
        filtered.updated_at,
        filtered.created_at,
        (select max(item.created_at) from public.marketplace_products item where item.business_id = filtered.id),
        (select max(item.created_at) from public.marketplace_orders item where item.business_id = filtered.id)
      ) as last_activity_at,
      (select state.ends_at from public.admin_enforcement_states state
        where state.target_type = 'marketplace_business' and state.target_id = filtered.id) as enforcement_ends_at
    from filtered
  )
  select enriched.id, enriched.business_name, enriched.public_business_id, enriched.business_kind, enriched.logo_url,
    enriched.owner_user_id, enriched.owner_name, enriched.owner_public_id, enriched.owner_email,
    enriched.country, enriched.city, enriched.verification_status, enriched.enforcement_status, enriched.enforcement_ends_at,
    enriched.listing_count, enriched.order_count, enriched.created_at, enriched.last_activity_at,
    count(*) over ()
  from enriched
  order by
    case when p_sort = 'oldest' then enriched.created_at end asc,
    case when p_sort = 'recently_active' then enriched.last_activity_at end desc nulls last,
    case when p_sort = 'name_asc' then lower(enriched.business_name) end asc,
    case when p_sort = 'name_desc' then lower(enriched.business_name) end desc,
    case when p_sort = 'most_listings' then enriched.listing_count end desc,
    case when p_sort = 'most_orders' then enriched.order_count end desc,
    enriched.created_at desc,
    enriched.id
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- Shared detail blocks for every target type.
create or replace function public.admin_target_governance(p_target_type text, p_target_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'status', public.kunthai_enforcement_status(p_target_type, p_target_id),
    'state', (select to_jsonb(state) from public.admin_enforcement_states state
      where state.target_type = p_target_type and state.target_id = p_target_id),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'id', action.id, 'action', action.action, 'reasonCode', action.reason_code,
        'publicMessage', action.public_message, 'internalNote', action.internal_note,
        'capabilities', action.capabilities, 'endsAt', action.ends_at,
        'performedBy', case when action.performed_by_system then 'KunThai system' else public.admin_display_name(action.performed_by) end,
        'createdAt', action.created_at
      ) order by action.created_at desc)
      from public.admin_enforcement_actions action
      where action.target_type = p_target_type and action.target_id = p_target_id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', note.id, 'body', note.body, 'author', public.admin_display_name(note.author_user_id), 'createdAt', note.created_at
      ) order by note.created_at desc)
      from public.admin_internal_notes note
      where note.target_type = p_target_type and note.target_id = p_target_id), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', notice.id, 'title', notice.title, 'body', notice.body, 'actionTarget', notice.action_target,
        'priority', notice.priority, 'sentBy', public.admin_display_name(notice.sent_by), 'createdAt', notice.created_at,
        'readAt', (select notification.read_at from public.platform_notifications notification where notification.id = notice.notification_id)
      ) order by notice.created_at desc)
      from public.admin_direct_notifications notice
      where notice.target_type = p_target_type and notice.target_id = p_target_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(entry order by (entry ->> 'createdAt') desc) from (
        select jsonb_build_object(
          'id', log.id, 'actionKey', log.action_key, 'reason', log.reason,
          'actor', coalesce(public.admin_display_name(log.actor_user_id), 'KunThai system'), 'createdAt', log.created_at
        ) as entry
        from public.admin_audit_logs log
        where log.resource_id = p_target_id
        order by log.created_at desc
        limit 50
      ) recent), '[]'::jsonb)
  );
$$;

create or replace function public.admin_owner_summary(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'userId', users.id,
    'name', public.admin_display_name(users.id),
    'publicId', public.kunthai_public_user_id_from_uuid(users.id),
    'email', users.email,
    'phone', users.phone,
    'joinedAt', users.created_at,
    'lastSignInAt', users.last_sign_in_at,
    'accountStatus', coalesce((select control.status from public.platform_account_controls control where control.user_id = users.id), 'active')
  )
  from auth.users users
  where users.id = p_user_id;
$$;

create or replace function public.admin_get_marketplace_business(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_business public.marketplace_businesses;
begin
  if not public.admin_has_permission('marketplace.businesses.view', 'marketplace') then raise exception 'Not authorized'; end if;
  select * into v_business from public.marketplace_businesses where id = p_business_id;
  if v_business.id is null then raise exception 'Business not found'; end if;

  return jsonb_build_object(
    'business', to_jsonb(v_business),
    'owner', public.admin_owner_summary(v_business.user_id),
    'stats', jsonb_build_object(
      'products', (select count(*) from public.marketplace_products item where item.business_id = p_business_id),
      'activeProducts', (select count(*) from public.marketplace_products item where item.business_id = p_business_id and coalesce(to_jsonb(item) ->> 'status', 'active') = 'active'),
      'menuItems', (select count(*) from public.marketplace_restaurant_menu_items item where item.business_id = p_business_id),
      'hotelRooms', (select count(*) from public.marketplace_hotel_rooms item where item.business_id = p_business_id),
      'propertyListings', (select count(*) from public.marketplace_property_listings item where item.business_id = p_business_id),
      'orders', (select count(*) from public.marketplace_orders item where item.business_id = p_business_id),
      'orders30d', (select count(*) from public.marketplace_orders item where item.business_id = p_business_id and item.created_at > now() - interval '30 days'),
      'bookings', (select count(*) from public.marketplace_vertical_bookings item where item.business_id = p_business_id),
      'reviews', (select count(*) from public.marketplace_reviews item where to_jsonb(item) ->> 'business_id' = p_business_id::text),
      'admins', (select count(*) from public.marketplace_business_admins item where item.business_id = p_business_id and item.status = 'accepted')
    ),
    'listings', coalesce((select jsonb_agg(row_data order by (row_data ->> 'createdAt') desc) from (
      select jsonb_build_object(
        'id', item.id,
        'name', coalesce(to_jsonb(item) ->> 'name', to_jsonb(item) ->> 'title', 'Product'),
        'status', coalesce(to_jsonb(item) ->> 'status', 'active'),
        'price', to_jsonb(item) ->> 'price',
        'currency', to_jsonb(item) ->> 'currency',
        'stock', to_jsonb(item) ->> 'stock',
        'createdAt', item.created_at
      ) as row_data
      from public.marketplace_products item
      where item.business_id = p_business_id
      order by item.created_at desc
      limit 15
    ) recent), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(row_data order by (row_data ->> 'createdAt') desc) from (
      select jsonb_build_object(
        'id', item.id,
        'status', to_jsonb(item) ->> 'status',
        'total', coalesce(to_jsonb(item) ->> 'total_amount', to_jsonb(item) ->> 'total', to_jsonb(item) ->> 'amount'),
        'currency', to_jsonb(item) ->> 'currency',
        'createdAt', item.created_at
      ) as row_data
      from public.marketplace_orders item
      where item.business_id = p_business_id
      order by item.created_at desc
      limit 15
    ) recent), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(to_jsonb(item) - 'evidence' order by item.created_at desc)
      from (select * from public.marketplace_seller_cases item where to_jsonb(item) ->> 'business_id' = p_business_id::text order by item.created_at desc limit 20) item), '[]'::jsonb),
    'governance', public.admin_target_governance('marketplace_business', p_business_id)
  );
end;
$$;

-- --- UrRide operators -------------------------------------------------------

create or replace function public.admin_list_transport_operators(
  p_search text default null,
  p_enforcement text[] default null,
  p_verification text[] default null,
  p_account_status text[] default null,
  p_fleet_type text default null,
  p_service text default null,
  p_country text default null,
  p_city text default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  operator_code text,
  full_name text,
  user_id uuid,
  public_id text,
  email text,
  phone text,
  country text,
  city text,
  verification_status text,
  account_status text,
  enforcement_status text,
  enforcement_ends_at timestamptz,
  fleet_count bigint,
  fleet_types text[],
  services text[],
  companies text[],
  trip_count bigint,
  last_trip_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_pattern text := public.admin_like_pattern(p_search);
begin
  if not public.admin_has_permission('transport.operators.view', 'transport') then raise exception 'Not authorized'; end if;

  return query
  with base as (
    select
      operator.id,
      coalesce(to_jsonb(operator) ->> 'operator_code', '')::text as operator_code,
      coalesce(to_jsonb(operator) ->> 'full_name', 'Unnamed operator')::text as full_name,
      operator.user_id,
      coalesce(to_jsonb(operator) ->> 'phone', '')::text as phone,
      coalesce(to_jsonb(operator) ->> 'country', to_jsonb(operator) ->> 'country_iso', '')::text as country,
      coalesce(to_jsonb(operator) ->> 'country_iso', '')::text as country_iso,
      coalesce(to_jsonb(operator) ->> 'city', '')::text as city,
      coalesce(to_jsonb(operator) ->> 'verification_status', 'pending')::text as verification_status,
      coalesce(to_jsonb(operator) ->> 'account_status', 'draft')::text as account_status,
      operator.created_at,
      public.kunthai_enforcement_status('transport_operator', operator.id) as enforcement_status
    from public.transport_operators operator
  ), fleets as (
    select fleet.operator_id,
      count(*) as fleet_count,
      array_remove(array_agg(distinct lower(fleet.fleet_type::text)), null) as fleet_types,
      array_remove(array_agg(distinct lower(fleet.service_category::text)), null) as services,
      array_remove(array_agg(distinct company.company_name), null) as companies
    from public.transport_fleets fleet
    left join public.transport_companies company on company.id = fleet.company_id
    group by fleet.operator_id
  ), trips as (
    select fleet.operator_id, count(*) as trip_count, max(trip.created_at) as last_trip_at
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    group by fleet.operator_id
  ), enriched as (
    select base.*, users.email::text as email,
      public.kunthai_public_user_id_from_uuid(base.user_id)::text as public_id,
      coalesce(fleets.fleet_count, 0)::bigint as fleet_count,
      coalesce(fleets.fleet_types, '{}'::text[]) as fleet_types,
      coalesce(fleets.services, '{}'::text[]) as services,
      coalesce(fleets.companies, '{}'::text[]) as companies,
      coalesce(trips.trip_count, 0)::bigint as trip_count,
      trips.last_trip_at,
      (select state.ends_at from public.admin_enforcement_states state
        where state.target_type = 'transport_operator' and state.target_id = base.id) as enforcement_ends_at
    from base
    left join auth.users users on users.id = base.user_id
    left join fleets on fleets.operator_id = base.id
    left join trips on trips.operator_id = base.id
    where (v_pattern is null
        or lower(base.full_name) like v_pattern
        or lower(base.operator_code) like v_pattern
        or lower(base.phone) like v_pattern
        or lower(coalesce(users.email, '')) like v_pattern
        or lower(public.kunthai_public_user_id_from_uuid(base.user_id)::text) like v_pattern
        or base.id::text = lower(btrim(p_search)))
      and (coalesce(cardinality(p_enforcement), 0) = 0 or base.enforcement_status = any(p_enforcement))
      and (coalesce(cardinality(p_verification), 0) = 0 or lower(base.verification_status) = any(p_verification))
      and (coalesce(cardinality(p_account_status), 0) = 0 or lower(base.account_status) = any(p_account_status))
      and (nullif(btrim(coalesce(p_fleet_type, '')), '') is null or lower(btrim(p_fleet_type)) = any(coalesce(fleets.fleet_types, '{}'::text[])))
      and (nullif(btrim(coalesce(p_service, '')), '') is null or lower(btrim(p_service)) = any(coalesce(fleets.services, '{}'::text[])))
      and (nullif(btrim(coalesce(p_country, '')), '') is null or lower(base.country) = lower(btrim(p_country)) or lower(base.country_iso) = lower(btrim(p_country)))
      and (nullif(btrim(coalesce(p_city, '')), '') is null or lower(base.city) like public.admin_like_pattern(p_city))
      and (p_created_from is null or base.created_at >= p_created_from)
      and (p_created_to is null or base.created_at < p_created_to)
  )
  select enriched.id, enriched.operator_code, enriched.full_name, enriched.user_id, enriched.public_id, enriched.email,
    enriched.phone, enriched.country, enriched.city, enriched.verification_status, enriched.account_status,
    enriched.enforcement_status, enriched.enforcement_ends_at, enriched.fleet_count, enriched.fleet_types,
    enriched.services, enriched.companies, enriched.trip_count, enriched.last_trip_at, enriched.created_at,
    count(*) over ()
  from enriched
  order by
    case when p_sort = 'oldest' then enriched.created_at end asc,
    case when p_sort = 'recently_active' then enriched.last_trip_at end desc nulls last,
    case when p_sort = 'name_asc' then lower(enriched.full_name) end asc,
    case when p_sort = 'name_desc' then lower(enriched.full_name) end desc,
    case when p_sort = 'most_trips' then enriched.trip_count end desc,
    enriched.created_at desc,
    enriched.id
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.admin_get_transport_operator(p_operator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_operator public.transport_operators;
begin
  if not public.admin_has_permission('transport.operators.view', 'transport') then raise exception 'Not authorized'; end if;
  select * into v_operator from public.transport_operators where id = p_operator_id;
  if v_operator.id is null then raise exception 'Operator not found'; end if;

  return jsonb_build_object(
    'operator', to_jsonb(v_operator) - 'wallet_balance' - 'pending_payout',
    'owner', public.admin_owner_summary(v_operator.user_id),
    'fleets', coalesce((select jsonb_agg(jsonb_build_object(
        'id', fleet.id,
        'name', coalesce(to_jsonb(fleet) ->> 'fleet_name', to_jsonb(fleet) ->> 'fleet_code', 'Vehicle'),
        'code', to_jsonb(fleet) ->> 'fleet_code',
        'fleetType', fleet.fleet_type::text,
        'service', fleet.service_category::text,
        'plate', to_jsonb(fleet) ->> 'plate_number',
        'vehicle', concat_ws(' ', to_jsonb(fleet) ->> 'color', to_jsonb(fleet) ->> 'make', to_jsonb(fleet) ->> 'model'),
        'activeStatus', fleet.active_status::text,
        'verificationStatus', to_jsonb(fleet) ->> 'verification_status',
        'company', (select company.company_name from public.transport_companies company where company.id = fleet.company_id),
        'country', fleet.country_iso::text,
        'lastActiveAt', fleet.last_active_at
      ) order by fleet.last_active_at desc nulls last)
      from public.transport_fleets fleet where fleet.operator_id = p_operator_id), '[]'::jsonb),
    'stats', jsonb_build_object(
      'trips', (select count(*) from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id where fleet.operator_id = p_operator_id),
      'completedTrips', (select count(*) from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id where fleet.operator_id = p_operator_id and trip.status::text = 'completed'),
      'trips30d', (select count(*) from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id where fleet.operator_id = p_operator_id and trip.created_at > now() - interval '30 days'),
      'reviews', (select count(*) from public.transport_operator_reviews review where to_jsonb(review) ->> 'operator_id' = p_operator_id::text)
    ),
    'recentTrips', coalesce((select jsonb_agg(row_data order by (row_data ->> 'createdAt') desc) from (
      select jsonb_build_object(
        'id', trip.id, 'status', trip.status::text,
        'pickup', to_jsonb(trip) ->> 'pickup_label', 'destination', to_jsonb(trip) ->> 'destination_label',
        'fare', to_jsonb(trip) ->> 'fare_amount', 'currency', to_jsonb(trip) ->> 'fare_currency',
        'createdAt', trip.created_at
      ) as row_data
      from public.transport_trips trip
      join public.transport_fleets fleet on fleet.id = trip.fleet_id
      where fleet.operator_id = p_operator_id
      order by trip.created_at desc
      limit 15
    ) recent), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'type', to_jsonb(doc) ->> 'document_type', 'status', to_jsonb(doc) ->> 'status', 'uploadedAt', to_jsonb(doc) ->> 'uploaded_at'
      ))
      from public.transport_operator_documents doc where to_jsonb(doc) ->> 'operator_id' = p_operator_id::text), '[]'::jsonb),
    'governance', public.admin_target_governance('transport_operator', p_operator_id)
  );
end;
$$;

-- --- UrRide companies ------------------------------------------------------

create or replace function public.admin_list_transport_companies(
  p_search text default null,
  p_enforcement text[] default null,
  p_verification text[] default null,
  p_account_status text[] default null,
  p_service text default null,
  p_country text default null,
  p_city text default null,
  p_created_from timestamptz default null,
  p_created_to timestamptz default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  company_code text,
  company_name text,
  company_type text,
  owner_user_id uuid,
  owner_name text,
  owner_public_id text,
  email text,
  phone text,
  country text,
  city text,
  verification_status text,
  account_status text,
  enforcement_status text,
  enforcement_ends_at timestamptz,
  operator_count bigint,
  fleet_count bigint,
  services text[],
  trip_count bigint,
  created_at timestamptz,
  last_activity_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_pattern text := public.admin_like_pattern(p_search);
begin
  if not public.admin_has_permission('transport.companies.view', 'transport') then raise exception 'Not authorized'; end if;

  return query
  with fleets as (
    select fleet.company_id,
      count(distinct fleet.operator_id) as operator_count,
      count(*) as fleet_count,
      array_remove(array_agg(distinct lower(fleet.service_category::text)), null) as services
    from public.transport_fleets fleet
    where fleet.company_id is not null
    group by fleet.company_id
  ), trips as (
    select fleet.company_id, count(*) as trip_count, max(trip.created_at) as last_trip_at
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.company_id is not null
    group by fleet.company_id
  ), enriched as (
    select
      company.id,
      coalesce(company.company_code, '')::text as company_code,
      coalesce(company.company_name, 'Unnamed company')::text as company_name,
      coalesce(company.company_type, '')::text as company_type,
      company.owner_user_id,
      coalesce(nullif(company.owner_name, ''), public.admin_display_name(company.owner_user_id))::text as owner_name,
      public.kunthai_public_user_id_from_uuid(company.owner_user_id)::text as owner_public_id,
      coalesce(company.email, '')::text as email,
      coalesce(company.phone, '')::text as phone,
      coalesce(company.country, '')::text as country,
      coalesce(company.city, '')::text as city,
      coalesce(company.verification_status, 'pending')::text as verification_status,
      coalesce(company.account_status, 'draft')::text as account_status,
      public.kunthai_enforcement_status('transport_company', company.id) as enforcement_status,
      (select state.ends_at from public.admin_enforcement_states state
        where state.target_type = 'transport_company' and state.target_id = company.id) as enforcement_ends_at,
      coalesce(fleets.operator_count, 0)::bigint as operator_count,
      coalesce(fleets.fleet_count, 0)::bigint as fleet_count,
      coalesce(fleets.services, '{}'::text[]) as services,
      coalesce(trips.trip_count, 0)::bigint as trip_count,
      company.created_at,
      greatest(company.updated_at, trips.last_trip_at) as last_activity_at
    from public.transport_companies company
    left join fleets on fleets.company_id = company.id
    left join trips on trips.company_id = company.id
  )
  select enriched.id, enriched.company_code, enriched.company_name, enriched.company_type, enriched.owner_user_id,
    enriched.owner_name, enriched.owner_public_id, enriched.email, enriched.phone, enriched.country, enriched.city,
    enriched.verification_status, enriched.account_status, enriched.enforcement_status, enriched.enforcement_ends_at,
    enriched.operator_count, enriched.fleet_count, enriched.services, enriched.trip_count, enriched.created_at,
    enriched.last_activity_at, count(*) over ()
  from enriched
  where (v_pattern is null
      or lower(enriched.company_name) like v_pattern
      or lower(enriched.company_code) like v_pattern
      or lower(enriched.owner_name) like v_pattern
      or lower(enriched.email) like v_pattern
      or lower(enriched.phone) like v_pattern
      or lower(enriched.owner_public_id) like v_pattern
      or enriched.id::text = lower(btrim(p_search)))
    and (coalesce(cardinality(p_enforcement), 0) = 0 or enriched.enforcement_status = any(p_enforcement))
    and (coalesce(cardinality(p_verification), 0) = 0 or lower(enriched.verification_status) = any(p_verification))
    and (coalesce(cardinality(p_account_status), 0) = 0 or lower(enriched.account_status) = any(p_account_status))
    and (nullif(btrim(coalesce(p_service, '')), '') is null or lower(btrim(p_service)) = any(enriched.services))
    and (nullif(btrim(coalesce(p_country, '')), '') is null or lower(enriched.country) = lower(btrim(p_country)))
    and (nullif(btrim(coalesce(p_city, '')), '') is null or lower(enriched.city) like public.admin_like_pattern(p_city))
    and (p_created_from is null or enriched.created_at >= p_created_from)
    and (p_created_to is null or enriched.created_at < p_created_to)
  order by
    case when p_sort = 'oldest' then enriched.created_at end asc,
    case when p_sort = 'recently_active' then enriched.last_activity_at end desc nulls last,
    case when p_sort = 'name_asc' then lower(enriched.company_name) end asc,
    case when p_sort = 'name_desc' then lower(enriched.company_name) end desc,
    case when p_sort = 'most_operators' then enriched.operator_count end desc,
    case when p_sort = 'most_trips' then enriched.trip_count end desc,
    enriched.created_at desc,
    enriched.id
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.admin_get_transport_company(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_company public.transport_companies;
begin
  if not public.admin_has_permission('transport.companies.view', 'transport') then raise exception 'Not authorized'; end if;
  select * into v_company from public.transport_companies where id = p_company_id;
  if v_company.id is null then raise exception 'Company not found'; end if;

  return jsonb_build_object(
    'company', to_jsonb(v_company) - 'documents',
    'owner', public.admin_owner_summary(v_company.owner_user_id),
    'operators', coalesce((select jsonb_agg(jsonb_build_object(
        'id', operator.id,
        'name', coalesce(to_jsonb(operator) ->> 'full_name', 'Operator'),
        'code', to_jsonb(operator) ->> 'operator_code',
        'fleets', (select count(*) from public.transport_fleets fleet where fleet.company_id = p_company_id and fleet.operator_id = operator.id),
        'enforcementStatus', public.kunthai_enforcement_status('transport_operator', operator.id)
      ))
      from public.transport_operators operator
      where operator.id in (select fleet.operator_id from public.transport_fleets fleet where fleet.company_id = p_company_id)), '[]'::jsonb),
    'stats', jsonb_build_object(
      'operators', (select count(distinct fleet.operator_id) from public.transport_fleets fleet where fleet.company_id = p_company_id),
      'fleets', (select count(*) from public.transport_fleets fleet where fleet.company_id = p_company_id),
      'trips', (select count(*) from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id where fleet.company_id = p_company_id),
      'trips30d', (select count(*) from public.transport_trips trip join public.transport_fleets fleet on fleet.id = trip.fleet_id where fleet.company_id = p_company_id and trip.created_at > now() - interval '30 days'),
      'services', (select coalesce(jsonb_agg(distinct lower(fleet.service_category::text)), '[]'::jsonb) from public.transport_fleets fleet where fleet.company_id = p_company_id)
    ),
    'recentTrips', coalesce((select jsonb_agg(row_data order by (row_data ->> 'createdAt') desc) from (
      select jsonb_build_object(
        'id', trip.id, 'status', trip.status::text,
        'pickup', to_jsonb(trip) ->> 'pickup_label', 'destination', to_jsonb(trip) ->> 'destination_label',
        'fare', to_jsonb(trip) ->> 'fare_amount', 'currency', to_jsonb(trip) ->> 'fare_currency',
        'createdAt', trip.created_at
      ) as row_data
      from public.transport_trips trip
      join public.transport_fleets fleet on fleet.id = trip.fleet_id
      where fleet.company_id = p_company_id
      order by trip.created_at desc
      limit 15
    ) recent), '[]'::jsonb),
    'governance', public.admin_target_governance('transport_company', p_company_id)
  );
end;
$$;

-- ===========================================================================
-- 7. Platform overview and searchable audit log
-- ===========================================================================

create or replace function public.admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.admin_has_permission('dashboard.view') then raise exception 'Not authorized'; end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users where coalesce(is_anonymous, false) = false),
      'new7d', (select count(*) from auth.users where coalesce(is_anonymous, false) = false and created_at > now() - interval '7 days'),
      'active7d', (select count(*) from auth.users where coalesce(is_anonymous, false) = false and last_sign_in_at > now() - interval '7 days'),
      'restricted', (select count(*) from public.platform_account_controls where status in ('warned', 'restricted') and (expires_at is null or expires_at > now())),
      'suspended', (select count(*) from public.platform_account_controls where status in ('suspended', 'banned') and (expires_at is null or expires_at > now()))
    ),
    'businesses', jsonb_build_object(
      'total', (select count(*) from public.marketplace_businesses),
      'new7d', (select count(*) from public.marketplace_businesses where created_at > now() - interval '7 days'),
      'pendingVerification', (select count(*) from public.marketplace_businesses business
        where lower(coalesce(to_jsonb(business) ->> 'verification_status', 'pending')) in ('pending', 'submitted', 'under_review', 'in_review')),
      'restricted', (select count(*) from public.admin_enforcement_states where target_type = 'marketplace_business' and status = 'restricted' and (ends_at is null or ends_at > now())),
      'suspended', (select count(*) from public.admin_enforcement_states where target_type = 'marketplace_business' and status = 'suspended' and (ends_at is null or ends_at > now()))
    ),
    'operators', jsonb_build_object(
      'total', (select count(*) from public.transport_operators),
      'approved', (select count(*) from public.transport_operators operator where lower(coalesce(to_jsonb(operator) ->> 'account_status', '')) = 'approved'),
      'pendingReview', (select count(*) from public.transport_operators operator
        where lower(coalesce(to_jsonb(operator) ->> 'account_status', '')) = 'submitted'
           or lower(coalesce(to_jsonb(operator) ->> 'verification_status', '')) in ('pending', 'submitted', 'under_review')),
      'restricted', (select count(*) from public.admin_enforcement_states where target_type = 'transport_operator' and status = 'restricted' and (ends_at is null or ends_at > now())),
      'suspended', (select count(*) from public.admin_enforcement_states where target_type = 'transport_operator' and status = 'suspended' and (ends_at is null or ends_at > now()))
    ),
    'companies', jsonb_build_object(
      'total', (select count(*) from public.transport_companies),
      'approved', (select count(*) from public.transport_companies where account_status = 'approved'),
      'pendingReview', (select count(*) from public.transport_companies where account_status = 'submitted' or verification_status in ('pending', 'submitted', 'under_review')),
      'restricted', (select count(*) from public.admin_enforcement_states where target_type = 'transport_company' and status = 'restricted' and (ends_at is null or ends_at > now())),
      'suspended', (select count(*) from public.admin_enforcement_states where target_type = 'transport_company' and status = 'suspended' and (ends_at is null or ends_at > now()))
    ),
    'governance', jsonb_build_object(
      'enforcementActions7d', (select count(*) from public.admin_enforcement_actions where created_at > now() - interval '7 days'),
      'directNotices7d', (select count(*) from public.admin_direct_notifications where created_at > now() - interval '7 days'),
      'adminActions24h', (select count(*) from public.admin_audit_logs where created_at > now() - interval '24 hours'),
      'activeStaff', (select count(*) from public.admin_staff_profiles where status = 'active'),
      'campaigns', (select count(*) from public.admin_notification_campaigns where created_at > now() - interval '30 days')
    ),
    'recentActions', coalesce((select jsonb_agg(entry) from (
      select jsonb_build_object(
        'id', log.id, 'actionKey', log.action_key, 'sector', log.sector, 'resourceType', log.resource_type,
        'resourceId', log.resource_id, 'reason', log.reason,
        'actor', coalesce(public.admin_display_name(log.actor_user_id), 'KunThai system'),
        'label', log.metadata ->> 'label', 'createdAt', log.created_at
      ) as entry
      from public.admin_audit_logs log
      order by log.created_at desc
      limit 8
    ) recent), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_search_audit_log(
  p_search text default null,
  p_actor_user_id uuid default null,
  p_action_prefix text default null,
  p_sector text default null,
  p_resource_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  actor_role_keys text[],
  action_key text,
  sector text,
  resource_type text,
  resource_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_pattern text := public.admin_like_pattern(p_search);
begin
  if not public.admin_has_permission('audit.view') then raise exception 'Not authorized'; end if;

  return query
  select log.id, log.actor_user_id,
    coalesce(public.admin_display_name(log.actor_user_id), 'KunThai system'),
    users.email::text, log.actor_role_keys, log.action_key, log.sector, log.resource_type, log.resource_id,
    log.reason, log.before_state, log.after_state, log.metadata, log.created_at,
    count(*) over ()
  from public.admin_audit_logs log
  left join auth.users users on users.id = log.actor_user_id
  where (v_pattern is null
      or lower(log.action_key) like v_pattern
      or lower(log.reason) like v_pattern
      or lower(coalesce(log.metadata ->> 'label', '')) like v_pattern
      or lower(coalesce(users.email, '')) like v_pattern
      or log.resource_id::text = lower(btrim(p_search)))
    and (p_actor_user_id is null or log.actor_user_id = p_actor_user_id)
    and (nullif(btrim(coalesce(p_action_prefix, '')), '') is null or log.action_key like btrim(p_action_prefix) || '%')
    and (nullif(btrim(coalesce(p_sector, '')), '') is null or log.sector = btrim(p_sector))
    and (nullif(btrim(coalesce(p_resource_type, '')), '') is null or log.resource_type = btrim(p_resource_type))
    and (p_from is null or log.created_at >= p_from)
    and (p_to is null or log.created_at < p_to)
  order by log.created_at desc, log.id
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;

-- ===========================================================================
-- 8. Grants
-- ===========================================================================

-- Internal helpers: never callable directly by clients.
revoke all on function public.admin_enforcement_target(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_assert_can_manage_staff(uuid) from public, anon, authenticated;
revoke all on function public.admin_expire_enforcements() from public, anon, authenticated;
revoke all on function public.admin_target_governance(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_owner_summary(uuid) from public, anon, authenticated;
revoke all on function public.admin_display_name(uuid) from public, anon, authenticated;
revoke all on function public.admin_ensure_staff_profile() from public, anon, authenticated;
revoke all on function public.admin_guard_self_assignment() from public, anon, authenticated;
revoke all on function public.enforce_marketplace_seller_capability() from public, anon, authenticated;
revoke all on function public.enforce_marketplace_order_capability() from public, anon, authenticated;
revoke all on function public.enforce_marketplace_messaging_capability() from public, anon, authenticated;
revoke all on function public.enforce_transport_trip_capability() from public, anon, authenticated;
revoke all on function public.enforce_transport_company_invite_capability() from public, anon, authenticated;

-- kunthai_enforcement_blocks, marketplace_is_business_staff and
-- transport_fleet_blocked stay executable by anon/authenticated: buyer and
-- passenger RLS policies call them.
revoke all on function public.kunthai_enforcement_status(text, uuid) from public, anon;
grant execute on function public.kunthai_enforcement_status(text, uuid) to authenticated;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_touch_presence()',
    'public.admin_list_staff()',
    'public.admin_get_staff_activity(uuid, integer)',
    'public.admin_update_staff_profile(uuid, text, text, text, uuid, text)',
    'public.admin_set_staff_status(uuid, text, text, timestamptz)',
    'public.admin_apply_enforcement(text, uuid, text, text, text, text, text[], timestamptz)',
    'public.admin_add_internal_note(text, uuid, text)',
    'public.admin_send_owner_notification(text, uuid, text, text, text, text)',
    'public.get_my_enforcement_notices()',
    'public.admin_list_marketplace_businesses(text, text[], text[], text[], text, text, timestamptz, timestamptz, text, integer, integer)',
    'public.admin_get_marketplace_business(uuid)',
    'public.admin_list_transport_operators(text, text[], text[], text[], text, text, text, text, timestamptz, timestamptz, text, integer, integer)',
    'public.admin_get_transport_operator(uuid)',
    'public.admin_list_transport_companies(text, text[], text[], text[], text, text, text, timestamptz, timestamptz, text, integer, integer)',
    'public.admin_get_transport_company(uuid)',
    'public.admin_platform_overview()',
    'public.admin_search_audit_log(text, uuid, text, text, text, timestamptz, timestamptz, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
