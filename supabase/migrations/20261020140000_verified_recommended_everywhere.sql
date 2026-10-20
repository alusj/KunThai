-- "Verified" and "Verified & recommended" across UrRide and UrMall.
--
--  1. Restores Approve & recommend. The decision functions from
--     20261015090000_approve_and_recommend_decisions.sql were replaced on the
--     live database by their older 20261008160000 versions, so the decision
--     was never offered. They are restored here (state, apply, undo, check,
--     capabilities); the notice and push parts of that migration are live.
--  2. UrRide companies and company vehicles get the recommended level:
--     Approve & recommend sets 'verified_recommended'. A company vehicle can
--     be recommended only once its company is verified. The level reaches
--     the operator's runtime fleet and the public company profile.
--  3. Closes two loopholes: only reviewers may set 'verified_recommended'
--     (a seller creating a business, or an operator editing a solo vehicle,
--     could set it before). Every guard that protects 'verified' now
--     protects 'verified_recommended' too.
--
-- Guards and public functions are their live definitions with only the
-- verified/recommended lines changed. Safe to run more than once.

begin;

alter table public.transport_companies drop constraint if exists transport_companies_verification_status_check;
alter table public.transport_companies add constraint transport_companies_verification_status_check
  check (verification_status in ('pending', 'pending_review', 'under_review', 'verified', 'verified_recommended', 'rejected', 'suspended'));

alter table public.transport_company_fleets drop constraint if exists transport_company_fleets_verification_status_check;
alter table public.transport_company_fleets add constraint transport_company_fleets_verification_status_check
  check (verification_status in ('pending_review', 'pending', 'under_review', 'verified', 'verified_recommended', 'rejected', 'suspended'));

-- ---------------------------------------------------------------------------
-- 1 and 2. Decisions (from 20261015090000, plus companies and company vehicles)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.admin_case_decision_check_core(public.admin_cases, text)') is null then
    alter function public.admin_case_decision_check(public.admin_cases, text) rename to admin_case_decision_check_core;
  end if;
end;
$$;

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
    when p_resource_type = 'transport_company_verification' and p_decision = 'approve_recommend'
      then '{"verification_status":"verified_recommended","account_status":"approved"}'::jsonb
    when p_resource_type = 'transport_company_verification' and p_decision = 'reject'
      then '{"verification_status":"rejected","account_status":"rejected"}'::jsonb
    when p_resource_type = 'transport_fleet_verification' and p_decision = 'approve'
      then '{"verification_status":"verified"}'::jsonb
    when p_resource_type = 'transport_fleet_verification' and p_decision = 'approve_recommend'
      then '{"verification_status":"verified_recommended"}'::jsonb
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

  if p_case.resource_type not in (
    'transport_operator_verification', 'transport_company_verification', 'transport_fleet_verification',
    'marketplace_business_registration', 'marketplace_verification'
  ) then
    return jsonb_build_object('key', v_decision, 'allowed', false, 'needsApproval', false, 'requiredAuthority', null,
      'requiredPermission', null, 'effect', null,
      'reason', 'Only operators, UrRide companies and their vehicles, and UrMall sellers can be recommended. Use Approve instead.');
  end if;

  -- A company vehicle is recommended only under a verified company.
  if p_case.resource_type = 'transport_fleet_verification' and not exists (
    select 1
    from public.transport_company_fleets fleet
    join public.transport_companies company on company.id = fleet.company_id
    where fleet.id = p_case.resource_id
      and company.verification_status in ('verified', 'verified_recommended')
  ) then
    return jsonb_build_object('key', v_decision, 'allowed', false, 'needsApproval', false, 'requiredAuthority', null,
      'requiredPermission', null, 'effect', null,
      'reason', 'Verify the company first. Until then the vehicle can only be approved.');
  end if;

  v_check := public.admin_case_decision_check_core(p_case, 'approve');
  return v_check || jsonb_build_object(
    'key', v_decision,
    'effect', case when (v_check ->> 'allowed')::boolean then
      case p_case.resource_type
        when 'transport_operator_verification' then 'Approves the operator as Verified Recommended.'
        when 'transport_company_verification' then 'Approves the company as Verified Recommended.'
        when 'transport_fleet_verification' then 'Approves the company vehicle as Verified Recommended.'
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

-- ---------------------------------------------------------------------------
-- 2 and 3. Guards and public profiles (live definitions, verified lines only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_marketplace_business_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not public.admin_has_permission('marketplace.verify', 'marketplace') then
    if tg_op = 'INSERT' then
      if new.verification_status in ('verified', 'approved', 'verified_recommended', 'recommended') then
        new.verification_status := 'pending';
      end if;
    elsif not (
      old.verification_status in ('not_verified', 'rejected')
      and new.verification_status in ('submitted', 'pending')
    ) then
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketplace_require_registration_documents()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  missing_requirement record;
begin
  if new.verification_status in ('verified', 'approved', 'verified_recommended')
     and old.verification_status is distinct from new.verification_status then
    select requirement.* into missing_requirement
    from public.kunthai_get_document_requirements(
      'urmall',
      'seller',
      coalesce(nullif(new.country_iso, ''), nullif(new.country, '')),
      null
    ) requirement
    where requirement.required = true
      and not exists (
        select 1
        from public.marketplace_business_documents document
        where document.business_id = new.id
          and lower(document.document_type) = lower(coalesce(requirement.legacy_document_type, requirement.field_key))
      )
    order by requirement.sort_order
    limit 1;

    if found then
      raise exception '% (%) is required before approval.',
        missing_requirement.label,
        coalesce(nullif(missing_requirement.inline_note, ''), 'if applicable');
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_transport_operator_insert_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.kunthai_can_review_transport() then return new; end if;
  if new.verification_status::text in ('verified', 'verified_recommended') then
    new.verification_status := 'verification_pending'::public.transport_verification_status;
  end if;
  if coalesce(new.account_status, '') in ('approved', 'rejected', 'suspended') then
    new.account_status := 'submitted';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_transport_operator_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  requested_account_status text;
  resubmitting boolean;
begin
  if not public.admin_has_permission('transport.verify', 'transport') then
    requested_account_status := coalesce(to_jsonb(new) ->> 'account_status', '');
    resubmitting := coalesce(to_jsonb(old) ->> 'account_status', '') = 'rejected'
      and requested_account_status in ('submitted', 'pending_review')
      and coalesce(to_jsonb(old) ->> 'verification_status', '') not in ('verified', 'verified_recommended');
    new := jsonb_populate_record(new, jsonb_build_object(
      'account_status', to_jsonb(old) -> 'account_status',
      'verification_status', to_jsonb(old) -> 'verification_status',
      'verification_note', to_jsonb(old) -> 'verification_note',
      'reviewed_at', to_jsonb(old) -> 'reviewed_at',
      'reviewed_by', to_jsonb(old) -> 'reviewed_by',
      'wallet_balance', to_jsonb(old) -> 'wallet_balance',
      'pending_payout', to_jsonb(old) -> 'pending_payout'
    ));
    if resubmitting then
      new := jsonb_populate_record(new, jsonb_build_object(
        'account_status', requested_account_status,
        'verification_status', 'verification_pending'
      ));
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_transport_fleet_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  company_fleet_status text;
begin
  -- Fleets are updated constantly (location, availability); only writes that
  -- touch verification or the company link need checking.
  if tg_op = 'UPDATE'
    and new.verification_status is not distinct from old.verification_status
    and new.company_fleet_id is not distinct from old.company_fleet_id then
    return new;
  end if;
  if public.kunthai_can_review_transport() then return new; end if;

  if new.company_fleet_id is not null then
    select verification_status into company_fleet_status
    from public.transport_company_fleets where id = new.company_fleet_id;
    new.verification_status := (case company_fleet_status
      when 'verified' then 'verified'
      when 'verified_recommended' then 'verified_recommended'
      when 'rejected' then 'not_verified'
      when 'suspended' then 'not_verified'
      else 'verification_pending'
    end)::public.transport_verification_status;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification_status::text in ('verified', 'verified_recommended') then
      new.verification_status := 'verification_pending'::public.transport_verification_status;
    end if;
    return new;
  end if;

  if old.verification_status::text in ('verified', 'verified_recommended') or new.verification_status::text in ('verified', 'verified_recommended') then
    new.verification_status := old.verification_status;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_transport_company_fleet_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  verdict_states constant text[] := array['verified', 'verified_recommended', 'rejected', 'suspended'];
begin
  if tg_op = 'UPDATE' and new.verification_status is not distinct from old.verification_status then return new; end if;
  if public.kunthai_can_review_transport() then return new; end if;
  if tg_op = 'INSERT' then
    if new.verification_status = any(verdict_states) then new.verification_status := 'pending_review'; end if;
    return new;
  end if;
  if old.verification_status = any(verdict_states) or new.verification_status = any(verdict_states) then
    new.verification_status := old.verification_status;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_transport_company_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_states constant text[] := array['approved', 'rejected', 'suspended'];
  verdict_states constant text[] := array['verified', 'verified_recommended', 'rejected', 'suspended'];
  resubmitting boolean := false;
begin
  if public.kunthai_can_review_transport() then return new; end if;

  if tg_op = 'INSERT' then
    if new.verification_status = any(verdict_states) then new.verification_status := 'pending'; end if;
    if new.account_status = any(admin_states) then new.account_status := 'submitted'; end if;
    return new;
  end if;

  -- A rejected (never a suspended) company may send its application again.
  resubmitting := (old.account_status = 'rejected' or old.verification_status = 'rejected')
    and old.account_status <> 'suspended'
    and old.verification_status <> 'suspended'
    and (new.account_status = 'submitted' or new.verification_status in ('pending', 'pending_review'));

  if resubmitting then
    new.account_status := 'submitted';
    new.verification_status := case when new.verification_status = 'pending_review' then 'pending_review' else 'pending' end;
  else
    if old.verification_status = any(verdict_states) or new.verification_status = any(verdict_states) then
      new.verification_status := old.verification_status;
    end if;
    if old.account_status = any(admin_states) or new.account_status = any(admin_states) then
      new.account_status := old.account_status;
    end if;
  end if;
  -- Review notes stay as the admin left them (keys for columns a database
  -- does not have are ignored).
  new := jsonb_populate_record(new, jsonb_build_object(
    'admin_note', to_jsonb(old) -> 'admin_note',
    'rejection_reason', to_jsonb(old) -> 'rejection_reason',
    'reviewed_by', to_jsonb(old) -> 'reviewed_by',
    'reviewed_at', to_jsonb(old) -> 'reviewed_at'
  ));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transport_company_provision_runtime_fleet(company_fleet_uuid uuid, operator_uuid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  company_fleet public.transport_company_fleets%rowtype;
  company_record public.transport_companies%rowtype;
  runtime_fleet_id uuid;
  runtime_service_category public.transport_service_category;
  runtime_fleet_type public.transport_fleet_type;
  runtime_verification public.transport_verification_status;
  runtime_active_status text;
  runtime_visible boolean;
  runtime_country_iso text;
  runtime_country text;
  runtime_currency text;
begin
  if company_fleet_uuid is null or operator_uuid is null then
    return null;
  end if;

  select * into company_fleet
  from public.transport_company_fleets
  where id = company_fleet_uuid
  for update;

  if not found then
    return null;
  end if;

  select * into company_record
  from public.transport_companies
  where id = company_fleet.company_id;

  runtime_service_category := case company_fleet.service_category
    when 'Ride only' then 'transport'::public.transport_service_category
    when 'Delivery only' then 'delivery'::public.transport_service_category
    else 'both'::public.transport_service_category
  end;
  runtime_fleet_type := case company_fleet.fleet_type
    when 'Motorbike' then 'motorcycle'::public.transport_fleet_type
    when 'Tricycle' then 'tricycle'::public.transport_fleet_type
    else 'car'::public.transport_fleet_type
  end;
  runtime_verification := case company_fleet.verification_status
    when 'verified' then 'verified'::public.transport_verification_status
    when 'verified_recommended' then 'verified_recommended'::public.transport_verification_status
    when 'rejected' then 'not_verified'::public.transport_verification_status
    when 'suspended' then 'not_verified'::public.transport_verification_status
    else 'verification_pending'::public.transport_verification_status
  end;
  -- Provisioning an assignment is not an operator request to go on duty.
  -- Preserve only this same operator's runtime availability, never stale company metadata.
  select case when fleet.active_status = 'active' then 'active' else 'offline' end
  into runtime_active_status from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id and fleet.operator_id = operator_uuid;
  runtime_active_status := coalesce(runtime_active_status, 'offline');
  runtime_visible := coalesce(company_fleet.is_visible_to_passengers, false) and runtime_active_status = 'active';
  runtime_country_iso := public.kunthai_resolve_country_iso(
    coalesce(nullif(company_record.country_iso, ''), nullif(company_record.country, ''))
  );
  runtime_country := coalesce(nullif(company_record.country, ''), runtime_country_iso);
  runtime_currency := public.kunthai_resolve_currency(
    runtime_country_iso,
    nullif(company_record.currency, '')
  );

  select fleet.id into runtime_fleet_id
  from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id
  limit 1;

  -- A company's runtime row is identified only by company_fleet_id.
  -- Reusing an operator's same-plate solo/other-company row would transfer
  -- its history and dispatch access to this company.

  if runtime_fleet_id is null then
    insert into public.transport_fleets (
      operator_id,
      service_category,
      fleet_type,
      fleet_name,
      plate_number,
      make,
      model,
      manufacture_year,
      color,
      operating_area,
      home_base_location,
      safety_answers,
      verification_status,
      active_status,
      is_visible_to_passengers,
      accepts_ride,
      accepts_delivery,
      country,
      country_iso,
      currency,
      company_id,
      company_fleet_id,
      fleet_code,
      public_fleet_photos,
      updated_at
    ) values (
      operator_uuid,
      runtime_service_category,
      runtime_fleet_type,
      coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), 'NO-PLATE'),
      company_fleet.make,
      company_fleet.model,
      company_fleet.manufacture_year,
      company_fleet.color,
      coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      coalesce(company_fleet.safety_answers, '{}'::jsonb),
      runtime_verification,
      runtime_active_status,
      runtime_visible,
      company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      runtime_country,
      runtime_country_iso,
      runtime_currency,
      company_fleet.company_id,
      company_fleet.id,
      company_fleet.fleet_code,
      coalesce(company_fleet.public_fleet_photos, '[]'::jsonb),
      now()
    )
    returning id into runtime_fleet_id;
  else
    update public.transport_fleets
    set
      operator_id = operator_uuid,
      service_category = runtime_service_category,
      fleet_type = runtime_fleet_type,
      fleet_name = coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      plate_number = coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), plate_number),
      make = company_fleet.make,
      model = company_fleet.model,
      manufacture_year = company_fleet.manufacture_year,
      color = company_fleet.color,
      operating_area = coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      home_base_location = coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      safety_answers = coalesce(company_fleet.safety_answers, '{}'::jsonb),
      verification_status = runtime_verification,
      active_status = runtime_active_status,
      is_visible_to_passengers = runtime_visible,
      accepts_ride = company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      accepts_delivery = company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      country = coalesce(nullif(company_record.country, ''), country),
      country_iso = coalesce(nullif(runtime_country_iso, ''), country_iso),
      currency = coalesce(nullif(runtime_currency, ''), currency),
      company_id = company_fleet.company_id,
      company_fleet_id = company_fleet.id,
      fleet_code = company_fleet.fleet_code,
      public_fleet_photos = coalesce(company_fleet.public_fleet_photos, public_fleet_photos),
      updated_at = now()
    where id = runtime_fleet_id;
  end if;

  update public.transport_company_fleets
  set
    operator_id = operator_uuid,
    transport_fleet_id = runtime_fleet_id,
    updated_at = now()
  where id = company_fleet.id;

  return runtime_fleet_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_transport_company_profile(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  result jsonb;
begin
  if not public.transport_company_has_public_profile(p_company_id) then
    return null;
  end if;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id,
      'company_name', c.company_name,
      'company_code', c.company_code,
      'company_type', c.company_type,
      'phone', c.phone,
      'email', c.email,
      'country', c.country,
      'city', c.city,
      'address', c.address,
      'operating_areas', c.operating_areas,
      'support_policy', c.support_policy,
      'verification_status', c.verification_status,
      'fleet_count', coalesce(fleet_summary.fleet_count, 0),
      'rental_count', coalesce(rental_summary.rental_count, 0),
      'rating', coalesce(review_summary.rating, 0),
      'review_count', coalesce(review_summary.review_count, 0)
    ),
    'fleets', coalesce(fleets.items, '[]'::jsonb),
    'rentals', coalesce(rentals.items, '[]'::jsonb),
    'reviews', coalesce(reviews.items, '[]'::jsonb)
  ) into result
  from public.transport_companies c
  left join lateral (
    select count(*)::integer as fleet_count
    from public.transport_company_fleets cf
    left join public.transport_fleets tf on tf.company_fleet_id = cf.id
    where cf.company_id = c.id and cf.service_category <> 'Rental'
      and (cf.verification_status in ('verified', 'verified_recommended') or tf.id is not null)
  ) fleet_summary on true
  left join lateral (
    select count(*)::integer as rental_count
    from public.transport_company_rentals rental
    where rental.company_id = c.id and rental.status = 'available' and rental.deleted_at is null
  ) rental_summary on true
  left join lateral (
    select coalesce(avg(review.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
    from public.transport_company_reviews review where review.company_id = c.id
  ) review_summary on true
  left join lateral (
    select jsonb_agg(item order by item->>'fleet_type', item->>'fleet_name') as items
    from (
      select jsonb_build_object(
        'company_fleet_id', cf.id,
        'runtime_fleet_id', case when coalesce(tf.is_visible_to_passengers, false) then tf.id else null end,
        'fleet_code', cf.fleet_code,
        'fleet_name', coalesce(nullif(btrim(cf.fleet_name), ''), cf.fleet_type || ' fleet'),
        'fleet_type', cf.fleet_type,
        'service_category', cf.service_category,
        'operator_name', op.full_name,
        'operator_code', coalesce(op.display_code, op.operator_code::text),
        'plate_number', cf.plate_number,
        'make', cf.make,
        'model', cf.model,
        'color', cf.color,
        'verification_status', cf.verification_status,
        'active_status', coalesce(tf.active_status, cf.active_status),
        'is_available', coalesce(tf.is_visible_to_passengers, false) and coalesce(tf.active_status, '') = 'active',
        'rating', coalesce(operator_reviews.rating, 0),
        'review_count', coalesce(operator_reviews.review_count, 0),
        'photos', coalesce(tf.public_fleet_photos, cf.public_fleet_photos, '[]'::jsonb)
      ) as item
      from public.transport_company_fleets cf
      left join lateral (
        select runtime.* from public.transport_fleets runtime
        where runtime.company_fleet_id = cf.id
        order by runtime.updated_at desc limit 1
      ) tf on true
      left join public.transport_operators op on op.id = tf.operator_id
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = 'accepted'
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )
      left join lateral (
        select coalesce(avg(r.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
        from public.transport_operator_reviews r where r.operator_id = op.id
      ) operator_reviews on true
      where cf.company_id = c.id and cf.service_category <> 'Rental'
        and (cf.verification_status in ('verified', 'verified_recommended') or tf.id is not null)
    ) public_fleet
  ) fleets on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', rental.id,
      'title', rental.title,
      'fleet_code', cf.fleet_code,
      'fleet_type', cf.fleet_type,
      'status', rental.status,
      'currency', rental.currency,
      'rate_per_hour', rental.hourly_rate,
      'rate_per_day', rental.daily_rate,
      'rate_per_week', rental.weekly_rate,
      'distance_rate', rental.distance_rate,
      'time_negotiable', rental.time_negotiable,
      'distance_negotiable', rental.distance_negotiable,
      'pickup_address', rental.pickup_address,
      'photos', to_jsonb(rental.photos)
    ) order by rental.updated_at desc) as items
    from public.transport_company_rentals rental
    join public.transport_company_fleets cf on cf.id = rental.company_fleet_id
    where rental.company_id = c.id and rental.status = 'available' and rental.deleted_at is null
  ) rentals on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', review.id,
      'passenger_name', review.passenger_name,
      'rating', review.rating,
      'review_text', review.review_text,
      'company_response', review.company_response,
      'created_at', review.created_at,
      'responded_at', review.responded_at
    ) order by review.created_at desc) as items
    from (
      select * from public.transport_company_reviews
      where company_id = c.id order by created_at desc limit 50
    ) review
  ) reviews on true
  where c.id = p_company_id;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_public_transport_companies(p_query text, p_country text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select jsonb_build_object(
    'id', c.id,
    'company_name', c.company_name,
    'company_code', c.company_code,
    'company_type', c.company_type,
    'country', c.country,
    'city', c.city,
    'verification_status', c.verification_status,
    'fleet_types', coalesce(fleet_summary.fleet_types, '[]'::jsonb),
    'fleet_count', coalesce(fleet_summary.fleet_count, 0),
    'rental_count', coalesce(rental_summary.rental_count, 0),
    'rating', coalesce(review_summary.rating, 0),
    'review_count', coalesce(review_summary.review_count, 0)
  )
  from public.transport_companies c
  left join lateral (
    select
      count(distinct cf.id)::integer as fleet_count,
      coalesce(jsonb_agg(distinct cf.fleet_type) filter (where cf.fleet_type is not null), '[]'::jsonb) as fleet_types
    from public.transport_company_fleets cf
    left join public.transport_fleets tf on tf.company_fleet_id = cf.id
    where cf.company_id = c.id
      and cf.service_category <> 'Rental'
      and (cf.verification_status in ('verified', 'verified_recommended') or tf.id is not null)
  ) fleet_summary on true
  left join lateral (
    select count(*)::integer as rental_count
    from public.transport_company_rentals rental
    where rental.company_id = c.id and rental.status <> 'hidden'
  ) rental_summary on true
  left join lateral (
    select coalesce(avg(review.rating), 0)::numeric(3,2) as rating, count(*)::integer as review_count
    from public.transport_company_reviews review
    where review.company_id = c.id
  ) review_summary on true
  where length(btrim(coalesce(p_query, ''))) >= 2
    and public.transport_company_has_public_profile(c.id)
    and (nullif(btrim(coalesce(p_country, '')), '') is null or lower(c.country) = lower(btrim(p_country)))
    and (
      c.company_name ilike '%' || btrim(p_query) || '%'
      or c.company_code ilike '%' || btrim(p_query) || '%'
      or regexp_replace(lower(c.company_code), '[^a-z0-9]', '', 'g') like
         '%' || regexp_replace(lower(btrim(p_query)), '[^a-z0-9]', '', 'g') || '%'
    )
  order by
    case when lower(c.company_code) = lower(btrim(p_query)) then 0
         when lower(c.company_name) = lower(btrim(p_query)) then 1
         when lower(c.company_name) like lower(btrim(p_query)) || '%' then 2
         else 3 end,
    review_summary.rating desc,
    c.company_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
$function$;

CREATE OR REPLACE FUNCTION public.transport_company_has_public_profile(p_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.transport_companies c
    where c.id = p_company_id
      and c.account_status not in ('draft', 'rejected', 'suspended', 'archived')
      and (
        exists (
          select 1
          from public.transport_fleets tf
          where tf.company_id = c.id and tf.is_visible_to_passengers
        )
        or exists (
          select 1
          from public.transport_company_rentals rental
          where rental.company_id = c.id and rental.status <> 'hidden'
        )
        or (
          c.account_status = 'approved'
          and exists (
            select 1
            from public.transport_company_fleets cf
            where cf.company_id = c.id
              and cf.service_category <> 'Rental'
              and cf.verification_status in ('verified', 'verified_recommended')
          )
        )
      )
  );
$function$;

revoke all on function public.admin_case_decision_state(text, text) from public, anon, authenticated;
revoke all on function public.admin_case_decision_check(public.admin_cases, text) from public, anon, authenticated;
revoke all on function public.admin_case_decision_check_core(public.admin_cases, text) from public, anon, authenticated;
revoke all on function public.admin_case_decision_capabilities(uuid) from public, anon;
grant execute on function public.admin_case_decision_capabilities(uuid) to authenticated;
revoke all on function public.admin_apply_case_decision(uuid, text, text) from public, anon;
grant execute on function public.admin_apply_case_decision(uuid, text, text) to authenticated;
revoke all on function public.admin_undo_case_action(uuid, uuid, text) from public, anon;
grant execute on function public.admin_undo_case_action(uuid, uuid, text) to authenticated;

commit;
