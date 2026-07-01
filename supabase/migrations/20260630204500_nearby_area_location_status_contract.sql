alter table if exists public.nearby_area_locations
  drop constraint if exists nearby_area_locations_status_check;

update public.nearby_area_locations
set status = 'pending'
where status = 'submitted';

alter table if exists public.nearby_area_locations
  alter column status set default 'pending';

alter table if exists public.nearby_area_locations
  add constraint nearby_area_locations_status_check
  check (status in ('pending', 'approved', 'rejected', 'archived'));
