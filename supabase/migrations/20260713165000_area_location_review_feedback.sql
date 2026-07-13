-- Keep Area View submitters informed when admins approve or decline a
-- community-added location.
alter table if exists public.nearby_area_locations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists admin_decision text,
  add column if not exists admin_decision_reason text,
  add column if not exists admin_decided_at timestamptz;

do $$
begin
  if to_regclass('public.nearby_area_locations') is not null then
    execute 'drop policy if exists "Users read own Area View submissions" on public.nearby_area_locations';
    execute $policy$
      create policy "Users read own Area View submissions"
      on public.nearby_area_locations for select to authenticated
      using (user_id = auth.uid() or submitted_by = auth.uid())
    $policy$;
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

revoke all on function public.admin_sync_registration_case_decision() from public, anon, authenticated;
