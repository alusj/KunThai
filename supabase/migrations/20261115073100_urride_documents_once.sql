-- UrRide: documents are uploaded once, and a fleet's type is fixed (2026-11-15).
--
-- * Leaving a company no longer removes the operator profile: the profile and
--   the documents on it stay, so a later invitation reuses them instead of
--   asking again (the app shows no operator dashboard while there is nothing
--   to operate). "Delete my UrRide account" is still what removes everything.
-- * Accepting with documents already on file says so in the company activity.
-- * The KunThai admin operator page lists the companies an operator belongs
--   to and whether each one reused the documents on file (no new review).
-- * The fleet type of a registered vehicle cannot be changed from the app,
--   for a solo vehicle or a company one.

begin;

CREATE OR REPLACE FUNCTION public.leave_transport_company(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_operator_ids uuid[] := '{}';
  v_fleet_ids uuid[] := '{}';
  v_member_count integer := 0;
  v_operator_removed boolean := false;
begin
  if v_uid is null then
    raise exception 'Sign in to leave this company.';
  end if;

  if exists (
    select 1 from public.transport_companies company
    where company.id = p_company_id and company.owner_user_id = v_uid
  ) then
    raise exception 'The company creator cannot leave. Delete the company instead.';
  end if;

  perform 1 from public.transport_company_members member
  where member.company_id = p_company_id and member.user_id = v_uid
  for update;

  select count(*),
         coalesce(array_agg(distinct member.operator_id) filter (where member.operator_id is not null), '{}')
  into v_member_count, v_operator_ids
  from public.transport_company_members member
  where member.company_id = p_company_id
    and member.user_id = v_uid
    and member.status in ('active', 'suspended', 'pending');

  if v_member_count = 0 then
    raise exception 'You are no longer a member of this company.';
  end if;

  select coalesce(array_agg(distinct id), '{}') into v_operator_ids
  from (
    select unnest(v_operator_ids) as id
    union
    select operator.id from public.transport_operators operator where operator.user_id = v_uid
  ) ids;

  if exists (
    select 1
    from public.transport_trips trip
    join public.transport_fleets fleet on fleet.id = trip.fleet_id
    where fleet.company_id = p_company_id
      and fleet.operator_id = any(v_operator_ids)
      and trip.status in ('accepted', 'arrived', 'start_requested', 'in_progress', 'paused')
  ) then
    raise exception 'You have a company trip in progress. Finish or cancel it before leaving.';
  end if;

  v_fleet_ids := public.transport_company_exit_member(p_company_id, v_uid, 'left');

  -- The operator profile and its documents stay for a later invitation.

  return jsonb_build_object('ok', true, 'companyId', p_company_id,
    'companyFleetIds', to_jsonb(v_fleet_ids), 'operatorRemoved', v_operator_removed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.transport_fleets_guard_client_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  -- Direct writes from the app run as the signed-in role.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.kunthai_can_review_transport() then return new; end if;

  if tg_op = 'INSERT' then
    new.company_id := null;
    new.company_fleet_id := null;
    new.rating := null;
    new.completed_jobs := 0;
    new.acceptance_rate := 0;
    new.average_response_seconds := 0;
    return new;
  end if;

  new.operator_id := old.operator_id;
  new.company_id := old.company_id;
  new.company_fleet_id := old.company_fleet_id;
  new.rating := old.rating;
  new.completed_jobs := old.completed_jobs;
  new.acceptance_rate := old.acceptance_rate;
  new.average_response_seconds := old.average_response_seconds;
  -- A registered vehicle keeps its type.
  new.fleet_type := old.fleet_type;

  -- A company vehicle's identity and prices are set by the company in Fleet HQ.
  if old.company_fleet_id is not null then
    new.fleet_code := old.fleet_code;
    new.fleet_type := old.fleet_type;
    new.plate_number := old.plate_number;
    new.base_fare := old.base_fare;
    new.price_per_km := old.price_per_km;
    new.price_per_hour := old.price_per_hour;
    new.price_hint := old.price_hint;
    new.country := old.country;
    new.country_iso := old.country_iso;
    new.currency := old.currency;
  end if;
  return new;
end;
$function$;

create or replace function public.transport_company_fleets_lock_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Direct writes from the app run as the signed-in role; KunThai reviewers
  -- and server functions are not affected.
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if public.kunthai_can_review_transport() then return new; end if;
  new.fleet_type := old.fleet_type;
  return new;
end;
$$;

drop trigger if exists a_transport_company_fleets_lock_type on public.transport_company_fleets;
create trigger a_transport_company_fleets_lock_type
before update on public.transport_company_fleets
for each row execute function public.transport_company_fleets_lock_type();

CREATE OR REPLACE FUNCTION public.transport_company_record_invite_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  activity_kind text;
  activity_title text;
  activity_body text;
  documents_submitted boolean;
begin
  documents_submitted := coalesce((new.documents ->> 'operatorDocumentsSubmitted')::boolean, false);

  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and (new.documents ->> 'operatorDocumentsSubmittedAt') is not distinct from (old.documents ->> 'operatorDocumentsSubmittedAt') then
    return new;
  end if;

  if new.status = 'rejected' then
    activity_kind := 'operator_invite_rejected';
    activity_title := 'Operator invitation declined';
    activity_body := coalesce(nullif(new.operator_name, ''), 'An operator') || ' declined the company invitation.';
  elsif new.status = 'accepted' then
    activity_kind := case when documents_submitted then 'operator_invite_documents_submitted' else 'operator_invite_accepted' end;
    activity_title := case when documents_submitted then 'Operator documents submitted' else 'Operator invitation accepted' end;
    activity_body := coalesce(nullif(new.operator_name, ''), 'An operator') ||
      case when documents_submitted then ' accepted and submitted operator documents for review.'
        when coalesce((new.documents ->> 'reusedExistingDocuments')::boolean, false)
          then ' accepted the company invitation. Their driving licence is already on file with KunThai, so nothing new was uploaded.'
        else ' accepted the company invitation.' end;
  else
    return new;
  end if;

  insert into public.transport_company_activities (
    company_id,
    actor_user_id,
    activity_type,
    title,
    body,
    metadata
  ) values (
    new.company_id,
    coalesce(new.operator_user_id, auth.uid()),
    activity_kind,
    activity_title,
    activity_body,
    jsonb_build_object(
      'inviteId', new.id,
      'requestId', new.request_id,
      'operatorId', new.operator_id,
      'operatorUserId', new.operator_user_id,
      'operatorPublicId', new.operator_public_id,
      'operatorName', new.operator_name,
      'fleetCode', new.fleet_code,
      'status', new.status
    )
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_transport_operator(p_operator_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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
    'companies', coalesce((select jsonb_agg(jsonb_build_object(
        'company', company.company_name,
        'role', member.role,
        'status', member.status,
        'joinedAt', member.joined_at,
        'documentsReused', coalesce((
          select bool_or(coalesce((invite.documents ->> 'reusedExistingDocuments')::boolean, false))
          from public.transport_company_operator_invites invite
          where invite.company_id = member.company_id and invite.status = 'accepted'
            and (invite.operator_user_id = member.user_id or invite.operator_id = p_operator_id)
        ), false)
      ) order by member.joined_at desc nulls last)
      from public.transport_company_members member
      join public.transport_companies company on company.id = member.company_id
      where member.user_id = v_operator.user_id and member.role <> 'owner'), '[]'::jsonb),
    'governance', public.admin_target_governance('transport_operator', p_operator_id)
  );
end;
$function$;

commit;
