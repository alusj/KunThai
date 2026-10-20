-- Verification queue clean-up (UrRide verification plan, step 1).
--
--  1. Rental fleets are not verified: a company fleet in the Rental category
--     no longer opens a fleet verification case.
--  2. Deleting the record behind a verification case closes the case
--     (resolution 'record_removed'). Deleting a document also refreshes the
--     document list on its parent registration case.
--  3. One-time: open cases for rental fleets close as 'rental_not_verified',
--     and open cases whose record is already gone close as 'record_removed'.
--
-- Builds on 20261019120000_verification_review_workflow.sql.
-- Safe to run more than once.

begin;

-- ---------------------------------------------------------------------------
-- 1. Rentals skip verification intake
-- Latest definition before this: 20260627120000_kunthai_admin_foundation.sql
-- ---------------------------------------------------------------------------

create or replace function public.admin_capture_source_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_argv[0] = 'transport_fleet_verification'
     and coalesce(to_jsonb(new) ->> 'service_category', '') = 'Rental' then
    return new;
  end if;
  perform public.admin_upsert_source_case(to_jsonb(new), tg_argv[0], tg_argv[1], tg_argv[2], tg_argv[3]);
  return new;
end;
$$;

revoke all on function public.admin_capture_source_case() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. A deleted record closes its open verification cases
-- ---------------------------------------------------------------------------

create or replace function public.admin_close_cases_for_deleted_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_type text := tg_argv[0];
  v_case record;
  v_parent_type text;
  v_parent_id uuid;
  v_evidence jsonb;
begin
  for v_case in
    update public.admin_cases
    set status = 'closed',
        resolution_code = 'record_removed',
        resolution_note = 'The record was deleted, so there is nothing left to verify.',
        closed_at = now(),
        updated_at = now()
    where resource_type = v_resource_type
      and resource_id = old.id
      and status not in ('resolved', 'closed')
    returning id
  loop
    insert into public.admin_case_events(case_id, actor_user_id, event_type, to_status, summary, metadata)
    values (v_case.id, auth.uid(), 'record_removed', 'closed',
      'Closed automatically: the record was deleted.',
      jsonb_build_object('resourceType', v_resource_type));
  end loop;

  -- A deleted document leaves its parent case's evidence list.
  if tg_table_name = 'transport_operator_documents' then
    v_parent_type := 'transport_operator_verification';
    v_parent_id := old.operator_id;
    select coalesce(jsonb_agg(to_jsonb(document) order by document.uploaded_at), '[]'::jsonb) into v_evidence
    from public.transport_operator_documents document where document.operator_id = old.operator_id;
  elsif tg_table_name = 'marketplace_business_documents' then
    v_parent_type := 'marketplace_business_registration';
    v_parent_id := old.business_id;
    select coalesce(jsonb_agg(to_jsonb(document) order by document.created_at), '[]'::jsonb) into v_evidence
    from public.marketplace_business_documents document where document.business_id = old.business_id;
  end if;

  if v_parent_type is not null then
    update public.admin_cases
    set metadata = jsonb_set(metadata, '{source,registration_documents}', v_evidence, true),
        updated_at = now()
    where resource_type = v_parent_type
      and resource_id = v_parent_id
      and jsonb_typeof(metadata -> 'source') = 'object';
  end if;

  return old;
end;
$$;

revoke all on function public.admin_close_cases_for_deleted_record() from public, anon, authenticated;

do $$
declare
  source record;
begin
  for source in
    select * from (values
      ('transport_operators', 'transport_operator_verification'),
      ('transport_companies', 'transport_company_verification'),
      ('transport_company_fleets', 'transport_fleet_verification'),
      ('transport_fleets', 'transport_solo_fleet_verification'),
      ('transport_operator_documents', 'transport_document_verification'),
      ('marketplace_businesses', 'marketplace_business_registration'),
      ('marketplace_seller_verification_requests', 'marketplace_verification'),
      ('marketplace_business_documents', 'marketplace_business_document')
    ) as configured(table_name, resource_type)
  loop
    if to_regclass('public.' || source.table_name) is not null then
      execute format('drop trigger if exists admin_close_cases_on_delete on public.%I', source.table_name);
      execute format(
        'create trigger admin_close_cases_on_delete after delete on public.%I for each row execute function public.admin_close_cases_for_deleted_record(%L)',
        source.table_name, source.resource_type
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. One-time clean-up of the queue
-- ---------------------------------------------------------------------------

with closed as (
  update public.admin_cases c
  set status = 'closed',
      resolution_code = 'rental_not_verified',
      resolution_note = 'Rental fleets are not verified; the company''s own verification covers them.',
      closed_at = now(),
      updated_at = now()
  from public.transport_company_fleets fleet
  where c.resource_type = 'transport_fleet_verification'
    and fleet.id = c.resource_id
    and fleet.service_category = 'Rental'
    and c.status not in ('resolved', 'closed')
  returning c.id
)
insert into public.admin_case_events(case_id, event_type, to_status, summary)
select id, 'rental_not_verified', 'closed', 'Closed: rental fleets are not verified.' from closed;

do $$
declare
  v_type text;
  v_table text;
  v_closed integer;
begin
  foreach v_type in array array[
    'transport_operator_verification', 'transport_company_verification', 'transport_fleet_verification',
    'transport_solo_fleet_verification', 'transport_document_verification',
    'marketplace_business_registration', 'marketplace_verification', 'marketplace_business_document'
  ] loop
    v_table := public.admin_case_target_table(v_type);
    if v_table is null or to_regclass('public.' || v_table) is null then continue; end if;
    execute format($sql$
      with closed as (
        update public.admin_cases c
        set status = 'closed',
            resolution_code = 'record_removed',
            resolution_note = 'The record was deleted, so there is nothing left to verify.',
            closed_at = now(),
            updated_at = now()
        where c.resource_type = %L
          and c.status not in ('resolved', 'closed')
          and c.resource_id is not null
          and not exists (select 1 from public.%I target where target.id = c.resource_id)
        returning c.id
      ), logged as (
        insert into public.admin_case_events(case_id, event_type, to_status, summary)
        select id, 'record_removed', 'closed', 'Closed automatically: the record was deleted.' from closed
        returning 1
      )
      select count(*) from logged
    $sql$, v_type, v_table) into v_closed;
    raise notice '% closed: %', v_type, v_closed;
  end loop;
end;
$$;

commit;
