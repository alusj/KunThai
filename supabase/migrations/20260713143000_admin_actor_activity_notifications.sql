-- Make admin activity notifications visible to the admin who performed the
-- action while preserving Chief/Super Admin oversight notifications.
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
      coalesce(
        users.raw_user_meta_data ->> 'display_name',
        users.raw_user_meta_data ->> 'full_name',
        split_part(users.email, '@', 1),
        'Administrator'
      ),
      coalesce(users.email, '')
    into actor_label, actor_email
    from auth.users users
    where users.id = new.actor_user_id;

    actor_label := coalesce(nullif(actor_label, ''), 'Administrator');
    actor_email := coalesce(actor_email, '');
  end if;

  insert into public.admin_activity_notifications (
    recipient_user_id,
    notification_type,
    title,
    body,
    priority,
    actor_user_id,
    audit_log_id,
    case_id,
    sector,
    action_key,
    resource_type,
    resource_id,
    metadata
  )
  select distinct
    assignment.user_id,
    'admin_action',
    'Admin action: ' || initcap(replace(replace(new.action_key, '.', ' '), '_', ' ')),
    actor_label || case when actor_email <> '' then ' (' || actor_email || ')' else '' end ||
      case when nullif(new.reason, '') is not null then ' - ' || new.reason else '' end,
    case when new.action_key like '%suspend%' or new.action_key like '%revoked%' then 'high' else 'normal' end,
    new.actor_user_id,
    new.id,
    new.case_id,
    coalesce(new.sector, 'platform'),
    new.action_key,
    new.resource_type,
    new.resource_id,
    jsonb_build_object(
      'actorName', actor_label,
      'actorEmail', actor_email,
      'actorRoles', new.actor_role_keys,
      'selfAction', assignment.user_id = new.actor_user_id
    )
  from public.admin_assignments assignment
  join public.admin_roles role on role.id = assignment.role_id
  where public.admin_assignment_is_active(assignment)
    and (
      role.role_key in ('super_admin', 'chief_admin')
      or assignment.user_id = new.actor_user_id
    )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.admin_notify_chiefs_of_audit() from public, anon, authenticated;
