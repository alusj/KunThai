-- UrRide operator fixes (2026-10-08 audit).
--
-- One vehicle, one registration: a plate already used by a solo fleet or by
-- any company fleet cannot be registered again. Row security hides other
-- operators' and companies' fleets, so the apps ask this checked function,
-- which answers only yes or no.
--
-- Plates compare the way transport_fleets_visible_plate_unique_idx does:
-- trimmed, inner spaces collapsed, upper case. Placeholder plates never match.
--
-- p_for_company = false (solo fleet save): the caller's own solo fleets are
--   not a conflict (they are editing them); every company fleet is.
-- p_for_company = true (company fleet save): every solo fleet is a conflict,
--   as is every company fleet except the one being saved
--   (p_company_id + p_fleet_code).
-- Company runtime rows in transport_fleets mirror their company fleet and are
-- not counted separately.

create or replace function public.transport_plate_number_in_use(
  p_plate_number text,
  p_company_id uuid default null,
  p_fleet_code text default null,
  p_for_company boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plate text := upper(regexp_replace(btrim(coalesce(p_plate_number, '')), '[[:space:]]+', ' ', 'g'));
  v_operator uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check a plate number.';
  end if;
  if v_plate = '' or v_plate in ('NO-PLATE', 'PLATE PENDING', 'PENDING') then
    return false;
  end if;

  select id into v_operator from public.transport_operators where user_id = auth.uid();

  return exists (
      select 1
      from public.transport_fleets fleet
      where fleet.company_fleet_id is null
        and fleet.company_id is null
        and upper(regexp_replace(btrim(coalesce(fleet.plate_number, '')), '[[:space:]]+', ' ', 'g')) = v_plate
        and (coalesce(p_for_company, false) or fleet.operator_id is distinct from v_operator)
    )
    or exists (
      select 1
      from public.transport_company_fleets company_fleet
      where upper(regexp_replace(btrim(coalesce(company_fleet.plate_number, '')), '[[:space:]]+', ' ', 'g')) = v_plate
        and not (
          coalesce(p_for_company, false)
          and p_company_id is not null
          and company_fleet.company_id = p_company_id
          and upper(btrim(company_fleet.fleet_code)) = upper(btrim(coalesce(p_fleet_code, '')))
        )
    );
end;
$$;

revoke all on function public.transport_plate_number_in_use(text, uuid, text, boolean) from public, anon;
grant execute on function public.transport_plate_number_in_use(text, uuid, text, boolean) to authenticated;
