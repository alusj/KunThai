-- Make admin suspensions/restrictions hide content no matter what other read
-- policies exist.
--
-- 20261001150000 tightened the known buyer/passenger read policies, but the
-- live database also has read policies this repo cannot see (created outside
-- migrations). Postgres ORs permissive policies together, so any one of them
-- still let buyers read a suspended business. A RESTRICTIVE policy is ANDed
-- with every permissive policy, so the enforcement holds regardless.
--
-- Signed-out visitors get a plain "not hidden" check. Signed-in users also
-- pass when they own/manage the record or are KunThai admins, via helpers that
-- only ever answer about the caller (no probing other accounts).

-- Is the caller a KunThai admin? Answers only about auth.uid().
create or replace function public.kunthai_viewer_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.is_kunthai_admin(auth.uid());
$$;

-- Does the caller own or manage this UrRide fleet (operator or company staff)?
create or replace function public.transport_viewer_manages_fleet(p_operator_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.transport_operators operator where operator.id = p_operator_id and operator.user_id = auth.uid())
    or (p_company_id is not null and (
      exists (select 1 from public.transport_companies company where company.id = p_company_id and company.owner_user_id = auth.uid())
      or public.transport_company_user_has_permission(p_company_id, 'manage_operators', auth.uid())
      or public.transport_company_user_has_permission(p_company_id, 'view_all_bookings', auth.uid())
    ))
  );
$$;

grant execute on function public.kunthai_enforcement_blocks(text, uuid, text) to anon, authenticated;
grant execute on function public.marketplace_is_business_staff(uuid) to authenticated;
grant execute on function public.kunthai_viewer_is_admin() to authenticated;
grant execute on function public.transport_viewer_manages_fleet(uuid, uuid) to authenticated;
revoke all on function public.kunthai_viewer_is_admin() from anon;
revoke all on function public.transport_viewer_manages_fleet(uuid, uuid) from anon;

-- --- UrMall ------------------------------------------------------------------

drop policy if exists "enforcement hides suspended businesses" on public.marketplace_businesses;
drop policy if exists "enforcement hides suspended businesses from visitors" on public.marketplace_businesses;
create policy "enforcement hides suspended businesses from visitors" on public.marketplace_businesses
  as restrictive
  for select to anon
  using (not public.kunthai_enforcement_blocks('marketplace_business', id, 'discovery'));

drop policy if exists "enforcement hides suspended businesses from users" on public.marketplace_businesses;
create policy "enforcement hides suspended businesses from users" on public.marketplace_businesses
  as restrictive
  for select to authenticated
  using (
    not public.kunthai_enforcement_blocks('marketplace_business', id, 'discovery')
    or public.marketplace_is_business_staff(id)
    or public.kunthai_viewer_is_admin()
  );

do $$
declare
  listing_table text;
begin
  foreach listing_table in array array[
    'marketplace_products', 'marketplace_restaurant_menu_items', 'marketplace_hotel_rooms',
    'marketplace_hotel_images', 'marketplace_property_listings'
  ] loop
    if to_regclass('public.' || listing_table) is not null then
      execute format('drop policy if exists %I on public.%I', 'enforcement hides suspended listings', listing_table);
      execute format('drop policy if exists %I on public.%I', 'enforcement hides suspended listings from visitors', listing_table);
      execute format('drop policy if exists %I on public.%I', 'enforcement hides suspended listings from users', listing_table);
      execute format(
        'create policy %I on public.%I as restrictive for select to anon using ('
        || 'not public.kunthai_enforcement_blocks(''marketplace_business'', business_id, ''discovery''))',
        'enforcement hides suspended listings from visitors', listing_table
      );
      execute format(
        'create policy %I on public.%I as restrictive for select to authenticated using ('
        || 'not public.kunthai_enforcement_blocks(''marketplace_business'', business_id, ''discovery'')'
        || ' or public.marketplace_is_business_staff(business_id)'
        || ' or public.kunthai_viewer_is_admin())',
        'enforcement hides suspended listings from users', listing_table
      );
    end if;
  end loop;
end;
$$;

-- --- UrRide ------------------------------------------------------------------

drop policy if exists "enforcement hides suspended fleets" on public.transport_fleets;
drop policy if exists "enforcement hides suspended fleets from visitors" on public.transport_fleets;
create policy "enforcement hides suspended fleets from visitors" on public.transport_fleets
  as restrictive
  for select to anon
  using (
    not public.kunthai_enforcement_blocks('transport_operator', operator_id, 'discovery')
    and (company_id is null or not public.kunthai_enforcement_blocks('transport_company', company_id, 'discovery'))
  );

drop policy if exists "enforcement hides suspended fleets from users" on public.transport_fleets;
create policy "enforcement hides suspended fleets from users" on public.transport_fleets
  as restrictive
  for select to authenticated
  using (
    (
      not public.kunthai_enforcement_blocks('transport_operator', operator_id, 'discovery')
      and (company_id is null or not public.kunthai_enforcement_blocks('transport_company', company_id, 'discovery'))
    )
    or public.transport_viewer_manages_fleet(operator_id, company_id)
    or public.kunthai_viewer_is_admin()
  );

notify pgrst, 'reload schema';
