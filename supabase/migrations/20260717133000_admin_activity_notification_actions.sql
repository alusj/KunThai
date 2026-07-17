-- Admin activity notification actions
-- Adds per-notification menu actions with database-enforced ownership and
-- actor-only undo handling.

alter table if exists public.admin_activity_notifications
  add column if not exists archived_at timestamptz,
  add column if not exists action_status text not null default 'active',
  add column if not exists action_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_activity_notifications_action_status_check'
      and conrelid = 'public.admin_activity_notifications'::regclass
  ) then
    alter table public.admin_activity_notifications
      add constraint admin_activity_notifications_action_status_check
      check (action_status in ('active', 'undo_requested', 'undone', 'dismissed'));
  end if;
end $$;

create index if not exists admin_activity_notifications_archived_idx
  on public.admin_activity_notifications(recipient_user_id, archived_at, created_at desc);

drop policy if exists "Admins update own activity notification state" on public.admin_activity_notifications;
create policy "Admins update own activity notification state"
on public.admin_activity_notifications for update to authenticated
using (recipient_user_id = auth.uid() and public.is_kunthai_admin())
with check (recipient_user_id = auth.uid() and public.is_kunthai_admin());

grant update(read_at, archived_at)
on public.admin_activity_notifications to authenticated;

create or replace function public.admin_update_activity_notification(
  notification_uuid uuid,
  next_action text
)
returns public.admin_activity_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_action text := lower(coalesce(nullif(btrim(next_action), ''), ''));
  updated_notification public.admin_activity_notifications;
begin
  if not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  if normalized_action not in ('read', 'unread', 'archive', 'restore') then
    raise exception 'Unsupported notification action';
  end if;

  update public.admin_activity_notifications notification
  set read_at = case
        when normalized_action = 'read' then coalesce(notification.read_at, now())
        when normalized_action = 'unread' then null
        else notification.read_at
      end,
      archived_at = case
        when normalized_action = 'archive' then coalesce(notification.archived_at, now())
        when normalized_action = 'restore' then null
        else notification.archived_at
      end,
      action_status = case
        when normalized_action = 'archive' then 'dismissed'
        when normalized_action = 'restore' and notification.action_status = 'dismissed' then 'active'
        else notification.action_status
      end
  where notification.id = notification_uuid
    and notification.recipient_user_id = auth.uid()
  returning * into updated_notification;

  if updated_notification.id is null then
    raise exception 'Notification not found';
  end if;

  return updated_notification;
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
  target_log public.admin_audit_logs;
  current_case public.admin_cases;
  restored_case public.admin_cases;
  before_case jsonb;
  normalized_reason text := nullif(btrim(coalesce(undo_reason, '')), '');
  undo_payload jsonb;
  undo_status text;
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

  select * into target_log
  from public.admin_audit_logs
  where id = target_notification.audit_log_id;

  if target_log.id is null then
    raise exception 'Audit record not found';
  end if;

  undo_status := coalesce(
    target_notification.metadata ->> 'undoStatus',
    target_notification.action_status,
    'active'
  );

  if undo_status in ('undo_requested', 'undone') then
    raise exception 'Undo has already been recorded for this action';
  end if;

  undo_payload := jsonb_build_object(
    'undoStatus', 'undo_requested',
    'undoRequestedAt', now(),
    'undoRequestedBy', auth.uid(),
    'undoReason', coalesce(normalized_reason, '')
  );

  if target_log.action_key in ('case.claimed', 'case.status_changed')
     and target_log.case_id is not null
     and target_log.before_state is not null then
    select * into current_case
    from public.admin_cases
    where id = target_log.case_id
    for update;

    if current_case.id is null then
      raise exception 'Case not found';
    end if;

    if not public.admin_has_permission('cases.manage', current_case.sector) then
      raise exception 'Not authorized';
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
        updated_at = now()
    where id = current_case.id
    returning * into restored_case;

    insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
    values (
      restored_case.id,
      auth.uid(),
      'action_undone',
      current_case.status,
      restored_case.status,
      coalesce(normalized_reason, 'Admin action undone from activity notification'),
      jsonb_build_object('undoneAuditLogId', target_log.id, 'notificationId', target_notification.id)
    );

    undo_payload := jsonb_build_object(
      'undoStatus', 'undone',
      'undoAppliedAt', now(),
      'undoRequestedBy', auth.uid(),
      'undoReason', coalesce(normalized_reason, ''),
      'undoneAuditLogId', target_log.id
    );

    update public.admin_activity_notifications notification
    set metadata = coalesce(notification.metadata, '{}'::jsonb) || undo_payload,
        action_status = 'undone',
        action_note = coalesce(normalized_reason, 'Action undone')
    where notification.audit_log_id = target_log.id;

    perform public.admin_log_action(
      'admin_action.undone',
      coalesce(target_log.sector, restored_case.sector, 'platform'),
      coalesce(target_log.resource_type, 'admin_action'),
      target_log.resource_id,
      target_log.case_id,
      coalesce(normalized_reason, 'Admin action undone'),
      to_jsonb(current_case),
      to_jsonb(restored_case),
      jsonb_build_object('undoneAuditLogId', target_log.id, 'notificationId', target_notification.id)
    );

    return jsonb_build_object(
      'status', 'undone',
      'message', 'Action undone.',
      'caseId', restored_case.id,
      'notificationId', target_notification.id
    );
  end if;

  update public.admin_activity_notifications notification
  set metadata = coalesce(notification.metadata, '{}'::jsonb) || undo_payload,
      action_status = 'undo_requested',
      action_note = coalesce(normalized_reason, 'Undo requested')
  where notification.audit_log_id = target_log.id;

  perform public.admin_log_action(
    'admin_action.undo_requested',
    coalesce(target_log.sector, target_notification.sector, 'platform'),
    coalesce(target_log.resource_type, target_notification.resource_type, 'admin_action'),
    coalesce(target_log.resource_id, target_notification.resource_id),
    target_log.case_id,
    coalesce(normalized_reason, 'Undo requested'),
    to_jsonb(target_log),
    null,
    jsonb_build_object('requestedUndoAuditLogId', target_log.id, 'notificationId', target_notification.id)
  );

  return jsonb_build_object(
    'status', 'undo_requested',
    'message', 'Undo request recorded for Chief/Super Admin review.',
    'notificationId', target_notification.id
  );
end;
$$;

revoke all on function public.admin_update_activity_notification(uuid, text) from public, anon;
revoke all on function public.admin_undo_activity_action(uuid, text) from public, anon;
grant execute on function public.admin_update_activity_notification(uuid, text) to authenticated;
grant execute on function public.admin_undo_activity_action(uuid, text) to authenticated;
