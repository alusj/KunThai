-- Approve and Approve & recommend are separate decisions; verification
-- notices go to the seller or operator dashboard.
--
--  1. Approve (operator, UrMall business registration, seller verification
--     request) sets verification_status 'verified' again. The new decision
--     'approve_recommend' ("Approve & recommend") sets 'verified_recommended'.
--     Other verification cases (companies, fleets, documents) only offer
--     Approve.
--  2. Request information now tells the person what KunThai needs.
--  3. A seller's verification notice is tagged workspace 'marketplace_seller'
--     and an operator's 'transport_operator', so it shows in that dashboard's
--     notifications instead of the buyer or passenger bell. The push opens
--     the seller dashboard.
--
-- Builds on 20261014180000_approve_sets_verified_recommended.sql.
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
      then '{"verification_status":"verified","account_status":"approved"}'::jsonb
    when p_resource_type = 'transport_operator_verification' and p_decision = 'approve_recommend'
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
      then '{"verification_status":"verified"}'::jsonb
    when p_resource_type = 'marketplace_business_registration' and p_decision = 'approve_recommend'
      then '{"verification_status":"verified_recommended"}'::jsonb
    when p_resource_type = 'marketplace_business_registration' and p_decision = 'reject'
      then '{"verification_status":"rejected"}'::jsonb
    when p_resource_type = 'marketplace_verification' and p_decision in ('approve', 'approve_recommend')
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
  if normalized_decision not in ('approve','approve_recommend','reject','dismiss','remove','restrict','suspend','resolve','request_information') then
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
       and normalized_decision in ('approve', 'approve_recommend', 'reject')
       and to_regclass('public.marketplace_businesses') is not null then
      v_business_id := nullif(v_before ->> 'business_id', '')::uuid;
      select business.verification_status into v_business_status
      from public.marketplace_businesses business where business.id = v_business_id for update;
      if found then
        update public.marketplace_businesses
        set verification_status = case normalized_decision when 'approve_recommend' then 'verified_recommended' when 'approve' then 'verified' else 'rejected' end,
            updated_at = now()
        where id = v_business_id;
        if not exists (
          select 1 from public.marketplace_businesses business
          where business.id = v_business_id
            and business.verification_status = case normalized_decision when 'approve_recommend' then 'verified_recommended' when 'approve' then 'verified' else 'rejected' end
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
      if decision_key in ('approve', 'approve_recommend', 'reject') and not public.admin_has_permission(v_verify, current_case.sector) then
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
        and verification_status = any(case when decision_key in ('approve', 'approve_recommend') then array['verified', 'verified_recommended'] else array['rejected'] end);
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
     and new.resolution_code in ('approve', 'approve_recommend', 'reject') then
    update public.marketplace_businesses
    set verification_status = case new.resolution_code
          when 'approve_recommend' then 'verified_recommended'
          when 'approve' then 'verified'
          else 'rejected'
        end,
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


-- ===========================================================================
-- Which admins may apply 'approve_recommend': the same as Approve, on the
-- cases that can be recommended. The existing check is kept as the core.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.admin_case_decision_check_core(public.admin_cases, text)') is null then
    alter function public.admin_case_decision_check(public.admin_cases, text) rename to admin_case_decision_check_core;
  end if;
end;
$$;

create or replace function public.admin_case_decision_check(p_case public.admin_cases, p_decision text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_check jsonb;
begin
  if v_decision <> 'approve_recommend' then
    return public.admin_case_decision_check_core(p_case, p_decision);
  end if;

  if p_case.resource_type not in ('transport_operator_verification', 'marketplace_business_registration', 'marketplace_verification') then
    return jsonb_build_object('key', v_decision, 'allowed', false, 'needsApproval', false, 'requiredAuthority', null,
      'requiredPermission', null, 'effect', null,
      'reason', 'Only operators and UrMall sellers can be recommended. Use Approve instead.');
  end if;

  v_check := public.admin_case_decision_check_core(p_case, 'approve');
  return v_check || jsonb_build_object(
    'key', v_decision,
    'effect', case when (v_check ->> 'allowed')::boolean then
      case when p_case.resource_type = 'transport_operator_verification'
        then 'Approves the operator as Verified Recommended.'
        else 'Approves the UrMall business as Verified Recommended.' end
    end
  );
end;
$$;

create or replace function public.admin_case_decision_capabilities(case_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_case public.admin_cases;
  v_decisions jsonb;
begin
  select * into target_case from public.admin_cases where id = case_uuid;
  if target_case.id is null then raise exception 'Case not found'; end if;
  if not public.admin_has_permission('cases.view', target_case.sector) then raise exception 'Not authorized'; end if;

  select jsonb_agg(public.admin_case_decision_check(target_case, decision.key) order by decision.position)
    into v_decisions
  from unnest(array['approve','approve_recommend','reject','request_information','restrict','remove','suspend','dismiss','resolve'])
    with ordinality as decision(key, position);

  return jsonb_build_object(
    'caseId', target_case.id,
    'resourceType', target_case.resource_type,
    'sector', target_case.sector,
    'status', target_case.status,
    'canManage', public.admin_has_permission('cases.manage', target_case.sector),
    'decisions', v_decisions,
    'allowed', coalesce((
      select jsonb_agg(item ->> 'key') from jsonb_array_elements(v_decisions) item where (item ->> 'allowed')::boolean
    ), '[]'::jsonb)
  );
end;
$$;

-- ===========================================================================
-- Decision notices reach the person in the right place.
-- Latest definition before this: 20260701100000_admin_user_notifications_and_retention.sql
-- ===========================================================================

create or replace function public.notify_user_of_admin_case_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  notification_title text;
  notification_body text;
  notification_workspace text;
  source jsonb := coalesce(new.metadata -> 'source', '{}'::jsonb);
begin
  if new.resolution_code is null
     or new.resolution_code is not distinct from old.resolution_code
     or new.resolution_code not in ('approve', 'approve_recommend', 'reject', 'remove', 'restrict', 'suspend', 'request_information') then
    return new;
  end if;
  -- Asking for more information only messages people being verified.
  if new.resolution_code = 'request_information' and new.queue <> 'verification' then
    return new;
  end if;

  target_user := new.subject_user_id;

  if new.resource_type = 'explore_post_report'
     and to_regclass('public.explore_post_reports') is not null
     and to_regclass('public.explore_posts') is not null then
    select post.user_id into target_user
    from public.explore_post_reports report
    join public.explore_posts post on post.id = report.post_id
    where report.id = new.resource_id;
  elsif new.resource_type = 'explore_comment_report'
     and to_regclass('public.explore_comment_reports') is not null
     and to_regclass('public.explore_post_comments') is not null then
    select comment.user_id into target_user
    from public.explore_comment_reports report
    join public.explore_post_comments comment on comment.id = report.comment_id
    where report.id = new.resource_id;
  elsif new.resource_type = 'explore_post'
     and to_regclass('public.explore_posts') is not null then
    select post.user_id into target_user from public.explore_posts post where post.id = new.resource_id;
  end if;

  if target_user is null and new.queue = 'verification' then
    target_user := new.reporter_user_id;
  end if;
  if target_user is null then
    target_user := nullif(coalesce(source ->> 'operator_user_id', source ->> 'owner_user_id', source ->> 'user_id'), '')::uuid;
  end if;
  if target_user is null then return new; end if;

  -- Seller and operator verification notices belong to their dashboards.
  notification_workspace := case
    when new.resource_type in ('marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document')
      then 'marketplace_seller'
    when new.resource_type in ('transport_operator_verification', 'transport_document_verification', 'transport_solo_fleet_verification')
      then 'transport_operator'
  end;

  notification_title := case new.resolution_code
    when 'approve' then 'Verification approved'
    when 'approve_recommend' then 'Verified and recommended'
    when 'reject' then 'Verification not approved'
    when 'request_information' then 'More information needed'
    when 'remove' then 'Content removed by KunThai'
    when 'restrict' then 'Account restriction applied'
    when 'suspend' then 'Account suspended'
  end;
  notification_body := coalesce(nullif(new.resolution_note, ''),
    case new.resolution_code
      when 'approve' then 'KunThai approved your submitted information.'
      when 'approve_recommend' then 'KunThai approved and recommended your account.'
      when 'reject' then 'KunThai could not approve your submitted information.'
      when 'request_information' then 'KunThai needs more information to finish reviewing your submission.'
      when 'remove' then 'KunThai removed content after an administrative review.'
      when 'restrict' then 'KunThai applied a restriction after an administrative review.'
      when 'suspend' then 'KunThai suspended this account after an administrative review.'
    end
  );

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, action_target, workspace
  ) values (
    target_user,
    coalesce(new.sector, 'platform'),
    case
      when new.resolution_code in ('approve', 'approve_recommend') then 'verification_approved'
      when new.resolution_code = 'request_information' then 'verification_information_requested'
      else 'moderation_action'
    end,
    notification_title,
    notification_body,
    case when new.resolution_code in ('remove', 'restrict', 'suspend') then 'high' else 'normal' end,
    -- The apps have no screen for an admin case; dashboard notices need no link.
    case when notification_workspace is null then 'admin-case:' || new.id::text end,
    coalesce(notification_workspace, 'platform')
  );
  return new;
end;
$$;

-- Push for a seller dashboard notice opens the seller dashboard.
-- Latest definition before this: 20261013140000_urride_push_deep_links.sql
create or replace function public.push_queue_platform_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sector text := lower(coalesce(new.sector, new.workspace, ''));
  v_allowed boolean;
  v_route text;
begin
  begin
    if new.campaign_id is not null or new.user_id is null
       or not ('push' = any(coalesce(new.channels, '{}'::text[])))
       or (new.expires_at is not null and new.expires_at <= now()) then
      return new;
    end if;
    v_allowed := case
      when v_sector = 'transport' then public.push_transport_recipient_allows(new.user_id)
      when v_sector = 'marketplace' then public.push_recipient_allows(new.user_id, 'commerce', null, null, null)
      else public.push_recipient_allows(new.user_id, 'platform', null, null, null)
    end;
    if not v_allowed then
      return new;
    end if;
    v_route := case
      when lower(coalesce(new.workspace, '')) = 'marketplace_seller' then 'urmall:business'
      when v_sector = 'transport' then public.push_urride_rental_route(new.action_target, new.user_id)
      else public.push_campaign_route(v_sector)
    end;
    insert into public.push_outbox (user_id, title, body, route, kind, dedupe_key)
    values (new.user_id,
            coalesce(nullif(public.push_short_text(new.title, 100), ''), 'KunThai'),
            public.push_short_text(new.body, 180),
            v_route,
            coalesce(nullif(new.notification_type, ''), 'activity'),
            'platform_notification:' || new.id::text)
    on conflict (dedupe_key) do nothing;
  exception when others then
    raise warning 'push_queue_platform_notification skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Verification notices already sent move to the matching dashboard. The
-- guard trigger keeps routing columns for non-admin writers, so it is off for
-- this update only.
alter table public.platform_notifications disable trigger guard_platform_notification_user_update_trigger;

update public.platform_notifications notice
set workspace = case
      when admin_case.resource_type in ('marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document')
        then 'marketplace_seller'
      else 'transport_operator'
    end,
    action_target = null
from public.admin_cases admin_case
where notice.action_target = 'admin-case:' || admin_case.id::text
  and notice.workspace not in ('marketplace_seller', 'transport_operator')
  and admin_case.resource_type in (
    'marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document',
    'transport_operator_verification', 'transport_document_verification', 'transport_solo_fleet_verification'
  );

alter table public.platform_notifications enable trigger guard_platform_notification_user_update_trigger;

revoke all on function public.admin_case_decision_check(public.admin_cases, text) from public, anon;
revoke all on function public.admin_case_decision_check_core(public.admin_cases, text) from public, anon;
revoke all on function public.admin_case_decision_capabilities(uuid) from public, anon;
grant execute on function public.admin_case_decision_capabilities(uuid) to authenticated;
revoke all on function public.admin_apply_case_decision(uuid, text, text) from public, anon;
grant execute on function public.admin_apply_case_decision(uuid, text, text) to authenticated;
revoke all on function public.admin_undo_case_action(uuid, uuid, text) from public, anon;
grant execute on function public.admin_undo_case_action(uuid, uuid, text) to authenticated;

commit;
