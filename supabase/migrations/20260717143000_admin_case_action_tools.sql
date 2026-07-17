-- Admin case action tools
-- Adds case-level action history, case undo, and real account-status undo.

create or replace function public.admin_get_case_action_history(
  target_case_uuid uuid,
  result_limit integer default 10
)
returns table (
  id uuid,
  actor_user_id uuid,
  action_key text,
  sector text,
  resource_type text,
  resource_id uuid,
  case_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz,
  can_undo boolean,
  undo_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_case public.admin_cases;
begin
  if not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  select * into target_case
  from public.admin_cases
  where admin_cases.id = target_case_uuid;

  if target_case.id is null then
    raise exception 'Case not found';
  end if;

  if not public.admin_has_permission('cases.view', target_case.sector) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    log.id,
    log.actor_user_id,
    log.action_key,
    log.sector,
    log.resource_type,
    log.resource_id,
    log.case_id,
    log.reason,
    log.before_state,
    log.after_state,
    log.metadata,
    log.created_at,
    (
      log.before_state is not null
      and log.action_key in ('case.claimed', 'case.status_changed', 'case.decision_applied')
      and (
        log.actor_user_id is not distinct from auth.uid()
        or public.admin_has_role(array['super_admin', 'chief_admin'])
      )
      and not exists (
        select 1
        from public.admin_audit_logs undo_log
        where undo_log.action_key = 'case.action_undone'
          and undo_log.metadata ->> 'undoneAuditLogId' = log.id::text
      )
    ) as can_undo,
    case
      when exists (
        select 1
        from public.admin_audit_logs undo_log
        where undo_log.action_key = 'case.action_undone'
          and undo_log.metadata ->> 'undoneAuditLogId' = log.id::text
      ) then 'undone'
      else 'active'
    end as undo_status
  from public.admin_audit_logs log
  where log.case_id = target_case_uuid
    and log.action_key in ('case.claimed', 'case.status_changed', 'case.decision_applied')
  order by log.created_at desc
  limit greatest(1, least(coalesce(result_limit, 10), 25));
end;
$$;

create or replace function public.admin_undo_case_action(
  target_case_uuid uuid,
  target_audit_log_uuid uuid default null,
  undo_reason text default ''
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public
as $$
declare
  current_case public.admin_cases;
  restored_case public.admin_cases;
  target_log public.admin_audit_logs;
  before_case jsonb;
  normalized_reason text := nullif(btrim(coalesce(undo_reason, '')), '');
  decision_key text;
  previous_control public.platform_account_controls;
begin
  if not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  select * into current_case
  from public.admin_cases
  where id = target_case_uuid
  for update;

  if current_case.id is null then
    raise exception 'Case not found';
  end if;

  if not public.admin_has_permission('cases.manage', current_case.sector) then
    raise exception 'Not authorized';
  end if;

  if target_audit_log_uuid is not null then
    select * into target_log
    from public.admin_audit_logs
    where id = target_audit_log_uuid
      and case_id = current_case.id;
  else
    select * into target_log
    from public.admin_audit_logs
    where case_id = current_case.id
      and action_key in ('case.claimed', 'case.status_changed', 'case.decision_applied')
    order by created_at desc
    limit 1;
  end if;

  if target_log.id is null then
    raise exception 'No undoable case action was found';
  end if;

  if target_log.action_key not in ('case.claimed', 'case.status_changed', 'case.decision_applied') then
    raise exception 'This case action cannot be undone from the case drawer';
  end if;

  if target_log.before_state is null then
    raise exception 'This action has no previous case state to restore';
  end if;

  if target_log.actor_user_id is distinct from auth.uid()
     and not public.admin_has_role(array['super_admin', 'chief_admin']) then
    raise exception 'Only the admin who performed this action, a Chief Admin, or a Super Admin can undo it';
  end if;

  if exists (
    select 1
    from public.admin_audit_logs undo_log
    where undo_log.action_key = 'case.action_undone'
      and undo_log.metadata ->> 'undoneAuditLogId' = target_log.id::text
  ) then
    raise exception 'This case action has already been undone';
  end if;

  before_case := target_log.before_state;

  update public.admin_cases
  set status = coalesce(nullif(before_case ->> 'status', ''), status),
      assignee_user_id = nullif(before_case ->> 'assignee_user_id', '')::uuid,
      assigned_at = nullif(before_case ->> 'assigned_at', '')::timestamptz,
      resolution_code = nullif(before_case ->> 'resolution_code', ''),
      resolution_note = nullif(before_case ->> 'resolution_note', ''),
      resolved_at = nullif(before_case ->> 'resolved_at', '')::timestamptz,
      closed_at = nullif(before_case ->> 'closed_at', '')::timestamptz,
      updated_at = timezone('utc', now())
  where id = current_case.id
  returning * into restored_case;

  decision_key := coalesce(target_log.metadata ->> 'decision', current_case.resolution_code, '');

  if target_log.action_key = 'case.decision_applied'
     and current_case.resource_type = 'urride_account_deletion_request'
     and decision_key in ('approve', 'restrict')
     and current_case.subject_user_id is not null
     and to_regclass('public.platform_account_controls') is not null then
    select * into previous_control
    from public.platform_account_controls
    where user_id = current_case.subject_user_id
    for update;

    if previous_control.status = 'restricted' then
      insert into public.platform_account_controls(user_id, status, reason, restricted_sectors, expires_at, updated_by)
      values (
        current_case.subject_user_id,
        'active',
        coalesce(normalized_reason, 'Case decision undone'),
        array['all']::text[],
        null,
        auth.uid()
      )
      on conflict (user_id) do update
      set status = 'active',
          reason = excluded.reason,
          restricted_sectors = array['all']::text[],
          expires_at = null,
          updated_by = auth.uid(),
          updated_at = timezone('utc', now());

      insert into public.platform_notifications(user_id, sector, notification_type, title, body, priority)
      values (
        current_case.subject_user_id,
        'platform',
        'account_status',
        'Your KunThai account access was restored',
        coalesce(normalized_reason, 'An administrative restriction was undone.'),
        'normal'
      );
    end if;
  end if;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
  values (
    restored_case.id,
    auth.uid(),
    'action_undone',
    current_case.status,
    restored_case.status,
    coalesce(normalized_reason, 'Case action undone'),
    jsonb_build_object(
      'undoneAuditLogId', target_log.id,
      'undoneActionKey', target_log.action_key,
      'decision', nullif(decision_key, '')
    )
  );

  perform public.admin_log_action(
    'case.action_undone',
    coalesce(target_log.sector, restored_case.sector, 'platform'),
    coalesce(target_log.resource_type, restored_case.resource_type),
    coalesce(target_log.resource_id, restored_case.resource_id),
    restored_case.id,
    coalesce(normalized_reason, 'Case action undone'),
    to_jsonb(current_case),
    to_jsonb(restored_case),
    jsonb_build_object(
      'undoneAuditLogId', target_log.id,
      'undoneActionKey', target_log.action_key,
      'decision', nullif(decision_key, '')
    )
  );

  if to_regclass('public.admin_activity_notifications') is not null then
    update public.admin_activity_notifications notification
    set metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object(
          'undoStatus', 'undone',
          'undoAppliedAt', timezone('utc', now()),
          'undoRequestedBy', auth.uid(),
          'undoReason', coalesce(normalized_reason, '')
        ),
        action_status = 'undone',
        action_note = coalesce(normalized_reason, 'Case action undone')
    where notification.audit_log_id = target_log.id;
  end if;

  return restored_case;
end;
$$;

create or replace function public.admin_undo_audit_action(
  target_audit_log_uuid uuid,
  undo_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_log public.admin_audit_logs;
  restored_case public.admin_cases;
  current_control public.platform_account_controls;
  restored_control public.platform_account_controls;
  restored_sectors text[] := array['all']::text[];
  normalized_reason text := nullif(btrim(coalesce(undo_reason, '')), '');
begin
  if not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  select * into target_log
  from public.admin_audit_logs
  where id = target_audit_log_uuid;

  if target_log.id is null then
    raise exception 'Audit record not found';
  end if;

  if exists (
    select 1
    from public.admin_audit_logs undo_log
    where undo_log.action_key in ('case.action_undone', 'user.status_change_undone')
      and undo_log.metadata ->> 'undoneAuditLogId' = target_log.id::text
  ) then
    raise exception 'This action has already been undone';
  end if;

  if target_log.action_key in ('case.claimed', 'case.status_changed', 'case.decision_applied') then
    restored_case := public.admin_undo_case_action(target_log.case_id, target_log.id, undo_reason);
    return jsonb_build_object(
      'status', 'undone',
      'message', 'Case action undone.',
      'caseId', restored_case.id,
      'notificationId', null
    );
  end if;

  if target_log.action_key = 'user.status_changed' then
    if target_log.actor_user_id is distinct from auth.uid()
       and not public.admin_has_role(array['super_admin', 'chief_admin']) then
      raise exception 'Only the admin who performed this action, a Chief Admin, or a Super Admin can undo it';
    end if;

    if not public.admin_has_permission('users.manage') then
      raise exception 'Not authorized';
    end if;

    if target_log.resource_id is null then
      raise exception 'This account action is missing its user target';
    end if;

    select * into current_control
    from public.platform_account_controls
    where user_id = target_log.resource_id
    for update;

    if target_log.before_state is null or target_log.before_state = 'null'::jsonb then
      delete from public.platform_account_controls
      where user_id = target_log.resource_id;
    else
      select coalesce(array_agg(sector_value), array['all']::text[])
      into restored_sectors
      from jsonb_array_elements_text(coalesce(target_log.before_state -> 'restricted_sectors', '["all"]'::jsonb)) as restored_sector(sector_value);

      insert into public.platform_account_controls(user_id, status, reason, restricted_sectors, expires_at, updated_by)
      values (
        target_log.resource_id,
        coalesce(nullif(target_log.before_state ->> 'status', ''), 'active'),
        coalesce(target_log.before_state ->> 'reason', ''),
        restored_sectors,
        nullif(target_log.before_state ->> 'expires_at', '')::timestamptz,
        auth.uid()
      )
      on conflict (user_id) do update
      set status = excluded.status,
          reason = excluded.reason,
          restricted_sectors = excluded.restricted_sectors,
          expires_at = excluded.expires_at,
          updated_by = auth.uid(),
          updated_at = timezone('utc', now())
      returning * into restored_control;
    end if;

    insert into public.platform_notifications(user_id, sector, notification_type, title, body, priority)
    values (
      target_log.resource_id,
      'platform',
      'account_status',
      case when restored_control.status is null or restored_control.status = 'active'
        then 'Your KunThai account access was restored'
        else 'Your KunThai account access was updated'
      end,
      coalesce(normalized_reason, 'An administrative account action was undone.'),
      'normal'
    );

    perform public.admin_log_action(
      'user.status_change_undone',
      'platform',
      'user',
      target_log.resource_id,
      null,
      coalesce(normalized_reason, 'Account status change undone'),
      to_jsonb(current_control),
      to_jsonb(restored_control),
      jsonb_build_object('undoneAuditLogId', target_log.id, 'undoneActionKey', target_log.action_key)
    );

    if to_regclass('public.admin_activity_notifications') is not null then
      update public.admin_activity_notifications notification
      set metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object(
            'undoStatus', 'undone',
            'undoAppliedAt', timezone('utc', now()),
            'undoRequestedBy', auth.uid(),
            'undoReason', coalesce(normalized_reason, '')
          ),
          action_status = 'undone',
          action_note = coalesce(normalized_reason, 'Account status change undone')
      where notification.audit_log_id = target_log.id;
    end if;

    return jsonb_build_object(
      'status', 'undone',
      'message', 'Account access restored to the previous state.',
      'userId', target_log.resource_id
    );
  end if;

  if to_regclass('public.admin_activity_notifications') is not null then
    update public.admin_activity_notifications notification
    set metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object(
          'undoStatus', 'undo_requested',
          'undoRequestedAt', timezone('utc', now()),
          'undoRequestedBy', auth.uid(),
          'undoReason', coalesce(normalized_reason, '')
        ),
        action_status = 'undo_requested',
        action_note = coalesce(normalized_reason, 'Undo requested')
    where notification.audit_log_id = target_log.id;
  end if;

  perform public.admin_log_action(
    'admin_action.undo_requested',
    coalesce(target_log.sector, 'platform'),
    coalesce(target_log.resource_type, 'admin_action'),
    target_log.resource_id,
    target_log.case_id,
    coalesce(normalized_reason, 'Undo requested'),
    to_jsonb(target_log),
    null,
    jsonb_build_object('requestedUndoAuditLogId', target_log.id)
  );

  return jsonb_build_object(
    'status', 'undo_requested',
    'message', 'Undo request recorded for Chief/Super Admin review.'
  );
end;
$$;

create or replace function public.admin_undo_activity_action(
  notification_uuid uuid,
  undo_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_notification public.admin_activity_notifications;
  result jsonb;
begin
  if not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  select * into target_notification
  from public.admin_activity_notifications
  where id = notification_uuid
    and recipient_user_id = auth.uid()
  for update;

  if target_notification.id is null then
    raise exception 'Notification not found';
  end if;

  if target_notification.notification_type <> 'admin_action' then
    raise exception 'Only admin action notifications can be undone';
  end if;

  if target_notification.actor_user_id is distinct from auth.uid() then
    raise exception 'Only the admin who performed this action can undo it';
  end if;

  if target_notification.audit_log_id is null then
    raise exception 'This notification is not connected to an audit record';
  end if;

  result := public.admin_undo_audit_action(target_notification.audit_log_id, undo_reason);

  update public.admin_activity_notifications notification
  set metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object('notificationId', target_notification.id),
      action_note = coalesce(nullif(btrim(undo_reason), ''), notification.action_note)
  where notification.id = target_notification.id;

  return result || jsonb_build_object('notificationId', target_notification.id);
end;
$$;

revoke all on function public.admin_get_case_action_history(uuid, integer) from public, anon;
revoke all on function public.admin_undo_case_action(uuid, uuid, text) from public, anon;
revoke all on function public.admin_undo_audit_action(uuid, text) from public, anon;
revoke all on function public.admin_undo_activity_action(uuid, text) from public, anon;
grant execute on function public.admin_get_case_action_history(uuid, integer) to authenticated;
grant execute on function public.admin_undo_case_action(uuid, uuid, text) to authenticated;
grant execute on function public.admin_undo_audit_action(uuid, text) to authenticated;
grant execute on function public.admin_undo_activity_action(uuid, text) to authenticated;
