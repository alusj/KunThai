-- Account deletion requests are submitted by users but reviewed by admin.
-- The request stores a compact source snapshot so admins can inspect connected
-- records before applying any destructive action.

create or replace function public.request_account_deletion(
  surface_key text,
  target_id uuid,
  request_reason text default '',
  source_snapshot jsonb default '{}'::jsonb
)
returns public.admin_cases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  normalized_surface text := lower(btrim(coalesce(surface_key, '')));
  target_uuid uuid := target_id;
  clean_reason text := left(btrim(coalesce(request_reason, '')), 4000);
  source jsonb := coalesce(source_snapshot, '{}'::jsonb);
  target_case public.admin_cases;
  business record;
  case_sector text;
  case_resource_type text;
  case_title text;
  country_code text;
  country_label text;
begin
  if uid is null then
    raise exception 'Sign in before requesting account deletion.' using errcode = '28000';
  end if;

  if clean_reason = '' then
    clean_reason := 'User requested account deletion from the app menu.';
  end if;

  if normalized_surface = 'urmall_business' then
    if target_uuid is null then
      raise exception 'Choose a business before requesting deletion.';
    end if;

    if to_regclass('public.marketplace_businesses') is null then
      raise exception 'UrMall business records are not available.';
    end if;

    select *
    into business
    from public.marketplace_businesses
    where id = target_uuid and user_id = uid;

    if not found then
      raise exception 'This business could not be found on your account.';
    end if;

    case_sector := 'marketplace';
    case_resource_type := 'urmall_account_deletion_request';
    case_title := 'Account deletion request: ' || coalesce(nullif(business.business_name, ''), 'UrMall business');
    country_code := nullif(business.country_iso, '');
    country_label := nullif(business.country, '');
    source := source || jsonb_build_object(
      'id', target_uuid,
      'surface', 'UrMall',
      'surface_key', normalized_surface,
      'user_id', uid,
      'reporter_id', uid,
      'business_id', target_uuid,
      'business_name', business.business_name,
      'account_name', business.business_name,
      'business_kind', coalesce(business.business_kind, 'retail'),
      'country_iso', country_code,
      'country', country_label,
      'city', business.city,
      'reason', clean_reason
    );
  elsif normalized_surface = 'urride_account' then
    target_uuid := coalesce(target_uuid, uid);
    if target_uuid <> uid then
      raise exception 'You can only request deletion for your own UrRide account.';
    end if;

    case_sector := 'transport';
    case_resource_type := 'urride_account_deletion_request';
    case_title := 'Account deletion request: ' || coalesce(nullif(source ->> 'account_name', ''), 'UrRide passenger');
    country_code := nullif(source ->> 'country_iso', '');
    country_label := nullif(source ->> 'country', '');
    source := source || jsonb_build_object(
      'id', uid,
      'surface', 'UrRide',
      'surface_key', normalized_surface,
      'user_id', uid,
      'reporter_id', uid,
      'reason', clean_reason
    );
  else
    raise exception 'Unsupported account deletion surface.';
  end if;

  insert into public.admin_cases (
    sector, queue, case_type, resource_type, resource_id, title, description,
    priority, subject_user_id, reporter_user_id, country_iso, country_name, sla_due_at, metadata
  ) values (
    case_sector, 'support', 'account_deletion_request', case_resource_type, target_uuid,
    case_title, clean_reason, 'high', uid, uid, country_code, country_label,
    now() + interval '8 hours',
    jsonb_build_object('source', source)
  )
  on conflict (resource_type, resource_id) do update
  set title = excluded.title,
      description = excluded.description,
      priority = 'high',
      subject_user_id = excluded.subject_user_id,
      reporter_user_id = excluded.reporter_user_id,
      country_iso = coalesce(excluded.country_iso, public.admin_cases.country_iso),
      country_name = coalesce(excluded.country_name, public.admin_cases.country_name),
      metadata = excluded.metadata,
      status = case
        when public.admin_cases.status in ('resolved', 'closed') then 'reopened'
        else public.admin_cases.status
      end,
      resolution_code = case
        when public.admin_cases.status in ('resolved', 'closed') then null
        else public.admin_cases.resolution_code
      end,
      resolution_note = case
        when public.admin_cases.status in ('resolved', 'closed') then null
        else public.admin_cases.resolution_note
      end,
      resolved_at = case
        when public.admin_cases.status in ('resolved', 'closed') then null
        else public.admin_cases.resolved_at
      end,
      closed_at = case
        when public.admin_cases.status in ('resolved', 'closed') then null
        else public.admin_cases.closed_at
      end,
      updated_at = now()
  returning * into target_case;

  return target_case;
end;
$$;

revoke all on function public.request_account_deletion(text, uuid, text, jsonb) from public, anon;
grant execute on function public.request_account_deletion(text, uuid, text, jsonb) to authenticated;

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

  if (
      normalized_decision in ('remove','suspend')
      or (
        target_case.resource_type in ('urmall_account_deletion_request','urride_account_deletion_request')
        and normalized_decision = 'approve'
      )
    )
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

  insert into public.admin_case_events(case_id, actor_user_id, event_type, from_status, to_status, summary, metadata)
  values (case_uuid, auth.uid(), 'decision_applied', target_case.status, updated_case.status, normalized_reason, jsonb_build_object('decision', normalized_decision));
  perform public.admin_log_action('case.decision_applied', target_case.sector, target_case.resource_type, target_case.resource_id, case_uuid, normalized_reason, to_jsonb(target_case), to_jsonb(updated_case), jsonb_build_object('decision', normalized_decision));
  return updated_case;
end;
$$;
