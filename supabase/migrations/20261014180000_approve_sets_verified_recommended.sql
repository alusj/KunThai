-- Approving an operator or a UrMall seller makes them "Verified Recommended".
--
-- Approve on these cases now writes verification_status 'verified_recommended':
--   transport_operator_verification   -> transport_operators
--   marketplace_business_registration -> marketplace_businesses
--   marketplace_verification          -> the request's business
-- The apps show that value as the green "Verified Recommended" badge.
-- Companies, fleets and documents still become 'verified'.
--
-- The registration sync trigger used to rewrite an approved business back to
-- 'verified' after the decision, so it changes too. Undo accepts either value.
--
-- Safe to run more than once.

begin;

-- Status columns a decision sets on the case's record (null = no change).
create or replace function public.admin_case_decision_state(p_resource_type text, p_decision text)
returns jsonb
language sql
immutable
as $$
  select case
    when p_resource_type = 'transport_operator_verification' and p_decision = 'approve'
      then '{"verification_status":"verified_recommended","account_status":"approved"}'::jsonb
    when p_resource_type = 'transport_operator_verification' and p_decision = 'reject'
      then '{"verification_status":"not_verified","account_status":"rejected"}'::jsonb
    when p_resource_type = 'transport_company_verification' and p_decision = 'approve'
      then '{"verification_status":"verified","account_status":"approved"}'::jsonb
    when p_resource_type = 'transport_company_verification' and p_decision = 'reject'
      then '{"verification_status":"rejected","account_status":"rejected"}'::jsonb
    when p_resource_type = 'transport_fleet_verification' and p_decision = 'approve'
      then '{"verification_status":"verified"}'::jsonb
    when p_resource_type = 'transport_fleet_verification' and p_decision = 'reject'
      then '{"verification_status":"rejected"}'::jsonb
    when p_resource_type = 'transport_solo_fleet_verification' and p_decision = 'approve'
      then '{"verification_status":"verified"}'::jsonb
    when p_resource_type = 'transport_solo_fleet_verification' and p_decision = 'reject'
      then '{"verification_status":"not_verified"}'::jsonb
    when p_resource_type = 'transport_document_verification' and p_decision = 'approve'
      then '{"status":"verified"}'::jsonb
    when p_resource_type = 'transport_document_verification' and p_decision = 'reject'
      then '{"status":"not_verified"}'::jsonb
    when p_resource_type = 'marketplace_business_registration' and p_decision = 'approve'
      then '{"verification_status":"verified_recommended"}'::jsonb
    when p_resource_type = 'marketplace_business_registration' and p_decision = 'reject'
      then '{"verification_status":"rejected"}'::jsonb
    when p_resource_type = 'marketplace_verification' and p_decision = 'approve'
      then '{"status":"approved"}'::jsonb
    when p_resource_type = 'marketplace_verification' and p_decision = 'reject'
      then '{"status":"rejected"}'::jsonb
    when p_resource_type = 'marketplace_verification' and p_decision in ('dismiss', 'resolve')
      then '{"status":"dismissed"}'::jsonb
    when p_resource_type = 'marketplace_business_document' and p_decision = 'approve'
      then '{"status":"verified"}'::jsonb
    when p_resource_type = 'marketplace_business_document' and p_decision = 'reject'
      then '{"status":"rejected"}'::jsonb
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
  normalized_decision text := lower(btrim(coalesce(decision_key, '')));
  normalized_reason text := btrim(coalesce(decision_reason, ''));
  v_check jsonb;
  v_state jsonb;
  v_extras jsonb;
  v_before jsonb;
  v_business_id uuid;
  v_business_status text;
  v_enforce text := null;
  v_meta jsonb := '{}'::jsonb;
  v_comment_to_delete uuid;
begin
  select * into target_case from public.admin_cases where id = case_uuid for update;
  if target_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.manage', target_case.sector) then raise exception 'Not authorized'; end if;
  if normalized_reason = '' then raise exception 'A decision reason is required'; end if;
  if normalized_decision not in ('approve','reject','dismiss','remove','restrict','suspend','resolve','request_information') then
    raise exception 'Unsupported decision';
  end if;

  v_check := public.admin_case_decision_check(target_case, normalized_decision);
  if not (v_check ->> 'allowed')::boolean then
    raise exception '%', v_check ->> 'reason';
  end if;

  if (v_check ->> 'needsApproval')::boolean then
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

  v_state := public.admin_case_decision_state(target_case.resource_type, normalized_decision);
  if normalized_decision = 'suspend' then
    v_enforce := public.admin_case_enforcement_type(target_case.resource_type);
  end if;

  if v_state is not null and public.admin_case_verification_permission(target_case.resource_type) is not null then
    -- Verification records: write the decision, then confirm it stuck (guard
    -- triggers silently keep the old status for staff without permission).
    v_extras := jsonb_build_object('reviewed_by', auth.uid(), 'reviewed_at', now(), 'updated_at', now());
    if target_case.resource_type = 'transport_operator_verification' then
      v_extras := v_extras || jsonb_build_object('verification_note', normalized_reason);
    elsif target_case.resource_type = 'transport_company_verification' then
      v_extras := v_extras || jsonb_build_object(
        'admin_note', normalized_reason,
        'rejection_reason', case when normalized_decision = 'reject' then normalized_reason end
      );
    elsif target_case.resource_type = 'transport_document_verification' then
      v_extras := v_extras || jsonb_build_object('admin_note', normalized_reason);
    end if;

    v_before := public.admin_case_write_target(target_case.resource_type, target_case.resource_id, v_extras || v_state);
    v_meta := jsonb_build_object(
      'targetTable', public.admin_case_target_table(target_case.resource_type),
      'targetBefore', (
        select jsonb_object_agg(item.key, v_before -> item.key)
        from jsonb_object_keys(v_state) as item(key)
        where v_before ? item.key
      )
    );

    if not public.admin_case_target_matches(target_case.resource_type, target_case.resource_id, v_state) then
      raise exception 'The decision did not change the record, so the case was left open. Check your verification permission and try again.';
    end if;

    if target_case.resource_type = 'marketplace_verification'
       and normalized_decision in ('approve', 'reject')
       and to_regclass('public.marketplace_businesses') is not null then
      v_business_id := nullif(v_before ->> 'business_id', '')::uuid;
      select business.verification_status into v_business_status
      from public.marketplace_businesses business where business.id = v_business_id for update;
      if found then
        update public.marketplace_businesses
        set verification_status = case when normalized_decision = 'approve' then 'verified_recommended' else 'rejected' end,
            updated_at = now()
        where id = v_business_id;
        if not exists (
          select 1 from public.marketplace_businesses business
          where business.id = v_business_id
            and business.verification_status = case when normalized_decision = 'approve' then 'verified_recommended' else 'rejected' end
        ) then
          raise exception 'The decision did not change the business, so the case was left open. Check your verification permission and try again.';
        end if;
        v_meta := v_meta || jsonb_build_object('businessId', v_business_id, 'businessBefore', jsonb_build_object('verification_status', v_business_status));
      end if;
    end if;
  elsif v_enforce is not null then
    perform public.admin_apply_enforcement(
      v_enforce, target_case.resource_id, 'suspension', 'other',
      normalized_reason, normalized_reason, '{}'::text[], null
    );
    if public.kunthai_enforcement_status(v_enforce, target_case.resource_id) <> 'suspended' then
      raise exception 'The suspension did not take effect, so the case was left open.';
    end if;
    v_meta := jsonb_build_object('enforcementType', v_enforce);
  elsif target_case.resource_type = 'explore_post_report' and to_regclass('public.explore_post_reports') is not null then
    update public.explore_post_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
    if normalized_decision in ('remove','restrict') and to_regclass('public.explore_posts') is not null then
      update public.explore_posts post set moderation_status = 'blocked'
      from public.explore_post_reports report where report.id = target_case.resource_id and post.id = report.post_id;
      if not exists (
        select 1 from public.explore_post_reports report
        join public.explore_posts post on post.id = report.post_id
        where report.id = target_case.resource_id and post.moderation_status = 'blocked'
      ) then
        raise exception 'The reported post no longer exists or could not be hidden. Dismiss the case instead.';
      end if;
    end if;
  elsif target_case.resource_type = 'explore_comment_report' and to_regclass('public.explore_comment_reports') is not null then
    update public.explore_comment_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
    if normalized_decision = 'remove' then
      select report.comment_id into v_comment_to_delete from public.explore_comment_reports report where report.id = target_case.resource_id;
      if v_comment_to_delete is null then
        raise exception 'The reported comment no longer exists. Dismiss the case instead.';
      end if;
    end if;
  elsif target_case.resource_type = 'explore_profile_report' and to_regclass('public.explore_profile_reports') is not null then
    update public.explore_profile_reports set status = case when normalized_decision = 'dismiss' then 'dismissed' else 'reviewed' end where id = target_case.resource_id;
  elsif target_case.resource_type = 'marketplace_case' and to_regclass('public.marketplace_seller_cases') is not null then
    update public.marketplace_seller_cases set status = case when normalized_decision = 'request_information' then 'in_review' else 'resolved' end,
      resolved_at = case when normalized_decision = 'request_information' then null else now() end, updated_at = now()
    where id = target_case.resource_id;
  elsif target_case.resource_type = 'transport_support' and to_regclass('public.transport_support_tickets') is not null then
    update public.transport_support_tickets set status = case when normalized_decision = 'request_information' then 'in_review' else 'resolved' end, updated_at = now()
    where id = target_case.resource_id;
  elsif target_case.resource_type = 'area_report' and to_regclass('public.nearby_area_reports') is not null then
    update public.nearby_area_reports
    set status = case when normalized_decision = 'approve' then 'verified' when normalized_decision = 'dismiss' then 'rejected' else 'cleared' end,
        updated_at = now()
    where id = target_case.resource_id;
  elsif target_case.resource_type = 'urmall_account_deletion_request' then
    if normalized_decision in ('approve','remove') and to_regclass('public.marketplace_businesses') is not null then
      delete from public.marketplace_businesses business
      where business.id = target_case.resource_id
        and (target_case.subject_user_id is null or business.user_id = target_case.subject_user_id);
    end if;
  elsif target_case.resource_type = 'urride_account_deletion_request' then
    if normalized_decision in ('approve','restrict') and to_regclass('public.platform_account_controls') is not null then
      insert into public.platform_account_controls(user_id, status, reason, restricted_sectors, updated_by)
      values (target_case.subject_user_id, 'restricted', normalized_reason, array['transport']::text[], auth.uid())
      on conflict (user_id) do update
      set status = 'restricted',
          reason = excluded.reason,
          restricted_sectors = array['transport']::text[],
          updated_by = auth.uid(),
          updated_at = now();
    end if;
  end if;

  update public.admin_cases
  set status = case when normalized_decision = 'request_information' then 'waiting_information' else 'resolved' end,
      resolution_code = normalized_decision,
      resolution_note = normalized_reason,
      resolved_at = case when normalized_decision = 'request_information' then null else now() end,
      updated_at = now()
  where id = case_uuid
  returning * into updated_case;

  -- Deleted after the case update so the author is still found for the notice.
  if v_comment_to_delete is not null and to_regclass('public.explore_post_comments') is not null then
    delete from public.explore_post_comments where id = v_comment_to_delete;
  end if;

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
  values (case_uuid, auth.uid(), 'decision_applied', target_case.status, updated_case.status, normalized_reason, jsonb_build_object('decision', normalized_decision));
  perform public.admin_log_action('case.decision_applied', target_case.sector, target_case.resource_type, target_case.resource_id, case_uuid, normalized_reason, to_jsonb(target_case), to_jsonb(updated_case), jsonb_build_object('decision', normalized_decision) || v_meta);
  return updated_case;
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
  v_state jsonb;
  v_verify text;
  v_restore jsonb;
  v_enforce text;
  v_business_id uuid;
  v_target_restored boolean := false;
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

  decision_key := coalesce(target_log.metadata ->> 'decision', current_case.resolution_code, '');

  -- Work out how the verification record goes back before touching anything.
  if target_log.action_key = 'case.decision_applied' then
    v_state := public.admin_case_decision_state(current_case.resource_type, decision_key);
    v_verify := public.admin_case_verification_permission(current_case.resource_type);
    if v_state is not null and v_verify is not null then
      if decision_key in ('approve', 'reject') and not public.admin_has_permission(v_verify, current_case.sector) then
        raise exception 'Only staff with % verification permission can undo this decision.',
          case when v_verify = 'transport.verify' then 'UrRide' else 'UrMall' end;
      end if;
      select jsonb_object_agg(
          item.key,
          coalesce(target_log.metadata -> 'targetBefore' -> item.key, public.admin_case_pending_state(current_case.resource_type) -> item.key)
        )
        into v_restore
      from jsonb_object_keys(v_state) as item(key);
    end if;
    if decision_key = 'suspend' then
      v_enforce := coalesce(target_log.metadata ->> 'enforcementType', public.admin_case_enforcement_type(current_case.resource_type));
    end if;
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

  -- Put the record back, unless the owner has changed it since (for example
  -- by resubmitting after a rejection).
  if v_restore is not null
     and public.admin_case_target_matches(current_case.resource_type, current_case.resource_id, v_state) then
    perform public.admin_case_write_target(
      current_case.resource_type, current_case.resource_id,
      v_restore || jsonb_build_object('updated_at', now())
    );
    if not public.admin_case_target_matches(current_case.resource_type, current_case.resource_id, v_restore) then
      raise exception 'The record could not be returned to its previous status, so nothing was undone.';
    end if;
    v_target_restored := true;

    v_business_id := nullif(target_log.metadata ->> 'businessId', '')::uuid;
    if v_business_id is not null and to_regclass('public.marketplace_businesses') is not null then
      update public.marketplace_businesses
      set verification_status = coalesce(target_log.metadata -> 'businessBefore' ->> 'verification_status', 'pending'),
          updated_at = now()
      where id = v_business_id
        and verification_status = any(case when decision_key = 'approve' then array['verified', 'verified_recommended'] else array['rejected'] end);
    end if;
  end if;

  if v_enforce is not null
     and public.kunthai_enforcement_status(v_enforce, current_case.resource_id) <> 'active' then
    perform public.admin_apply_enforcement(
      v_enforce, current_case.resource_id, 'restoration', 'error_correction',
      'A suspension applied in error has been lifted. ' || coalesce(normalized_reason, ''),
      coalesce(normalized_reason, 'Case decision undone'), '{}'::text[], null
    );
    v_target_restored := true;
  end if;

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
      'decision', nullif(decision_key, ''),
      'recordRestored', v_target_restored
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
      'decision', nullif(decision_key, ''),
      'recordRestored', v_target_restored,
      'recordValues', v_restore
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

-- Keeps the record behind a registration case in step with its decision.
-- Latest definition before this: 20260701010000_registration_admin_intake_and_evidence.sql
create or replace function public.admin_sync_registration_case_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolution_code is null or new.resolution_code is not distinct from old.resolution_code then
    return new;
  end if;

  if new.resource_type = 'area_location_verification'
     and to_regclass('public.nearby_area_locations') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.nearby_area_locations
    set status = case when new.resolution_code = 'approve' then 'approved' else 'rejected' end,
        visibility = case when new.resolution_code = 'approve' then 'public' else 'private' end,
        admin_decision = new.resolution_code,
        admin_decision_reason = nullif(new.resolution_note, ''),
        admin_decided_at = now(),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'adminDecision', new.resolution_code,
          'adminDecisionReason', coalesce(nullif(new.resolution_note, ''), ''),
          'adminDecidedAt', now()
        ),
        updated_at = now()
    where id = new.resource_id;
  elsif new.resource_type = 'marketplace_business_registration'
     and to_regclass('public.marketplace_businesses') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.marketplace_businesses
    set verification_status = case when new.resolution_code = 'approve' then 'verified_recommended' else 'rejected' end,
        updated_at = now()
    where id = new.resource_id;
  elsif new.resource_type = 'transport_solo_fleet_verification'
     and to_regclass('public.transport_fleets') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.transport_fleets
    set verification_status = case
          when new.resolution_code = 'approve' then 'verified'::public.transport_verification_status
          else 'not_verified'::public.transport_verification_status
        end,
        updated_at = now()
    where id = new.resource_id;
  end if;
  return new;
end;
$$;

revoke all on function public.admin_apply_case_decision(uuid, text, text) from public, anon;
grant execute on function public.admin_apply_case_decision(uuid, text, text) to authenticated;
revoke all on function public.admin_undo_case_action(uuid, uuid, text) from public, anon;
grant execute on function public.admin_undo_case_action(uuid, uuid, text) to authenticated;

commit;
