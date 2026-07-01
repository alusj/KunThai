-- Sole-operator fleet registrations are stored separately from company fleets.
-- Connect them to the same verification queue without changing either workflow.
do $$
begin
  if to_regclass('public.transport_fleets') is not null then
    drop trigger if exists admin_intake_transport_solo_fleets on public.transport_fleets;
    create trigger admin_intake_transport_solo_fleets
      after insert or update on public.transport_fleets
      for each row execute function public.admin_capture_source_case(
        'transport_solo_fleet_verification',
        'transport',
        'verification',
        'fleet_verification'
      );

    perform public.admin_upsert_source_case(
      to_jsonb(fleet),
      'transport_solo_fleet_verification',
      'transport',
      'verification',
      'fleet_verification'
    )
    from public.transport_fleets fleet
    where fleet.verification_status::text in ('verification_pending', 'pending_review', 'pending', 'under_review');
  end if;
end;
$$;

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
        updated_at = now()
    where id = new.resource_id;
  elsif new.resource_type = 'marketplace_business_registration'
     and to_regclass('public.marketplace_businesses') is not null
     and new.resolution_code in ('approve', 'reject') then
    update public.marketplace_businesses
    set verification_status = case when new.resolution_code = 'approve' then 'verified' else 'rejected' end,
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
