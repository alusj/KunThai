-- Admin panel fixes from the 2026-10-08 audit.
--
--  1. A case decision is only recorded when it really changed the record it
--     is about. Approve/Reject on verification cases needs the matching
--     verification permission, and the record is checked afterwards.
--     admin_case_decision_capabilities() tells the console which decisions
--     an admin can apply to a case, and why not.
--  2. Verification Officers approve/reject verification cases at authority 2;
--     Reports Officers restrict/remove reported content at authority 2.
--  4. Re-syncing a case from its source row keeps the documents evidence.
--  5. Solo fleet intake ignores company fleets and location pings.
--  6. A resubmitted application reopens its case; rejected companies and
--     operators can resubmit.
--  7. Suspend/Restrict/Remove either take effect or are refused.
--  8. Dismissing a seller verification request leaves it 'dismissed'.
--  9. Undoing Approve/Reject puts the record back the way it was.
-- 10. Campaign push: published campaigns whose push was never queued can be
--     claimed by the console or the scheduled job (no secrets in SQL).
-- 13. Business document uploads no longer open their own cases.
-- 17. Archived company fleets are not counted in the user workspace.
-- 18. Join KunThai notes, reviews, priority and score changes are audited.
--
-- Safe to run more than once. Backfills switch user triggers off around
-- their updates so guard triggers never see legacy rows.

begin;

-- ===========================================================================
-- Case decision helpers
-- ===========================================================================

-- Verification permission a decision on this kind of case needs.
create or replace function public.admin_case_verification_permission(p_resource_type text)
returns text
language sql
immutable
as $$
  select case
    when p_resource_type in (
      'transport_operator_verification', 'transport_company_verification', 'transport_fleet_verification',
      'transport_solo_fleet_verification', 'transport_document_verification'
    ) then 'transport.verify'
    when p_resource_type in (
      'marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document'
    ) then 'marketplace.verify'
  end;
$$;

-- Table holding the record a verification case is about.
create or replace function public.admin_case_target_table(p_resource_type text)
returns text
language sql
immutable
as $$
  select case p_resource_type
    when 'transport_operator_verification' then 'transport_operators'
    when 'transport_company_verification' then 'transport_companies'
    when 'transport_fleet_verification' then 'transport_company_fleets'
    when 'transport_solo_fleet_verification' then 'transport_fleets'
    when 'transport_document_verification' then 'transport_operator_documents'
    when 'marketplace_business_registration' then 'marketplace_businesses'
    when 'marketplace_verification' then 'marketplace_seller_verification_requests'
    when 'marketplace_business_document' then 'marketplace_business_documents'
  end;
$$;

-- Account enforcement target behind a verification case (for Suspend).
create or replace function public.admin_case_enforcement_type(p_resource_type text)
returns text
language sql
immutable
as $$
  select case p_resource_type
    when 'transport_operator_verification' then 'transport_operator'
    when 'transport_company_verification' then 'transport_company'
    when 'marketplace_business_registration' then 'marketplace_business'
  end;
$$;

-- Status columns a decision sets on the case's record (null = no change).
create or replace function public.admin_case_decision_state(p_resource_type text, p_decision text)
returns jsonb
language sql
immutable
as $$
  select case
    when p_resource_type = 'transport_operator_verification' and p_decision = 'approve'
      then '{"verification_status":"verified","account_status":"approved"}'::jsonb
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

-- Status a record returns to when a decision is undone and no earlier value
-- was recorded.
create or replace function public.admin_case_pending_state(p_resource_type text)
returns jsonb
language sql
immutable
as $$
  select case p_resource_type
    when 'transport_operator_verification' then '{"verification_status":"verification_pending","account_status":"submitted"}'::jsonb
    when 'transport_company_verification' then '{"verification_status":"pending","account_status":"submitted"}'::jsonb
    when 'transport_fleet_verification' then '{"verification_status":"pending_review"}'::jsonb
    when 'transport_solo_fleet_verification' then '{"verification_status":"verification_pending"}'::jsonb
    when 'transport_document_verification' then '{"status":"verification_pending"}'::jsonb
    when 'marketplace_business_registration' then '{"verification_status":"pending"}'::jsonb
    when 'marketplace_verification' then '{"status":"pending"}'::jsonb
    when 'marketplace_business_document' then '{"status":"pending"}'::jsonb
  end;
$$;

-- Current record behind a verification case, as JSON (null if missing).
create or replace function public.admin_case_target_row(p_resource_type text, p_resource_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text := public.admin_case_target_table(p_resource_type);
  v_row jsonb;
begin
  if v_table is null or p_resource_id is null or to_regclass('public.' || v_table) is null then
    return null;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table) into v_row using p_resource_id;
  return v_row;
end;
$$;

-- Does the record hold every value in p_state (columns it lacks are ignored)?
create or replace function public.admin_case_target_matches(p_resource_type text, p_resource_id uuid, p_state jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row jsonb := public.admin_case_target_row(p_resource_type, p_resource_id);
  v_expected jsonb;
begin
  if v_row is null then return false; end if;
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb) into v_expected
  from jsonb_each(coalesce(p_state, '{}'::jsonb)) entry
  where v_row ? entry.key;
  return v_row @> v_expected;
end;
$$;

-- Writes values onto the record behind a verification case. Keys for columns
-- the table does not have are skipped. Returns the row as it was before.
create or replace function public.admin_case_write_target(p_resource_type text, p_resource_id uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := public.admin_case_target_table(p_resource_type);
  v_before jsonb;
  v_values jsonb;
  v_columns text;
  v_sources text;
begin
  if v_table is null or to_regclass('public.' || v_table) is null then
    raise exception 'This case has no record that can be updated';
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_table) into v_before using p_resource_id;
  if v_before is null then
    raise exception 'The record for this case no longer exists. Dismiss the case instead.';
  end if;

  select jsonb_object_agg(entry.key, entry.value) into v_values
  from jsonb_each(coalesce(p_values, '{}'::jsonb)) entry
  where v_before ? entry.key;
  if v_values is null then return v_before; end if;

  select string_agg(format('%I', item.key), ', ' order by item.key),
         string_agg(format('r.%I', item.key), ', ' order by item.key)
    into v_columns, v_sources
  from jsonb_object_keys(v_values) as item(key);

  execute format(
    'update public.%1$I t set (%2$s) = (select %3$s from jsonb_populate_record(null::public.%1$I, $2) r) where t.id = $1',
    v_table, v_columns, v_sources
  ) using p_resource_id, v_values;
  return v_before;
end;
$$;

-- What a decision would do on a case, and whether the calling admin may
-- apply it. Shared by admin_apply_case_decision and the capabilities RPC.
create or replace function public.admin_case_decision_check(p_case public.admin_cases, p_decision text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_type text := p_case.resource_type;
  v_sector text := p_case.sector;
  v_verify text := public.admin_case_verification_permission(p_case.resource_type);
  v_enforce text := public.admin_case_enforcement_type(p_case.resource_type);
  v_effect text;
  v_refusal text;
  v_permission text;
  v_permission_message text;
  v_authority smallint := 0;
  v_needs_approval boolean := false;
  v_has_permission boolean;
begin
  if v_decision not in ('approve','reject','dismiss','remove','restrict','suspend','resolve','request_information') then
    return jsonb_build_object('key', v_decision, 'allowed', false, 'needsApproval', false, 'requiredAuthority', null,
      'requiredPermission', null, 'effect', null, 'reason', 'Unsupported decision');
  end if;

  if v_verify is not null then
    if v_decision in ('approve', 'reject') then
      v_permission := v_verify;
      v_authority := 2;
      v_permission_message := case when v_verify = 'transport.verify'
        then 'Only staff with UrRide verification permission can approve or reject this.'
        else 'Only staff with UrMall verification permission can approve or reject this.' end;
      if v_type = 'marketplace_business_document' and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'marketplace_business_documents' and column_name = 'status'
      ) then
        v_refusal := 'Business documents are decided in the business registration case. Approve or reject the registration instead.';
      else
        v_effect := case
          when v_type = 'transport_operator_verification' then case v_decision when 'approve' then 'Approves and verifies the operator.' else 'Rejects the operator application. The operator can correct it and resubmit.' end
          when v_type = 'transport_company_verification' then case v_decision when 'approve' then 'Approves and verifies the company.' else 'Rejects the company application. The owner can correct it and resubmit.' end
          when v_type in ('transport_fleet_verification', 'transport_solo_fleet_verification') then case v_decision when 'approve' then 'Verifies the vehicle so passengers can book it.' else 'Rejects the vehicle; passengers cannot book it.' end
          when v_type in ('transport_document_verification', 'marketplace_business_document') then case v_decision when 'approve' then 'Marks the document verified.' else 'Marks the document rejected.' end
          when v_type = 'marketplace_business_registration' then case v_decision when 'approve' then 'Verifies the UrMall business.' else 'Rejects the UrMall business verification.' end
          when v_type = 'marketplace_verification' then case v_decision when 'approve' then 'Approves the request and verifies the business.' else 'Rejects the request and the business verification.' end
        end;
      end if;
    elsif v_decision = 'suspend' then
      if v_enforce is null then
        v_refusal := 'Suspend does not apply to this case. Reject it instead, or suspend the owner''s account from its profile.';
      else
        v_permission := public.admin_enforcement_permission_prefix(v_enforce) || '.suspend';
        v_permission_message := 'Only staff who can suspend this account can suspend it.';
        v_authority := 3;
        v_effect := 'Suspends the account until KunThai restores it: it is hidden from customers and cannot take new work.';
      end if;
    elsif v_decision in ('restrict', 'remove') then
      v_refusal := 'Restrict and Remove do not apply to verification cases. Reject the application or suspend the account instead.';
    elsif v_decision in ('dismiss', 'resolve') and v_type = 'marketplace_verification' then
      v_effect := 'Closes the request as dismissed. The seller can send a new request.';
    end if;
  elsif v_type in ('explore_post_report', 'explore_comment_report', 'explore_profile_report', 'area_report') then
    if v_decision in ('restrict', 'remove') then
      v_permission := 'reports.manage';
      v_permission_message := 'Only staff with reports permission can restrict or remove reported content.';
      v_authority := 2;
      if v_type = 'explore_post_report' then
        v_effect := 'Hides the reported post from everyone.';
      elsif v_type = 'explore_comment_report' then
        if v_decision = 'remove' then v_effect := 'Deletes the reported comment.';
        else v_refusal := 'A comment cannot be restricted. Use Remove to take it down.'; end if;
      elsif v_type = 'explore_profile_report' then
        v_refusal := 'A reported profile cannot be restricted or removed from the report. Use the account controls on the person''s user record.';
      else
        v_effect := 'Clears the report from Area View.';
      end if;
    elsif v_decision = 'suspend' then
      v_refusal := 'Suspend does not apply to reports. Use the account controls on the person''s user record.';
    elsif v_decision in ('approve', 'reject') then
      v_authority := 3;
    end if;
  elsif v_type = 'urmall_account_deletion_request' then
    if v_decision in ('approve', 'remove') then
      v_authority := 3;
      v_effect := 'Deletes the UrMall business.';
    elsif v_decision in ('restrict', 'suspend') then
      v_refusal := 'This decision has no effect on a deletion request. Approve or reject the request instead.';
    elsif v_decision = 'reject' then
      v_authority := 3;
    end if;
  elsif v_type = 'urride_account_deletion_request' then
    if v_decision in ('approve', 'restrict') then
      v_authority := 3;
      v_effect := 'Restricts the person''s UrRide access.';
    elsif v_decision in ('remove', 'suspend') then
      v_refusal := 'This decision has no effect on a deletion request. Approve or reject the request instead.';
    elsif v_decision = 'reject' then
      v_authority := 3;
    end if;
  else
    if v_decision in ('suspend', 'restrict', 'remove') then
      v_refusal := 'This decision has no effect on this type of case. Use Resolve or Dismiss to close it.';
    elsif v_decision in ('approve', 'reject') then
      v_authority := 3;
    end if;
  end if;

  if v_refusal is null then
    if not public.admin_has_permission('cases.manage', v_sector) then
      v_refusal := 'Not authorized';
    elsif v_permission is not null then
      v_has_permission := public.admin_has_permission(v_permission, v_sector)
        or (v_permission = 'reports.manage' and v_sector = 'explore' and public.admin_has_permission('explore.moderate', v_sector));
      if not v_has_permission then v_refusal := v_permission_message; end if;
    end if;
  end if;
  if v_refusal is null and v_authority > 0 and public.admin_authority_level(v_sector) < v_authority then
    v_refusal := format('This decision requires authority level %s', v_authority);
  end if;

  v_needs_approval := (
      v_decision in ('remove', 'suspend')
      or (v_type in ('urmall_account_deletion_request', 'urride_account_deletion_request') and v_decision = 'approve')
    )
    and not public.admin_has_role(array['super_admin'])
    and not exists (
      select 1 from public.admin_approvals approval
      where approval.case_id = p_case.id
        and approval.action_type = 'case_decision:' || v_decision
        and approval.status = 'approved'
    );

  return jsonb_build_object(
    'key', v_decision,
    'allowed', v_refusal is null,
    'needsApproval', v_needs_approval,
    'requiredAuthority', nullif(v_authority, 0),
    'requiredPermission', v_permission,
    'effect', v_effect,
    'reason', v_refusal
  );
end;
$$;

-- Which decisions the calling admin can apply to a case (for the console).
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
  from unnest(array['approve','reject','request_information','restrict','remove','suspend','dismiss','resolve'])
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
-- 1, 2, 7, 8. Applying a case decision
-- Latest definition before this: 20260714120000_account_deletion_request_cases.sql
-- ===========================================================================

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
        set verification_status = case when normalized_decision = 'approve' then 'verified' else 'rejected' end,
            updated_at = now()
        where id = v_business_id;
        if not exists (
          select 1 from public.marketplace_businesses business
          where business.id = v_business_id
            and business.verification_status = case when normalized_decision = 'approve' then 'verified' else 'rejected' end
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

-- ===========================================================================
-- 9. Undo restores the record as well as the case
-- Latest definition before this: 20260717143000_admin_case_action_tools.sql
-- ===========================================================================

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
        and verification_status = case when decision_key = 'approve' then 'verified' else 'rejected' end;
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

-- ===========================================================================
-- 4, 6, 13. Source intake: keep document evidence, reopen on resubmission,
-- no separate cases for business document uploads
-- Latest definition before this: 20260713113000_admin_global_content_and_real_estate_visibility.sql
-- ===========================================================================

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
  source_country_iso text;
  source_country_name text;
  existing_case public.admin_cases;
  reopen_case boolean := false;
begin
  -- Business documents travel with the registration case.
  if source_resource_type = 'marketplace_business_document' then return null; end if;

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
  source_country_iso := upper(nullif(coalesce(
    source_row ->> 'country_iso',
    source_row ->> 'country_code',
    source_row ->> 'countryCode',
    source_row #>> '{location,country_iso}',
    source_row #>> '{location,countryCode}',
    ''
  ), ''));
  source_country_name := nullif(coalesce(
    source_row ->> 'country_name',
    source_row ->> 'countryName',
    source_row ->> 'country',
    source_row #>> '{location,country_name}',
    source_row #>> '{location,countryName}',
    source_row #>> '{location,country}',
    ''
  ), '');

  if source_reporter is null and source_resource_type in ('marketplace_case','marketplace_verification')
     and to_regclass('public.marketplace_businesses') is not null then
    source_business_id := nullif(source_row ->> 'business_id', '')::uuid;
    if source_business_id is not null then
      select business.user_id, coalesce(source_country_iso, business.country_iso), coalesce(source_country_name, business.country)
      into source_reporter, source_country_iso, source_country_name
      from public.marketplace_businesses business
      where business.id = source_business_id;
    end if;
  end if;

  -- A verification record back in a pending state after a decision moved it
  -- out (or while waiting for information) means the owner resubmitted.
  select * into existing_case
  from public.admin_cases
  where resource_type = source_resource_type and resource_id = source_id;
  if existing_case.id is not null
     and public.admin_case_verification_permission(source_resource_type) is not null
     and (
       (existing_case.status in ('resolved', 'closed')
         and (existing_case.resolution_code in ('approve', 'reject', 'suspend')
           or (source_resource_type = 'marketplace_verification' and existing_case.resolution_code in ('dismiss', 'resolve'))))
       or existing_case.status = 'waiting_information'
     ) then
    reopen_case := true;
  end if;

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, subject_user_id, reporter_user_id, country_iso, country_name, sla_due_at, metadata
  ) values (
    source_sector, source_queue, source_case_type, source_resource_type, source_id,
    source_title, source_description, source_priority, source_subject, source_reporter,
    source_country_iso, source_country_name,
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
      country_iso = coalesce(excluded.country_iso, public.admin_cases.country_iso),
      country_name = coalesce(excluded.country_name, public.admin_cases.country_name),
      -- Keep other metadata and every *documents evidence list collected for
      -- the case; the fresh source row wins for its own columns.
      metadata = (coalesce(public.admin_cases.metadata, '{}'::jsonb) - 'source')
        || jsonb_build_object('source',
          coalesce((
            select jsonb_object_agg(previous.key, previous.value)
            from jsonb_each(case when jsonb_typeof(public.admin_cases.metadata -> 'source') = 'object'
              then public.admin_cases.metadata -> 'source' else '{}'::jsonb end) previous
            where previous.key like '%documents'
          ), '{}'::jsonb) || coalesce(excluded.metadata -> 'source', '{}'::jsonb)
        ),
      status = case when reopen_case then 'reopened' else public.admin_cases.status end,
      resolution_code = case when reopen_case then null else public.admin_cases.resolution_code end,
      resolution_note = case when reopen_case then null else public.admin_cases.resolution_note end,
      resolved_at = case when reopen_case then null else public.admin_cases.resolved_at end,
      closed_at = case when reopen_case then null else public.admin_cases.closed_at end,
      sla_due_at = case when reopen_case then excluded.sla_due_at else public.admin_cases.sla_due_at end,
      updated_at = now()
  returning id into source_case_id;

  if reopen_case then
    insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
    values (source_case_id, auth.uid(), 'reopened', existing_case.status, 'reopened',
      'The applicant resubmitted after the previous decision.',
      jsonb_build_object('previousResolution', existing_case.resolution_code));
  end if;

  return source_case_id;
end;
$$;

-- 13. Document uploads stop opening their own cases.
do $$
begin
  if to_regclass('public.marketplace_business_documents') is not null then
    drop trigger if exists admin_intake_marketplace_business_documents on public.marketplace_business_documents;
  end if;
end;
$$;

-- ===========================================================================
-- 5. Solo fleet intake: solo fleets only, and only on verification changes
-- ===========================================================================

create or replace function public.admin_capture_solo_fleet_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_fleet_id is not null then return new; end if;
  if tg_op = 'UPDATE' and not exists (
    select 1
    from unnest(array[
      'verification_status', 'company_fleet_id', 'operator_id', 'plate_number', 'fleet_name',
      'fleet_type', 'service_category', 'make', 'model', 'color', 'manufacture_year'
    ]) as watched(column_name)
    where to_jsonb(new) -> watched.column_name is distinct from to_jsonb(old) -> watched.column_name
  ) then
    return new;
  end if;
  perform public.admin_upsert_source_case(
    to_jsonb(new), 'transport_solo_fleet_verification', 'transport', 'verification', 'fleet_verification'
  );
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.transport_fleets') is not null then
    drop trigger if exists admin_intake_transport_solo_fleets on public.transport_fleets;
    create trigger admin_intake_transport_solo_fleets
      after insert or update on public.transport_fleets
      for each row execute function public.admin_capture_solo_fleet_case();
  end if;
end;
$$;

-- Close duplicate and document-only cases without firing case triggers.
alter table public.admin_cases disable trigger user;

do $$
begin
  if to_regclass('public.transport_fleets') is not null then
    update public.admin_cases admin_case
    set status = 'closed',
        resolution_code = 'duplicate_company_fleet',
        resolution_note = 'Company fleets are verified in the company fleet case.',
        closed_at = coalesce(admin_case.closed_at, now()),
        updated_at = now()
    from public.transport_fleets fleet
    where admin_case.resource_type = 'transport_solo_fleet_verification'
      and admin_case.resource_id = fleet.id
      and fleet.company_fleet_id is not null
      and admin_case.status not in ('resolved', 'closed');
  end if;

  update public.admin_cases document_case
  set status = 'closed',
      resolution_code = 'merged_into_registration',
      resolution_note = 'This document is reviewed in the business registration case.',
      closed_at = coalesce(document_case.closed_at, now()),
      updated_at = now()
  where document_case.resource_type = 'marketplace_business_document'
    and document_case.status not in ('resolved', 'closed')
    and exists (
      select 1 from public.admin_cases registration
      where registration.resource_type = 'marketplace_business_registration'
        and registration.resource_id::text = document_case.metadata -> 'source' ->> 'business_id'
    );
end;
$$;

alter table public.admin_cases enable trigger user;

-- ===========================================================================
-- 6. Rejected operators and companies can resubmit (never self-approve)
-- Latest definitions: 20260627120000 (operators), 20261007150000 (companies)
-- ===========================================================================

create or replace function public.guard_transport_operator_admin_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  requested_account_status text;
  resubmitting boolean;
begin
  if not public.admin_has_permission('transport.verify', 'transport') then
    requested_account_status := coalesce(to_jsonb(new) ->> 'account_status', '');
    resubmitting := coalesce(to_jsonb(old) ->> 'account_status', '') = 'rejected'
      and requested_account_status in ('submitted', 'pending_review')
      and coalesce(to_jsonb(old) ->> 'verification_status', '') <> 'verified';
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
$$;

create or replace function public.guard_transport_company_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_states constant text[] := array['approved', 'rejected', 'suspended'];
  verdict_states constant text[] := array['verified', 'rejected', 'suspended'];
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
$$;

-- ===========================================================================
-- 2. Staff profiles never cap Verification/Reports Officers below the
-- authority their decisions need (2)
-- Latest definition before this: 20261001150000_admin_operations_platform.sql
-- ===========================================================================

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

  if new.authority_level >= 2 and exists (
    select 1 from public.admin_roles role
    where role.id = new.role_id and role.role_key in ('verification_officer', 'reports_officer')
  ) then
    update public.admin_staff_profiles profile
    set level_key = 'specialist', updated_at = now()
    from public.admin_staff_levels level
    where profile.user_id = new.user_id
      and level.level_key = profile.level_key
      and level.max_authority < 2;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_assignments_ensure_staff_profile on public.admin_assignments;
create trigger admin_assignments_ensure_staff_profile
after insert or update of authority_level, role_id on public.admin_assignments
for each row execute function public.admin_ensure_staff_profile();

alter table public.admin_staff_profiles disable trigger user;
update public.admin_staff_profiles profile
set level_key = 'specialist', updated_at = now()
from public.admin_staff_levels level
where level.level_key = profile.level_key
  and level.max_authority < 2
  and exists (
    select 1
    from public.admin_assignments assignment
    join public.admin_roles role on role.id = assignment.role_id
    where assignment.user_id = profile.user_id
      and assignment.status = 'active'
      and assignment.authority_level >= 2
      and role.role_key in ('verification_officer', 'reports_officer')
  );
alter table public.admin_staff_profiles enable trigger user;

-- ===========================================================================
-- 10. Campaign push queue
-- pg_cron publishes due campaigns every minute, but device push can only be
-- sent by the send-notification-push Edge Function, which needs a key that
-- must not live in SQL. Published push campaigns are therefore claimed here
-- by whoever can call that function (the campaign console, the scheduled
-- job), exactly once each.
-- ===========================================================================

alter table public.admin_notification_campaigns
  add column if not exists push_queued_at timestamptz;

-- Everything already published more than a day ago was handled by the daily
-- job; newer push campaigns stay unclaimed so they are queued once.
alter table public.admin_notification_campaigns disable trigger user;
update public.admin_notification_campaigns
set push_queued_at = coalesce(published_at, sent_at, updated_at, now())
where push_queued_at is null
  and status = 'completed'
  and (
    not ('push' = any(coalesce(channels, '{}'::text[])))
    or coalesce(published_at, sent_at, updated_at) < now() - interval '26 hours'
  );
alter table public.admin_notification_campaigns enable trigger user;

create index if not exists admin_notification_campaigns_push_queue_idx
  on public.admin_notification_campaigns (published_at)
  where push_queued_at is null and status = 'completed';

-- Claims published push campaigns that have not been queued yet. Returns the
-- campaigns the caller must now send to send-notification-push.
create or replace function public.admin_claim_campaign_push(result_limit integer default 25)
returns table (queued_campaign_id uuid, queued_sector text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_kunthai_admin() then
    raise exception 'Not authorized';
  end if;

  return query
  with due as (
    select campaign.id
    from public.admin_notification_campaigns campaign
    where campaign.status = 'completed'
      and 'push' = any(coalesce(campaign.channels, '{}'::text[]))
      and campaign.push_queued_at is null
      and coalesce(campaign.published_at, campaign.sent_at, campaign.updated_at) > now() - interval '7 days'
      and (
        auth.uid() is null
        or public.admin_has_permission('notifications.publish', campaign.sector)
        or public.admin_has_permission('notifications.approve', campaign.sector)
      )
    order by coalesce(campaign.published_at, campaign.sent_at, campaign.updated_at)
    limit greatest(1, least(coalesce(result_limit, 25), 100))
    for update skip locked
  )
  update public.admin_notification_campaigns campaign
  set push_queued_at = now()
  from due
  where campaign.id = due.id
  returning campaign.id, campaign.sector;
end;
$$;

-- A campaign published from the console has its push sent by that console
-- straight away, so it is marked queued. Otherwise identical to
-- 20260917120000_admin_campaign_delivery_v2.sql.
create or replace function public.admin_publish_campaign(
  campaign_uuid uuid,
  confirmed_audience integer default null,
  confirmed_worldwide boolean default false
)
returns public.admin_notification_campaigns
language plpgsql
security definer
set search_path = public, auth
as $$
declare campaign public.admin_notification_campaigns; actual_audience integer; worldwide boolean;
begin
  select * into campaign from public.admin_notification_campaigns where id = campaign_uuid;
  if campaign.id is null then raise exception 'Campaign not found'; end if;
  if auth.uid() is not null and not (public.admin_has_permission('notifications.publish', campaign.sector) or public.admin_has_permission('notifications.approve', campaign.sector)) then
    raise exception 'Not authorized';
  end if;
  if auth.uid() is not null then
    actual_audience := public.admin_estimate_campaign_audience(campaign.sector, campaign.audience_type, campaign.audience_filter);
    worldwide := campaign.audience_type <> 'specific_users'
      and (coalesce(jsonb_array_length(campaign.audience_filter->'locations'), 0) = 0 or (campaign.audience_filter->'targets') ? 'all');
    if actual_audience >= 1000 and confirmed_audience is distinct from actual_audience then
      raise exception 'Audience changed: confirm the current % recipients', actual_audience;
    end if;
    if worldwide and not confirmed_worldwide then raise exception 'Worldwide publication must be explicitly confirmed'; end if;
  end if;
  campaign := public.admin_publish_campaign_rows(campaign_uuid);
  if auth.uid() is not null then
    update public.admin_notification_campaigns set push_queued_at = now()
    where id = campaign_uuid and push_queued_at is null
    returning * into campaign;
  end if;
  return campaign;
end;
$$;

-- ===========================================================================
-- 17. Archived company fleets are not counted in the user workspace
-- Latest definition before this: 20260915120000_admin_user_identity_workspace.sql
-- ===========================================================================

do $$
begin
  if to_regclass('public.transport_company_fleets') is not null then
    alter table public.transport_company_fleets add column if not exists archived_at timestamptz;
  end if;
end;
$$;

create or replace function public.admin_get_user_workspace_v2(target_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_base jsonb;
  v_user jsonb;
  v_businesses jsonb := '[]'::jsonb;
  v_companies jsonb := '[]'::jsonb;
  v_operators jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_admin_roles jsonb := '[]'::jsonb;
  v_accounts jsonb := '[]'::jsonb;
  v_summary jsonb;
begin
  if target_user_id is null or not public.admin_has_permission('users.view') then
    raise exception 'Not authorized';
  end if;

  v_base := public.admin_get_user_workspace(target_user_id);
  if v_base is null or (v_base -> 'user') is null then
    raise exception 'User not found';
  end if;

  v_user := jsonb_set(
    v_base -> 'user',
    '{public_id}',
    to_jsonb(coalesce(public.kunthai_public_user_id_from_uuid(target_user_id), '')),
    true
  );

  if to_regclass('public.admin_assignments') is not null then
    select coalesce(jsonb_agg(to_jsonb(role_row) order by role_row.rank desc, role_row.created_at desc), '[]'::jsonb)
    into v_admin_roles
    from (
      select assignment.id, role.role_key, role.name, assignment.sector_scopes,
        assignment.region_scopes, assignment.authority_level, assignment.status,
        assignment.expires_at, assignment.created_at, role.rank
      from public.admin_assignments assignment
      join public.admin_roles role on role.id = assignment.role_id
      where assignment.user_id = target_user_id
        and assignment.status = 'active'
        and (assignment.expires_at is null or assignment.expires_at > now())
    ) role_row;
  end if;

  v_user := jsonb_set(v_user, '{is_admin}', to_jsonb(jsonb_array_length(v_admin_roles) > 0), true);

  if to_regclass('public.marketplace_businesses') is not null
    and to_regclass('public.marketplace_products') is not null
    and to_regclass('public.marketplace_orders') is not null
    and to_regclass('public.marketplace_business_admins') is not null
    and to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', business.id,
          'name', business.business_name,
          'business_name', business.business_name,
          'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')),
          'role', 'owner',
          'status', business.verification_status,
          'verification_status', business.verification_status,
          'country', business.country,
          'city', business.city,
          'plan_code', subscription.plan_code,
          'plan_name', plan.display_name,
          'plan_status', subscription.status,
          'product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id),
          'published_product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id and product.status = 'active'),
          'order_count', (select count(*) from public.marketplace_orders order_row where order_row.business_id = business.id),
          'content_count', (select count(*) from public.marketplace_activities activity where activity.business_id = business.id),
          'admin_count', (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted'),
          'product_limit', plan.product_limit,
          'admin_limit', plan.admin_limit
        ) as entry, business.created_at
        from public.marketplace_businesses business
        left join public.kunthai_business_subscriptions subscription on subscription.marketplace_business_id = business.id and subscription.surface = 'urmall'
        left join public.kunthai_business_plans plan on plan.surface = 'urmall' and plan.plan_code = subscription.plan_code
        where business.user_id = $1
        union all
        select jsonb_build_object(
          'id', business.id,
          'name', business.business_name,
          'business_name', business.business_name,
          'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')),
          'role', 'admin',
          'status', business.verification_status,
          'verification_status', business.verification_status,
          'country', business.country,
          'city', business.city,
          'plan_code', subscription.plan_code,
          'plan_name', plan.display_name,
          'plan_status', subscription.status,
          'product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id),
          'published_product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id and product.status = 'active'),
          'order_count', (select count(*) from public.marketplace_orders order_row where order_row.business_id = business.id),
          'content_count', (select count(*) from public.marketplace_activities activity where activity.business_id = business.id),
          'admin_count', (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted'),
          'product_limit', plan.product_limit,
          'admin_limit', plan.admin_limit
        ) as entry, business.created_at
        from public.marketplace_business_admins business_admin
        join public.marketplace_businesses business on business.id = business_admin.business_id
        left join public.kunthai_business_subscriptions subscription on subscription.marketplace_business_id = business.id and subscription.surface = 'urmall'
        left join public.kunthai_business_plans plan on plan.surface = 'urmall' and plan.plan_code = subscription.plan_code
        where business_admin.user_id = $1 and business_admin.status = 'accepted' and business.user_id is distinct from $1
      ) rows
    $query$ into v_businesses using target_user_id;
  elsif to_regclass('public.marketplace_businesses') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', business.id, 'name', business.business_name, 'business_name', business.business_name,
        'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')), 'role', 'owner',
        'status', business.verification_status, 'verification_status', business.verification_status,
        'country', business.country, 'city', business.city, 'product_count', 0,
        'published_product_count', 0, 'order_count', 0, 'content_count', 0, 'admin_count', 0
      ) order by business.created_at desc), '[]'::jsonb)
      from public.marketplace_businesses business where business.user_id = $1
    $query$ into v_businesses using target_user_id;
  end if;

  if to_regclass('public.transport_companies') is not null
    and to_regclass('public.transport_company_fleets') is not null
    and to_regclass('public.transport_company_members') is not null
    and to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
          'company_code', company.company_code, 'company_type', company.company_type, 'role', 'owner',
          'status', company.account_status, 'account_status', company.account_status,
          'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
          'plan_code', subscription.plan_code, 'plan_name', plan.display_name, 'plan_status', subscription.status,
          'fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null),
          'active_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null and fleet.active_status = 'active'),
          'rental_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null and fleet.service_category = 'Rental'),
          'operator_count', (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role = 'operator' and member.status = 'active'),
          'admin_count', (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role in ('owner', 'admin') and member.status = 'active'),
          'reservation_count', case when to_regclass('public.transport_company_rentals') is not null and to_regclass('public.transport_rental_reservations') is not null then (select count(*) from public.transport_rental_reservations reservation join public.transport_company_rentals rental on rental.id = reservation.rental_id where rental.company_id = company.id) else 0 end,
          'vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit
        ) as entry, company.created_at
        from public.transport_companies company
        left join public.kunthai_business_subscriptions subscription on subscription.transport_company_id = company.id and subscription.surface = 'urride'
        left join public.kunthai_business_plans plan on plan.surface = 'urride' and plan.plan_code = subscription.plan_code
        where company.owner_user_id = $1
        union all
        select jsonb_build_object(
          'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
          'company_code', company.company_code, 'company_type', company.company_type, 'role', member.role,
          'status', company.account_status, 'account_status', company.account_status,
          'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
          'plan_code', subscription.plan_code, 'plan_name', plan.display_name, 'plan_status', subscription.status,
          'fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null),
          'active_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null and fleet.active_status = 'active'),
          'rental_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null and fleet.service_category = 'Rental'),
          'operator_count', (select count(*) from public.transport_company_members operator_member where operator_member.company_id = company.id and operator_member.role = 'operator' and operator_member.status = 'active'),
          'admin_count', (select count(*) from public.transport_company_members admin_member where admin_member.company_id = company.id and admin_member.role in ('owner', 'admin') and admin_member.status = 'active'),
          'reservation_count', 0, 'vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit
        ) as entry, company.created_at
        from public.transport_company_members member
        join public.transport_companies company on company.id = member.company_id
        left join public.kunthai_business_subscriptions subscription on subscription.transport_company_id = company.id and subscription.surface = 'urride'
        left join public.kunthai_business_plans plan on plan.surface = 'urride' and plan.plan_code = subscription.plan_code
        where member.user_id = $1 and member.status = 'active' and company.owner_user_id is distinct from $1
      ) rows
    $query$ into v_companies using target_user_id;
  elsif to_regclass('public.transport_companies') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
        'company_code', company.company_code, 'company_type', company.company_type, 'role', 'owner',
        'status', company.account_status, 'account_status', company.account_status,
        'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
        'fleet_count', 0, 'active_fleet_count', 0, 'rental_fleet_count', 0, 'operator_count', 0, 'admin_count', 0, 'reservation_count', 0
      ) order by company.created_at desc), '[]'::jsonb)
      from public.transport_companies company where company.owner_user_id = $1
    $query$ into v_companies using target_user_id;
  end if;

  if to_regclass('public.transport_operators') is not null
    and to_regclass('public.transport_fleets') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', operator.id, 'full_name', operator.full_name, 'display_code', operator.display_code,
        'public_id', operator.display_code, 'city', operator.city, 'account_status', operator.account_status,
        'verification_status', operator.verification_status::text,
        'operator_mode', case when to_regclass('public.transport_company_members') is not null and exists (select 1 from public.transport_company_members member where member.user_id = $1 and member.operator_id = operator.id and member.status = 'active') then 'company-linked' else 'solo' end,
        'service_modes', coalesce((select jsonb_agg(distinct lower(replace(fleet.service_category::text, ' ', '_'))) from public.transport_fleets fleet where fleet.operator_id = operator.id and not exists (select 1 from public.transport_company_fleets archived where archived.id = fleet.company_fleet_id and archived.archived_at is not null)), '[]'::jsonb),
        'fleet_count', (select count(*) from public.transport_fleets fleet where fleet.operator_id = operator.id and not exists (select 1 from public.transport_company_fleets archived where archived.id = fleet.company_fleet_id and archived.archived_at is not null)),
        'company_count', case when to_regclass('public.transport_company_members') is not null then (select count(*) from public.transport_company_members member where member.user_id = $1 and member.operator_id = operator.id and member.status = 'active') else 0 end,
        'completed_jobs', coalesce((select sum(fleet.completed_jobs) from public.transport_fleets fleet where fleet.operator_id = operator.id and not exists (select 1 from public.transport_company_fleets archived where archived.id = fleet.company_fleet_id and archived.archived_at is not null)), 0)
      ) order by operator.created_at desc), '[]'::jsonb)
      from public.transport_operators operator where operator.user_id = $1
    $query$ into v_operators using target_user_id;
  end if;

  if to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and (public.admin_has_permission('marketplace.view', 'marketplace') or public.admin_has_permission('transport.view', 'transport')) then
    execute $query$
      select coalesce(jsonb_agg(entry order by period_end desc nulls last), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', subscription.id, 'surface', subscription.surface, 'entity_id', business.id,
          'entity_name', business.business_name, 'plan_code', subscription.plan_code,
          'plan_name', plan.display_name, 'status', subscription.status,
          'current_period_end', subscription.current_period_end, 'auto_renew', subscription.auto_renew,
          'limits', jsonb_build_object('product_limit', plan.product_limit, 'admin_limit', plan.admin_limit),
          'usage', jsonb_build_object(
            'product_count', case when to_regclass('public.marketplace_products') is not null then (select count(*) from public.marketplace_products product where product.business_id = business.id) else 0 end,
            'admin_count', case when to_regclass('public.marketplace_business_admins') is not null then (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted') else 0 end
          )
        ) as entry, subscription.current_period_end as period_end
        from public.kunthai_business_subscriptions subscription
        join public.kunthai_business_plans plan on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
        join public.marketplace_businesses business on business.id = subscription.marketplace_business_id
        where subscription.surface = 'urmall'
          and public.admin_has_permission('marketplace.view', 'marketplace')
          and (business.user_id = $1 or exists (select 1 from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.user_id = $1 and admin_row.status = 'accepted'))
        union all
        select jsonb_build_object(
          'id', subscription.id, 'surface', subscription.surface, 'entity_id', company.id,
          'entity_name', company.company_name, 'plan_code', subscription.plan_code,
          'plan_name', plan.display_name, 'status', subscription.status,
          'current_period_end', subscription.current_period_end, 'auto_renew', subscription.auto_renew,
          'limits', jsonb_build_object('vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit),
          'usage', jsonb_build_object(
            'fleet_count', case when to_regclass('public.transport_company_fleets') is not null then (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.archived_at is null) else 0 end,
            'operator_count', case when to_regclass('public.transport_company_members') is not null then (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role = 'operator' and member.status = 'active') else 0 end
          )
        ) as entry, subscription.current_period_end as period_end
        from public.kunthai_business_subscriptions subscription
        join public.kunthai_business_plans plan on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
        join public.transport_companies company on company.id = subscription.transport_company_id
        where subscription.surface = 'urride'
          and public.admin_has_permission('transport.view', 'transport')
          and (company.owner_user_id = $1 or exists (select 1 from public.transport_company_members member where member.company_id = company.id and member.user_id = $1 and member.status = 'active'))
      ) rows
    $query$ into v_subscriptions using target_user_id;
  end if;

  v_accounts := jsonb_build_array(jsonb_build_object('id', target_user_id, 'kind', 'personal', 'name', coalesce(v_user ->> 'display_name', 'Personal account'), 'role', 'account_holder', 'status', coalesce(v_user ->> 'account_status', 'active'), 'public_id', v_user ->> 'public_id'));
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'business', 'name', coalesce(item ->> 'name', item ->> 'business_name'), 'role', item ->> 'role', 'status', coalesce(item ->> 'status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_businesses) item;
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'company', 'name', coalesce(item ->> 'name', item ->> 'company_name'), 'role', item ->> 'role', 'status', coalesce(item ->> 'status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_companies) item;
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'operator', 'name', item ->> 'full_name', 'role', case when item ->> 'operator_mode' = 'solo' then 'solo_operator' else 'company_operator' end, 'status', coalesce(item ->> 'account_status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_operators) item;

  v_summary := coalesce(v_base -> 'summary', '{}'::jsonb) || jsonb_build_object(
    'account_count', jsonb_array_length(v_accounts),
    'business_count', jsonb_array_length(v_businesses),
    'company_count', jsonb_array_length(v_companies),
    'operator_count', jsonb_array_length(v_operators),
    'fleet_count', coalesce((select sum(coalesce((item ->> 'fleet_count')::integer, 0)) from jsonb_array_elements(v_companies) item), 0),
    'rental_count', coalesce((select sum(coalesce((item ->> 'rental_fleet_count')::integer, 0)) from jsonb_array_elements(v_companies) item), 0),
    'product_count', coalesce((select sum(coalesce((item ->> 'product_count')::integer, 0)) from jsonb_array_elements(v_businesses) item), 0),
    'subscription_count', jsonb_array_length(v_subscriptions),
    'admin_role_count', jsonb_array_length(v_admin_roles)
  );

  return v_base || jsonb_build_object(
    'user', v_user,
    'accounts', v_accounts,
    'businesses', v_businesses,
    'companies', v_companies,
    'operators', v_operators,
    'subscriptions', v_subscriptions,
    'admin_roles', v_admin_roles,
    'activity', coalesce(v_base -> 'audit', '[]'::jsonb),
    'summary', v_summary
  );
end;
$$;


-- ===========================================================================
-- 18. Join KunThai review work is audited
-- Latest definitions before this: 20260902091000_join_kunthai_workflow.sql
-- ===========================================================================

create or replace function public.join_admin_set_priority(p_application_id uuid, p_priority text)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
  previous_priority text;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_priority not in ('low','normal','high','urgent') then
    raise exception 'Unknown priority';
  end if;

  select priority into previous_priority from public.join_applications where id = p_application_id for update;

  update public.join_applications
  set priority = p_priority, last_activity_at = now()
  where id = p_application_id
  returning * into application;

  if application.id is null then
    raise exception 'Application not found';
  end if;

  perform public.admin_log_action(
    'join.priority_changed', 'platform', 'join_application', application.id, null, '',
    jsonb_build_object('priority', previous_priority),
    jsonb_build_object('priority', p_priority)
  );
  return application;
end;
$$;

create or replace function public.join_admin_score_application(
  p_application_id uuid,
  p_score numeric,
  p_breakdown jsonb default '{}'::jsonb
)
returns public.join_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.join_applications;
  previous_application public.join_applications;
begin
  if not public.admin_has_permission('join.manage') then
    raise exception 'Not authorized';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 100) then
    raise exception 'A review score must be between 0 and 100';
  end if;

  select * into previous_application from public.join_applications where id = p_application_id for update;

  update public.join_applications
  set reviewer_score = p_score,
      score_breakdown = coalesce(p_breakdown, '{}'::jsonb),
      last_activity_at = now()
  where id = p_application_id
  returning * into application;

  if application.id is null then
    raise exception 'Application not found';
  end if;

  perform public.admin_log_action(
    'join.score_changed', 'platform', 'join_application', application.id, null, '',
    jsonb_build_object('reviewer_score', previous_application.reviewer_score, 'score_breakdown', previous_application.score_breakdown),
    jsonb_build_object('reviewer_score', application.reviewer_score, 'score_breakdown', application.score_breakdown)
  );
  return application;
end;
$$;

-- Notes and reviews are written straight from the console, so every write is
-- recorded by a trigger.
create or replace function public.join_audit_review_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application uuid := coalesce(
    nullif(to_jsonb(new) ->> 'application_id', '')::uuid,
    nullif(to_jsonb(old) ->> 'application_id', '')::uuid
  );
  v_subject text := case when tg_table_name = 'join_admin_notes' then 'note' else 'review' end;
begin
  perform public.admin_log_action(
    'join.' || v_subject || '_' || case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'deleted' end,
    'platform', 'join_application', v_application, null, '',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    jsonb_build_object('table', tg_table_name, 'recordId', coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'))
  );
  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.join_admin_notes') is not null then
    drop trigger if exists join_admin_notes_audit on public.join_admin_notes;
    create trigger join_admin_notes_audit
      after insert or update or delete on public.join_admin_notes
      for each row execute function public.join_audit_review_activity();
  end if;
  if to_regclass('public.join_reviews') is not null then
    drop trigger if exists join_reviews_audit on public.join_reviews;
    create trigger join_reviews_audit
      after insert or update or delete on public.join_reviews
      for each row execute function public.join_audit_review_activity();
  end if;
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================

revoke all on function public.admin_case_verification_permission(text) from public, anon, authenticated;
revoke all on function public.admin_case_target_table(text) from public, anon, authenticated;
revoke all on function public.admin_case_enforcement_type(text) from public, anon, authenticated;
revoke all on function public.admin_case_decision_state(text, text) from public, anon, authenticated;
revoke all on function public.admin_case_pending_state(text) from public, anon, authenticated;
revoke all on function public.admin_case_target_row(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_case_target_matches(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_case_write_target(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_case_decision_check(public.admin_cases, text) from public, anon, authenticated;
revoke all on function public.admin_capture_solo_fleet_case() from public, anon, authenticated;
revoke all on function public.join_audit_review_activity() from public, anon, authenticated;
revoke all on function public.admin_upsert_source_case(jsonb, text, text, text, text) from public, anon, authenticated;
revoke all on function public.guard_transport_operator_admin_fields() from public, anon, authenticated;
revoke all on function public.guard_transport_company_review_fields() from public, anon, authenticated;
revoke all on function public.admin_ensure_staff_profile() from public, anon, authenticated;

revoke all on function public.admin_case_decision_capabilities(uuid) from public, anon;
grant execute on function public.admin_case_decision_capabilities(uuid) to authenticated;
revoke all on function public.admin_apply_case_decision(uuid, text, text) from public, anon;
grant execute on function public.admin_apply_case_decision(uuid, text, text) to authenticated;
revoke all on function public.admin_undo_case_action(uuid, uuid, text) from public, anon;
grant execute on function public.admin_undo_case_action(uuid, uuid, text) to authenticated;
revoke all on function public.admin_claim_campaign_push(integer) from public, anon;
grant execute on function public.admin_claim_campaign_push(integer) to authenticated, service_role;
revoke all on function public.admin_publish_campaign(uuid, integer, boolean) from public, anon;
grant execute on function public.admin_publish_campaign(uuid, integer, boolean) to authenticated;
revoke all on function public.admin_get_user_workspace_v2(uuid) from public, anon;
grant execute on function public.admin_get_user_workspace_v2(uuid) to authenticated;
revoke all on function public.join_admin_set_priority(uuid, text) from public, anon;
grant execute on function public.join_admin_set_priority(uuid, text) to authenticated;
revoke all on function public.join_admin_score_application(uuid, numeric, jsonb) from public, anon;
grant execute on function public.join_admin_score_application(uuid, numeric, jsonb) to authenticated;

commit;
