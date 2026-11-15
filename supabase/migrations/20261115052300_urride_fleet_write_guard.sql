-- UrRide: what an operator may write on their own vehicle row (2026-11-15).
--
-- "operators can manage own fleets" lets an operator insert and update their
-- transport_fleets rows directly. Nothing stopped a modified app from:
--   * writing its own rating, completed jobs and acceptance rate (passengers
--     see the rating and lists are sorted by it);
--   * pointing its vehicle at a company (company_id / company_fleet_id): on a
--     company vehicle with no operator yet, that took the vehicle over and
--     copied the company's verification badge;
--   * changing the price or plate of a company vehicle it drives;
--   * creating an operator profile with a wallet balance already on it.
--
-- Company vehicles are linked only by the server (accepting an invitation,
-- the company assigning a vehicle), and statistics are never written by the
-- app. This trigger keeps those fields as they are for direct writes from the
-- app; server functions (which run as their owner) and KunThai reviewers are
-- not affected.

begin;

create or replace function public.transport_fleets_guard_client_fields()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

-- Named to run before the other guards on this table (they read the company link).
drop trigger if exists a_transport_fleets_guard_client_fields on public.transport_fleets;
create trigger a_transport_fleets_guard_client_fields
before insert or update on public.transport_fleets
for each row execute function public.transport_fleets_guard_client_fields();

-- A new operator profile starts with an empty wallet.
create or replace function public.guard_transport_operator_insert_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.kunthai_can_review_transport() then return new; end if;
  if new.verification_status::text in ('verified', 'verified_recommended') then
    new.verification_status := 'verification_pending'::public.transport_verification_status;
  end if;
  if coalesce(new.account_status, '') in ('approved', 'rejected', 'suspended') then
    new.account_status := 'submitted';
  end if;
  new.wallet_balance := 0;
  new.pending_payout := 0;
  return new;
end;
$$;

commit;
