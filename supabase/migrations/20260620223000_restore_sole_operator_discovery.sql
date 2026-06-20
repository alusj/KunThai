-- Restore the original sole-operator discovery contract. Sole fleet records
-- remain readable exactly as before; only company runtime fleets use the
-- explicit passenger-visibility flag introduced for Fleet HQ.

drop policy if exists "passengers can read registered fleets" on public.transport_fleets;
drop policy if exists "passengers can read visible fleets" on public.transport_fleets;

create policy "passengers can read registered and visible company fleets"
on public.transport_fleets
for select
to anon, authenticated
using (
  company_fleet_id is null
  or is_visible_to_passengers = true
);
