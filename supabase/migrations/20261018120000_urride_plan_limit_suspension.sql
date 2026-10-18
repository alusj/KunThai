-- UrRide plan limits now hold for vehicles that already exist, not only for
-- new ones. When a company has more vehicles (rentals included) than its plan
-- allows (for example a paid plan lapsed back to Free), the newest vehicles
-- beyond the limit are suspended: hidden from passengers and the rental
-- catalogue, and their Active switch cannot bring them back, until the plan is
-- renewed or upgraded (or other vehicles are removed). Nothing is deleted. The
-- oldest vehicles keep running.
begin;

alter table public.transport_company_fleets
  add column if not exists plan_suspended boolean not null default false,
  add column if not exists plan_suspended_at timestamptz;

create or replace function public.transport_company_fleet_plan_suspended(p_company_fleet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select fleet.plan_suspended from public.transport_company_fleets fleet where fleet.id = p_company_fleet_id),
    false
  );
$$;
revoke all on function public.transport_company_fleet_plan_suspended(uuid) from public;
grant execute on function public.transport_company_fleet_plan_suspended(uuid) to anon, authenticated;

-- Recomputes which of a company's vehicles are over its plan's vehicle limit.
-- Counted exactly like the capacity guard (transport_company_counted_fleets):
-- not archived, and not a deleted rental. The oldest `vehicle_limit` stay.
create or replace function public.kunthai_urride_apply_plan_limits(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_row record;
  v_changed integer := 0;
begin
  if p_company_id is null then return 0; end if;
  select entitlement.vehicle_limit into v_limit
  from public.kunthai_business_effective_entitlement('urride', p_company_id) entitlement
  limit 1;

  perform set_config('kunthai.urride_plan_enforce', 'on', true);
  for v_row in
    with counted as (
      select fleet.id, row_number() over (order by fleet.created_at, fleet.id) as rn
      from public.transport_company_fleets fleet
      where fleet.company_id = p_company_id
        and fleet.archived_at is null
        and not exists (
          select 1 from public.transport_company_rentals rental
          where rental.company_fleet_id = fleet.id and rental.deleted_at is not null
        )
    )
    select fleet.id,
      (counted.rn is not null and v_limit is not null and counted.rn > v_limit) as suspend
    from public.transport_company_fleets fleet
    left join counted on counted.id = fleet.id
    where fleet.company_id = p_company_id
      and fleet.plan_suspended is distinct from (counted.rn is not null and v_limit is not null and counted.rn > v_limit)
  loop
    update public.transport_company_fleets fleet
    set plan_suspended = v_row.suspend,
        plan_suspended_at = case when v_row.suspend then now() else null end,
        is_visible_to_passengers = case
          when v_row.suspend then false
          else lower(coalesce(fleet.active_status, '')) = 'active' or fleet.is_visible_to_passengers
        end,
        updated_at = now()
    where fleet.id = v_row.id;

    -- The passenger-facing fleet row: hidden while suspended; shown again on
    -- renewal only if its operator still has it switched on.
    update public.transport_fleets passenger_fleet
    set is_visible_to_passengers = case
          when v_row.suspend then false
          else lower(coalesce(passenger_fleet.active_status::text, '')) = 'active'
        end
    where passenger_fleet.company_fleet_id = v_row.id;

    v_changed := v_changed + 1;
  end loop;
  perform set_config('kunthai.urride_plan_enforce', 'off', true);
  return v_changed;
end;
$$;
revoke all on function public.kunthai_urride_apply_plan_limits(uuid) from public, anon, authenticated;

-- The app calls this when Fleet HQ opens, so a lapsed plan shows (and hides)
-- the right vehicles at once instead of waiting for the hourly job.
create or replace function public.sync_urride_plan_limits(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  return public.kunthai_urride_apply_plan_limits(p_company_id);
end;
$$;
revoke all on function public.sync_urride_plan_limits(uuid) from public, anon;
grant execute on function public.sync_urride_plan_limits(uuid) to authenticated;

-- Only kunthai_urride_apply_plan_limits may change the suspension, and a
-- suspended vehicle always stays hidden from passengers.
create or replace function public.transport_company_fleet_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('kunthai.urride_plan_enforce', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.plan_suspended := false;
      new.plan_suspended_at := null;
    else
      new.plan_suspended := old.plan_suspended;
      new.plan_suspended_at := old.plan_suspended_at;
    end if;
  end if;
  if new.plan_suspended then
    new.is_visible_to_passengers := false;
  end if;
  return new;
end;
$$;
revoke all on function public.transport_company_fleet_plan_guard() from public, anon, authenticated;
drop trigger if exists transport_company_fleet_plan_guard on public.transport_company_fleets;
create trigger transport_company_fleet_plan_guard
before insert or update on public.transport_company_fleets
for each row execute function public.transport_company_fleet_plan_guard();

create or replace function public.transport_fleet_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_fleet_id is not null
    and coalesce(new.is_visible_to_passengers, false)
    and public.transport_company_fleet_plan_suspended(new.company_fleet_id) then
    new.is_visible_to_passengers := false;
  end if;
  return new;
end;
$$;
revoke all on function public.transport_fleet_plan_guard() from public, anon, authenticated;
drop trigger if exists transport_fleet_plan_guard on public.transport_fleets;
create trigger transport_fleet_plan_guard
before insert or update of is_visible_to_passengers, company_fleet_id on public.transport_fleets
for each row execute function public.transport_fleet_plan_guard();

-- Re-check when the plan changes (renewed, upgraded, lapsed, packs bought).
create or replace function public.kunthai_urride_plan_limits_subscription_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.surface = 'urride' and new.transport_company_id is not null then
    perform public.kunthai_urride_apply_plan_limits(new.transport_company_id);
  end if;
  return new;
end;
$$;
revoke all on function public.kunthai_urride_plan_limits_subscription_changed() from public, anon, authenticated;
drop trigger if exists kunthai_urride_plan_limits_subscription_changed on public.kunthai_business_subscriptions;
create trigger kunthai_urride_plan_limits_subscription_changed
after insert or update on public.kunthai_business_subscriptions
for each row execute function public.kunthai_urride_plan_limits_subscription_changed();

-- Re-check when a vehicle leaves the count (archived, deleted, rental deleted),
-- so a suspended one can come back. Only those columns fire it, so the
-- function's own updates never loop.
create or replace function public.kunthai_urride_plan_limits_fleet_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.kunthai_urride_apply_plan_limits(coalesce(new.company_id, old.company_id));
  return null;
end;
$$;
revoke all on function public.kunthai_urride_plan_limits_fleet_changed() from public, anon, authenticated;
drop trigger if exists kunthai_urride_plan_limits_fleet_archived on public.transport_company_fleets;
create trigger kunthai_urride_plan_limits_fleet_archived
after update of archived_at or delete on public.transport_company_fleets
for each row execute function public.kunthai_urride_plan_limits_fleet_changed();
drop trigger if exists kunthai_urride_plan_limits_rental_deleted on public.transport_company_rentals;
create trigger kunthai_urride_plan_limits_rental_deleted
after update of deleted_at on public.transport_company_rentals
for each row execute function public.kunthai_urride_plan_limits_fleet_changed();

-- A suspended rental vehicle cannot be reserved.
create or replace function public.transport_rental_reservation_plan_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.transport_company_rentals rental
    where rental.id = new.rental_id
      and public.transport_company_fleet_plan_suspended(rental.company_fleet_id)
  ) then
    raise exception 'This rental vehicle is not available right now.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.transport_rental_reservation_plan_guard() from public, anon, authenticated;
drop trigger if exists transport_rental_reservation_plan_guard on public.transport_rental_reservations;
create trigger transport_rental_reservation_plan_guard
before insert on public.transport_rental_reservations
for each row execute function public.transport_rental_reservation_plan_guard();

-- Rental catalogue: suspended vehicles are not listed for customers; the
-- company still sees them (with plan_suspended) to know why.
create or replace function public.list_transport_rentals(p_rental_id uuid default null::uuid, p_company_id uuid default null::uuid, p_country text default null::text, p_limit integer default 200, p_offset integer default 0)
returns setof jsonb
language sql
stable security definer
set search_path to 'public', 'auth'
as $function$
 select to_jsonb(r)||jsonb_build_object('company_name',c.company_name,'company_phone',c.phone,'company_email',c.email,'company_country',c.country,'company_city',c.city,'can_manage',public.can_manage_transport_rentals(r.company_id),
   'plan_suspended',public.transport_company_fleet_plan_suspended(r.company_fleet_id),
   'display_status',case
     when exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.status='active' and b.starts_at<=now() and b.ends_at>now()) then 'rented_out'
     when exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.status='confirmed' and b.starts_at<=now() and b.ends_at>now()) then 'reserved'
     else r.status end)
 from public.transport_company_rentals r join public.transport_companies c on c.id=r.company_id
 where (p_rental_id is null or r.id=p_rental_id) and (p_company_id is null or r.company_id=p_company_id) and (p_country is null or c.country=p_country)
 and ((r.status='available' and r.deleted_at is null and not public.transport_company_fleet_plan_suspended(r.company_fleet_id))
   or (p_company_id is not null and public.can_manage_transport_rentals(r.company_id))
   or (p_rental_id is not null and (public.can_manage_transport_rentals(r.company_id) or exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.customer_user_id=auth.uid()))))
 order by r.created_at desc, r.id
 limit least(greatest(coalesce(p_limit,200),1),500) offset greatest(coalesce(p_offset,0),0);
$function$;

-- Hourly safety net: a paid plan's grace period can end without the
-- subscription row changing.
create or replace function public.kunthai_urride_apply_all_plan_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_company uuid; v_total integer := 0;
begin
  for v_company in select distinct fleet.company_id from public.transport_company_fleets fleet where fleet.company_id is not null loop
    v_total := v_total + public.kunthai_urride_apply_plan_limits(v_company);
  end loop;
  return v_total;
end;
$$;
revoke all on function public.kunthai_urride_apply_all_plan_limits() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $cron$select cron.unschedule(jobid) from cron.job where jobname = 'urride-plan-limits'$cron$;
      execute $cron$select cron.schedule('urride-plan-limits', '7 * * * *', 'select public.kunthai_urride_apply_all_plan_limits()')$cron$;
    exception when others then
      raise notice 'urride-plan-limits was not scheduled: %', sqlerrm;
    end;
  end if;
end;
$$;

-- Bring every company in line now.
select public.kunthai_urride_apply_all_plan_limits();

commit;
