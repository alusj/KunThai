-- Behaviour checks for 20261001150000_admin_operations_platform.sql.
--
-- Runs entirely inside one transaction and ROLLS BACK, so it is safe to run
-- against a database that already has the migration applied (for example,
-- paste it into the Supabase SQL editor). Every check raises on failure; the
-- last line reports "ADMIN OPERATIONS PLATFORM: ALL CHECKS PASSED".

begin;

create temporary table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon;

-- Act as a user: authenticated role + JWT subject, the way PostgREST does it.
create or replace function pg_temp.act_as(p_key text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce((select v::text from t_ids where k = p_key), ''), true);
  if p_key = 'anon' then execute 'set local role anon';
  elsif p_key is not null then execute 'set local role authenticated';
  end if;
end;
$$;

create or replace function pg_temp.id(p_key text) returns uuid language sql stable as $$ select v from t_ids where k = p_key $$;

create or replace function pg_temp.expect_error(p_sql text, p_fragment text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_fragment) in lower(sqlerrm)) = 0 then
      raise exception 'Expected error containing "%" but got "%" for: %', p_fragment, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'Expected error containing "%" but the statement succeeded: %', p_fragment, p_sql;
end;
$$;

grant execute on function pg_temp.id(text) to authenticated, anon;

-- ---------------------------------------------------------------- setup ---
do $$
declare
  user_key text;
begin
  foreach user_key in array array['super', 'mgr', 'risk', 'support', 'transport', 'seller', 'buyer', 'operator', 'operator2', 'company_owner'] loop
    insert into t_ids values (user_key, gen_random_uuid());
    insert into auth.users (id, email, raw_user_meta_data)
    values (pg_temp.id(user_key), user_key || '-' || substr(md5(random()::text), 1, 6) || '@checks.kunthai.test', jsonb_build_object('display_name', initcap(user_key)));
  end loop;
end;
$$;

select pg_temp.act_as(null);  -- service role: no auth.uid()
insert into public.admin_assignments (user_id, role_id, authority_level)
select pg_temp.id('super'), id, 5 from public.admin_roles where role_key = 'super_admin';
insert into public.admin_assignments (user_id, role_id, authority_level)
select pg_temp.id('mgr'), id, 4 from public.admin_roles where role_key = 'marketplace_manager';
insert into public.admin_assignments (user_id, role_id, authority_level)
select pg_temp.id('risk'), id, 3 from public.admin_roles where role_key = 'risk_officer';
insert into public.admin_assignments (user_id, role_id, authority_level)
select pg_temp.id('support'), id, 2 from public.admin_roles where role_key = 'support_officer';
insert into public.admin_assignments (user_id, role_id, authority_level)
select pg_temp.id('transport'), id, 4 from public.admin_roles where role_key = 'transport_manager';
update public.admin_staff_profiles set level_key = 'executive' where user_id = pg_temp.id('super');
-- Admin powers need an unlocked console (20261003100000). Open one for each
-- test admin; the lock itself is checked in the last section.
do $$ begin
  if to_regclass('public.admin_console_sessions') is not null then
    insert into public.admin_console_sessions (user_id, session_key, method, expires_at)
    select v, '', 'passcode', now() + interval '1 day' from t_ids where k in ('super', 'mgr', 'risk', 'support', 'transport');
  end if;
end $$;

do $$ begin
  assert (select count(*) from public.admin_staff_profiles where user_id in (pg_temp.id('mgr'), pg_temp.id('risk'), pg_temp.id('support'))) = 3,
    'every new admin gets a staff profile';
  assert (select level_key from public.admin_staff_profiles where user_id = pg_temp.id('mgr')) = 'manager', 'authority 4 maps to Manager';
  assert (select level_key from public.admin_staff_profiles where user_id = pg_temp.id('support')) = 'specialist', 'authority 2 maps to Specialist';
end $$;

-- Test records are built from a real existing row of each table (copied as a
-- template, then the identifying fields are replaced). That way every required
-- column, check constraint and trigger rule of the live schema is satisfied
-- without this script having to know them. Everything is rolled back.
create temporary table t_templates (name text primary key, row_data jsonb);
grant all on t_templates to authenticated, anon;
insert into t_templates values
  ('marketplace_businesses', (select to_jsonb(t) from public.marketplace_businesses t order by t.created_at desc limit 1)),
  ('marketplace_products', (select to_jsonb(t) from public.marketplace_products t where t.status = 'active' order by t.created_at desc limit 1)),
  ('marketplace_orders', (select to_jsonb(t) from public.marketplace_orders t order by t.created_at desc limit 1)),
  ('transport_operators', (select to_jsonb(t) from public.transport_operators t order by t.created_at desc limit 1)),
  ('transport_companies', (select to_jsonb(t) from public.transport_companies t order by t.created_at desc limit 1)),
  ('transport_fleets', coalesce(
    (select to_jsonb(t) from public.transport_fleets t
      where t.company_id is null and t.fleet_type is not null and t.country_iso is not null
        and lower(coalesce(t.service_category::text, '')) in ('transport', 'both', 'ride only', 'ride and delivery')
      order by t.last_active_at desc nulls last limit 1),
    (select to_jsonb(t) from public.transport_fleets t where t.fleet_type is not null limit 1))),
  ('transport_trips', (select to_jsonb(t) from public.transport_trips t order by t.created_at desc limit 1)),
  ('transport_company_operator_invites', (select to_jsonb(t) from public.transport_company_operator_invites t limit 1));

-- Insert a copy of the template with overrides. Only columns present in the
-- merged row are written, so defaults still apply; generated and identity
-- columns are skipped.
create or replace function pg_temp.clone_row(p_table text, p_overrides jsonb) returns void language plpgsql as $$
declare
  v_row jsonb := coalesce((select row_data from t_templates where name = p_table), '{}'::jsonb) || p_overrides;
  v_cols text;
  v_col record;
begin
  -- Fit test values into length-limited text columns (e.g. character(5)
  -- codes). The random part of each value is at the end, so keep the tail.
  for v_col in
    select a.attname, a.atttypmod - 4 as max_length
    from pg_attribute a
    where a.attrelid = ('public.' || p_table)::regclass
      and a.attnum > 0 and not a.attisdropped
      and a.atttypid in ('bpchar'::regtype, 'varchar'::regtype)
      and a.atttypmod > 4
  loop
    if jsonb_typeof(v_row -> v_col.attname) = 'string'
      and length(v_row ->> v_col.attname) > v_col.max_length then
      v_row := jsonb_set(v_row, array[v_col.attname], to_jsonb(right(v_row ->> v_col.attname, v_col.max_length)));
    end if;
  end loop;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
  from pg_attribute a
  where a.attrelid = ('public.' || p_table)::regclass
    and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity <> 'a'
    and v_row ? a.attname;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_table, v_cols, v_cols, p_table)
    using v_row;
end;
$$;
grant execute on function pg_temp.clone_row(text, jsonb) to authenticated, anon;

create or replace function pg_temp.has_trigger(p_table text, p_trigger text) returns boolean language sql as $f$
  select exists (select 1 from pg_trigger where tgrelid = ('public.' || p_table)::regclass and tgname = p_trigger and not tgisinternal)
$f$;
grant execute on function pg_temp.has_trigger(text, text) to authenticated, anon;

create or replace function pg_temp.tag() returns text language sql as $$ select upper(substr(md5(random()::text), 1, 8)) $$;
grant execute on function pg_temp.tag() to authenticated, anon;

-- Operator codes are exactly 5 digits (10000-99999), like the app generates.
create or replace function pg_temp.free_operator_code() returns text language plpgsql as $$
declare
  v_code text;
begin
  loop
    v_code := (10000 + floor(random() * 90000))::int::text;
    exit when not exists (select 1 from public.transport_operators where operator_code::text = v_code);
  end loop;
  return v_code;
end;
$$;

-- Live tables carry many product rules (photos, company membership, code
-- formats...). They are unrelated to admin enforcement, so they are paused
-- only while the fake records are created. Everything is rolled back.
set local session_replication_role = replica;

insert into t_ids values ('business', gen_random_uuid()), ('fleet', gen_random_uuid()), ('fleet2', gen_random_uuid()),
  ('op', gen_random_uuid()), ('op2', gen_random_uuid()), ('company', gen_random_uuid());

select pg_temp.clone_row('marketplace_businesses', jsonb_build_object(
  'id', pg_temp.id('business'), 'user_id', pg_temp.id('seller'),
  'business_name', 'KT Admin Checks ' || pg_temp.tag(), 'business_kind', 'retail',
  'public_business_id', 'KTCHK-' || pg_temp.tag(), 'slug', 'ktchk-' || lower(pg_temp.tag()), 'phone', '+1555' || floor(random() * 1000000)::text,
  'email', lower(pg_temp.tag()) || '@checks.kunthai.test', 'discoverable_nearby', true,
  'created_at', now(), 'updated_at', now()));
select pg_temp.clone_row('marketplace_products', jsonb_build_object(
  'id', gen_random_uuid(), 'business_id', pg_temp.id('business'), 'name', 'Checks Rice', 'title', 'Checks Rice',
  'status', 'active', 'stock', 5, 'sku', 'KTCHK-' || pg_temp.tag(), 'slug', 'ktchk-' || lower(pg_temp.tag()),
  'created_at', now(), 'updated_at', now()));

select pg_temp.clone_row('transport_operators', jsonb_build_object(
  'id', pg_temp.id('op'), 'user_id', pg_temp.id('operator'), 'full_name', 'Checks Solo Driver',
  'operator_code', pg_temp.free_operator_code(), 'phone', '+1555' || floor(random() * 1000000)::text,
  'public_id', null, 'account_status', 'approved', 'created_at', now(), 'updated_at', now()));
select pg_temp.clone_row('transport_operators', jsonb_build_object(
  'id', pg_temp.id('op2'), 'user_id', pg_temp.id('operator2'), 'full_name', 'Checks Company Driver',
  'operator_code', pg_temp.free_operator_code(), 'phone', '+1555' || floor(random() * 1000000)::text,
  'public_id', null, 'account_status', 'approved', 'created_at', now(), 'updated_at', now()));
select pg_temp.clone_row('transport_companies', jsonb_build_object(
  'id', pg_temp.id('company'), 'owner_user_id', pg_temp.id('company_owner'),
  'company_code', 'KTC-' || left(pg_temp.tag(), 7), 'company_name', 'KT Checks Movers ' || pg_temp.tag(),
  'owner_name', 'Checks Owner', 'owner_public_id', null, 'phone', '+1555' || floor(random() * 1000000)::text,
  'email', lower(pg_temp.tag()) || '@checks.kunthai.test', 'registration_number', 'KTCHK-' || pg_temp.tag(),
  'tax_id', null, 'public_id', null, 'account_status', 'approved', 'created_at', now(), 'updated_at', now()));
select pg_temp.clone_row('transport_fleets', jsonb_build_object(
  'id', pg_temp.id('fleet'), 'operator_id', pg_temp.id('op'), 'company_id', null, 'company_fleet_id', null,
  'is_visible_to_passengers', true, 'public_fleet_photos', jsonb_build_array('https://checks.kunthai.test/front.jpg', 'https://checks.kunthai.test/back.jpg', 'https://checks.kunthai.test/left.jpg', 'https://checks.kunthai.test/right.jpg'), 'fleet_code', 'KTF-' || left(pg_temp.tag(), 7), 'plate_number', 'KTCHK' || pg_temp.tag(),
  'last_active_at', now()));
select pg_temp.clone_row('transport_fleets', jsonb_build_object(
  'id', pg_temp.id('fleet2'), 'operator_id', pg_temp.id('op2'), 'company_id', pg_temp.id('company'), 'company_fleet_id', null,
  'is_visible_to_passengers', true, 'public_fleet_photos', jsonb_build_array('https://checks.kunthai.test/front.jpg', 'https://checks.kunthai.test/back.jpg', 'https://checks.kunthai.test/left.jpg', 'https://checks.kunthai.test/right.jpg'), 'fleet_code', 'KTF-' || left(pg_temp.tag(), 7), 'plate_number', 'KTCHK' || pg_temp.tag(),
  'last_active_at', now()));

set local session_replication_role = origin;

-- ------------------------------------------- 1. permissions and authority ---
select pg_temp.act_as('support');
do $$ begin
  assert (select count(*) from public.admin_list_marketplace_businesses(p_search => pg_temp.id('business')::text)) = 1, 'support can view the business directory';
  assert (select count(*) from public.admin_list_transport_operators()) >= 2, 'support can view the operator directory';
end $$;
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'restriction', 'spam', 'Your listings were flagged as spam.', 'Bulk duplicates', array['listings'], null)$q$, 'Not authorized');

select pg_temp.act_as('risk');  -- authority 3: may temporarily suspend, not indefinitely
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'suspension', 'fraud_scam', 'Your business was suspended for fraud.', 'Chargebacks', '{}', null)$q$, 'authority level 4');
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'temporary_suspension', 'fraud_scam', 'Your business was suspended for fraud.', 'Chargebacks', '{}', null)$q$, 'future end time');
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'restriction', 'nonsense', 'Your listings were flagged as spam.', 'Duplicate listings', array['listings'], null)$q$, 'reason category');
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'restriction', 'spam', 'short', 'note', array['listings'], null)$q$, 'Explain the decision');
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'restriction', 'spam', 'Your listings were flagged as spam.', 'Duplicate listings', array['flying'], null)$q$, 'at least one capability');

-- ------------------------------------ 2. restriction: listings only ---
select pg_temp.act_as('mgr');
select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'restriction', 'spam',
  'Your listings were flagged as spam. Please review our listing rules.', 'Bulk duplicate listings', array['listings'], null);

select pg_temp.act_as('seller');
do $$ begin
  assert public.kunthai_enforcement_blocks('marketplace_business', pg_temp.id('business'), 'listings'), 'a listings restriction blocks listing changes';
  assert pg_temp.has_trigger('marketplace_products', 'marketplace_products_enforce_listings'), 'listing writes are guarded';
end $$;
select pg_temp.act_as('buyer');
do $$ begin
  assert not public.kunthai_enforcement_blocks('marketplace_business', pg_temp.id('business'), 'orders'), 'a listings restriction keeps orders open';
  assert (select count(*) from public.marketplace_businesses where id = pg_temp.id('business')) = 1, 'a restricted business stays visible';
  assert (select count(*) from public.marketplace_products where business_id = pg_temp.id('business')) = 1, 'its products stay visible';
end $$;

-- ------------------------------------- 3. temporary suspension ---
select pg_temp.act_as('risk');
select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'temporary_suspension', 'fraud_scam',
  'Your business is suspended while we investigate payment fraud reports.', 'Three chargebacks in 24h', '{}', now() + interval '3 days');

select pg_temp.act_as('buyer');
do $$ begin
  assert (select count(*) from public.marketplace_businesses where id = pg_temp.id('business')) = 0, 'a suspended business is hidden from buyers';
  assert (select count(*) from public.marketplace_products where business_id = pg_temp.id('business')) = 0, 'its products are hidden from buyers';
end $$;
do $$ begin
  assert public.kunthai_enforcement_blocks('marketplace_business', pg_temp.id('business'), 'orders'), 'a suspended business takes no orders';
  assert pg_temp.has_trigger('marketplace_orders', 'marketplace_orders_enforce_orders'), 'new orders are guarded';
end $$;
select pg_temp.act_as('anon');
do $$ begin
  assert (select count(*) from public.marketplace_businesses where id = pg_temp.id('business')) = 0, 'hidden from signed-out visitors too';
end $$;
select pg_temp.act_as('seller');
do $$ begin
  assert (select count(*) from public.marketplace_businesses where id = pg_temp.id('business')) = 1, 'the owner still sees their own business';
  assert (select count(*) from public.marketplace_products where business_id = pg_temp.id('business')) = 1, 'the owner still sees their own products';
  assert (select status from public.get_my_enforcement_notices() where target_id = pg_temp.id('business')) = 'temporarily_suspended', 'the owner gets an in-product notice';
  assert (select count(*) from public.platform_notifications where user_id = pg_temp.id('seller') and notification_type = 'account_enforcement') = 2, 'the owner was notified of both decisions';
  assert not exists (select 1 from public.platform_notifications where user_id = pg_temp.id('seller') and body like '%chargebacks%'), 'internal notes never reach the owner';
end $$;
select pg_temp.expect_error($q$select public.admin_apply_enforcement('marketplace_business', pg_temp.id('business'), 'warning', 'spam', 'Self-service warning attempt.', '', '{}', null)$q$, 'Not authorized');

-- ------------------------------------------------- 4. expiry ---
select pg_temp.act_as(null);
update public.admin_enforcement_states set ends_at = now() - interval '1 minute' where target_id = pg_temp.id('business');
select pg_temp.act_as('buyer');
do $$ begin
  assert (select count(*) from public.marketplace_businesses where id = pg_temp.id('business')) = 1, 'an expired suspension stops applying immediately';
end $$;
select pg_temp.act_as(null);
do $$ begin
  assert public.admin_expire_enforcements() >= 1, 'the scheduled job lifts the expired suspension';
  assert not exists (select 1 from public.admin_enforcement_states where target_id = pg_temp.id('business')), 'state row removed';
  assert (select count(*) from public.admin_enforcement_actions where target_id = pg_temp.id('business')) = 3, 'history kept: restriction, suspension, restoration';
  assert exists (select 1 from public.admin_enforcement_actions where target_id = pg_temp.id('business') and action = 'restoration' and performed_by_system), 'system restoration recorded';
end $$;

-- ------------------------------------------------ 5. immutability ---
select pg_temp.expect_error($q$delete from public.admin_enforcement_actions$q$, 'immutable');
select pg_temp.expect_error($q$update public.admin_audit_logs set reason = 'x'$q$, 'immutable');
do $$ begin
  assert (select count(*) from public.admin_audit_logs where resource_id = pg_temp.id('business')) >= 3, 'audit entries were written';
end $$;

-- --------------------------------------- 6. direct notice and notes ---
select pg_temp.act_as('support');
select public.admin_send_owner_notification('marketplace_business', pg_temp.id('business'), 'Update your store hours',
  'Customers say your store shows the wrong opening hours. Please update them.', 'urmall:business', 'normal');
select pg_temp.expect_error($q$select public.admin_add_internal_note('marketplace_business', pg_temp.id('business'), 'Support cannot write notes')$q$, 'Not authorized');
select pg_temp.act_as('mgr');
select public.admin_add_internal_note('marketplace_business', pg_temp.id('business'), 'Owner called; promised to fix hours.');
do $$ begin
  assert (select jsonb_array_length(public.admin_get_marketplace_business(pg_temp.id('business')) -> 'governance' -> 'notices')) = 1, 'notice logged';
  assert (select jsonb_array_length(public.admin_get_marketplace_business(pg_temp.id('business')) -> 'governance' -> 'notes')) = 1, 'note logged';
end $$;

-- ----------------------------- 7. staff governance and escalation ---
select pg_temp.act_as('mgr');
select pg_temp.expect_error($q$insert into public.admin_assignments (user_id, role_id, authority_level) select pg_temp.id('mgr'), id, 2 from public.admin_roles where role_key = 'finance_officer'$q$, '');
select pg_temp.act_as(null);
select set_config('request.jwt.claim.sub', pg_temp.id('mgr')::text, true);  -- bypass RLS, keep auth.uid()
select pg_temp.expect_error($q$insert into public.admin_assignments (user_id, role_id, authority_level) select pg_temp.id('mgr'), id, 2 from public.admin_roles where role_key = 'finance_officer'$q$, 'cannot change your own admin access');

-- Staff management needs team.manage (Super/Chief by default).
select pg_temp.act_as('mgr');
select pg_temp.expect_error($q$select public.admin_set_staff_status(pg_temp.id('support'), 'restricted', 'Coaching period', null)$q$, 'Not authorized');
select pg_temp.act_as('super');
select pg_temp.expect_error($q$select public.admin_update_staff_profile(pg_temp.id('super'), 'executive', 'executive', 'Owner', null, 'Self edit')$q$, 'your own staff record');
select public.admin_update_staff_profile(pg_temp.id('support'), 'senior_specialist', 'customer_support', 'Senior Support Specialist', pg_temp.id('mgr'), 'Promotion after review');
select public.admin_set_staff_status(pg_temp.id('support'), 'restricted', 'Coaching period after an incorrect notice', now() + interval '7 days');
select pg_temp.act_as('support');
do $$ begin
  assert public.admin_has_permission('marketplace.businesses.view', 'marketplace'), 'restricted staff keep view access';
  assert not public.admin_has_permission('notifications.direct'), 'restricted staff lose action permissions';
  assert (public.get_my_admin_access() -> 'staff' ->> 'status') = 'restricted', 'access payload reports the staff status';
end $$;
select pg_temp.act_as('super');
select public.admin_set_staff_status(pg_temp.id('support'), 'suspended', 'Suspended pending an investigation', null);
select pg_temp.act_as('support');
do $$ begin
  assert not public.is_kunthai_admin(), 'a suspended staff member has no admin access';
  assert (public.get_my_admin_access() ->> 'isAdmin')::boolean = false, 'and the console sees it';
end $$;
select pg_temp.act_as('super');
do $$ begin
  assert (select count(*) from public.admin_list_staff() where user_id in (select v from t_ids)) = 5, 'staff directory lists every admin';
  assert (select count(*) from public.admin_get_staff_activity(pg_temp.id('support'))) >= 3, 'staff history includes changes made to them';
end $$;

-- -------------------------------------------------- 8. UrRide ---
select pg_temp.act_as('mgr');  -- UrMall manager has no UrRide powers
select pg_temp.expect_error($q$select public.admin_apply_enforcement('transport_operator', pg_temp.id('op'), 'restriction', 'safety_violation', 'Several riders reported unsafe driving.', 'Three reports', array['trips'], null)$q$, 'Not authorized');
select pg_temp.act_as('transport');
select public.admin_apply_enforcement('transport_operator', pg_temp.id('op'), 'restriction', 'safety_violation',
  'Several riders reported unsafe driving. You cannot take trips until we review this.', 'Three reports in a week', array['trips'], null);
select pg_temp.act_as('buyer');
do $$ begin
  assert public.transport_fleet_blocked(pg_temp.id('fleet'), 'trips'), 'this vehicle cannot take trips';
  assert pg_temp.has_trigger('transport_trips', 'transport_trips_enforce_capability'), 'new trips are guarded';
end $$;
do $$ begin
  assert (select count(*) from public.transport_fleets where id = pg_temp.id('fleet')) = 1, 'a trip restriction alone keeps the vehicle discoverable';
end $$;
select pg_temp.act_as(null);
do $$
declare
  v_type text;
  v_country text;
  v_trip text;
begin
  select lower(fleet.fleet_type::text), upper(fleet.country_iso::text),
    case when lower(coalesce(fleet.service_category::text, 'transport')) in ('transport', 'both', 'ride only', 'ride and delivery') then 'ride' else 'delivery' end
  into v_type, v_country, v_trip
  from public.transport_fleets fleet where fleet.id = pg_temp.id('fleet');
  assert not exists (select 1 from public.transport_open_booking_eligible_fleets(pg_temp.id('buyer'), v_trip, v_type, v_country) where fleet_id = pg_temp.id('fleet')), 'restricted operator excluded from open bookings';
  assert exists (select 1 from public.transport_open_booking_eligible_fleets(pg_temp.id('buyer'), v_trip, v_type, v_country) where fleet_id = pg_temp.id('fleet2')), 'other operators still offered';
end $$;

select pg_temp.act_as('transport');
select public.admin_apply_enforcement('transport_company', pg_temp.id('company'), 'suspension', 'identity_verification',
  'Your company registration documents could not be verified.', 'Registration number not found', '{}', null);
select pg_temp.act_as('buyer');
do $$ begin
  assert (select count(*) from public.transport_fleets where id = pg_temp.id('fleet2')) = 0, 'a suspended company''s fleets are hidden from passengers';
end $$;
do $$ begin
  assert public.transport_fleet_blocked(pg_temp.id('fleet2'), 'trips'), 'this vehicle cannot take trips';
  assert pg_temp.has_trigger('transport_trips', 'transport_trips_enforce_capability'), 'new trips are guarded';
end $$;
select pg_temp.act_as('operator2');
do $$ begin
  assert (select count(*) from public.transport_fleets where id = pg_temp.id('fleet2')) = 1, 'operators still see their own fleets';
end $$;
select pg_temp.act_as('company_owner');
do $$ begin
  assert public.kunthai_enforcement_blocks('transport_company', pg_temp.id('company'), 'operators'), 'a suspended company cannot invite operators';
  assert pg_temp.has_trigger('transport_company_operator_invites', 'transport_company_operator_invites_enforce'), 'operator invites are guarded';
end $$;

select pg_temp.act_as('transport');
select public.admin_apply_enforcement('transport_company', pg_temp.id('company'), 'restoration', 'issue_resolved',
  'Your documents were verified. Your company is active again.', '', '{}', null);
select pg_temp.act_as('buyer');
do $$ begin
  assert not public.transport_fleet_blocked(pg_temp.id('fleet2'), 'trips'), 'a restored company takes trips again';
end $$;

-- --------------------------------------------- 9. directories & overview ---
select pg_temp.act_as('super');
do $$
declare
  v_overview jsonb := public.admin_platform_overview();
begin
  assert (v_overview -> 'businesses' ->> 'total')::int >= 1, 'overview counts businesses';
  assert (v_overview -> 'operators' ->> 'restricted')::int >= 1, 'overview counts restricted operators';
  assert (select enforcement_status from public.admin_list_transport_operators(p_search => pg_temp.id('op')::text)) = 'restricted', 'operator list shows enforcement';
  assert (select count(*) from public.admin_list_transport_operators(p_enforcement => array['restricted'])) >= 1, 'operator list filters by enforcement';
  assert (select count(*) from public.admin_list_transport_companies(p_search => pg_temp.id('company')::text)) = 1, 'company search works';
  assert (select count(*) from public.admin_list_marketplace_businesses(p_kinds => array['restaurant'], p_search => pg_temp.id('business')::text)) = 0, 'business type filter works';
  assert (select total_count from public.admin_list_marketplace_businesses(p_search => pg_temp.id('business')::text, p_sort => 'oldest') limit 1) = 1, 'total count returned';
  assert (select count(*) from public.admin_search_audit_log(p_action_prefix => 'enforcement.')) >= 5, 'audit search filters by action';
  assert (public.admin_get_transport_company(pg_temp.id('company')) -> 'stats' ->> 'operators')::int = 1, 'company detail counts operators';
  assert jsonb_array_length(public.admin_get_transport_operator(pg_temp.id('op')) -> 'fleets') = 1, 'operator detail lists fleets';
end $$;

select pg_temp.act_as('buyer');
select pg_temp.expect_error($q$select * from public.admin_list_marketplace_businesses()$q$, 'Not authorized');
select pg_temp.expect_error($q$select public.admin_platform_overview()$q$, 'Not authorized');


-- --------------------------------------------------- 10. console lock ---
-- Claims as Supabase sends them: auth session id, assurance level, MFA time.
create or replace function pg_temp.claims(p_key text, p_aal text, p_mfa_age interval) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', pg_temp.id(p_key), 'session_id', 'checks-session', 'aal', p_aal,
    'amr', case when p_mfa_age is null then '[]'::json
      else json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - p_mfa_age)::bigint)) end
  )::text, true);
end;
$f$;

do $$
begin
  if to_regclass('public.admin_console_sessions') is null then
    raise notice 'Console lock migration not applied; skipping console lock checks.';
  end if;
end $$;

select pg_temp.act_as('mgr');
select pg_temp.claims('mgr', 'aal1', null);
do $$
begin
  if to_regclass('public.admin_console_sessions') is null then return; end if;
  -- A new auth session has no open console: every admin power is gone.
  assert not public.admin_has_permission('marketplace.businesses.view', 'marketplace'), 'a locked console has no admin powers';
  assert (public.admin_console_status() ->> 'unlocked')::boolean = false, 'status reports locked';
  assert (public.admin_console_status() ->> 'passcodeSet')::boolean = false, 'no passcode yet';
  -- Checks about OTHER admins (notifications, jobs) still work.
  assert public.admin_has_permission('marketplace.businesses.view', 'marketplace', pg_temp.id('super')) is not null, 'checks about others still evaluate';
  begin
    perform public.admin_set_console_passcode('KunThai-Ops-71');
    raise exception 'setting a passcode without a fresh authenticator check must fail';
  exception when others then
    if sqlerrm not like '%authenticator%' then raise; end if;
  end;
end $$;

select pg_temp.claims('mgr', 'aal2', interval '1 minute');
do $$
declare
  v jsonb;
  i integer;
begin
  if to_regclass('public.admin_console_sessions') is null then return; end if;
  begin
    perform public.admin_set_console_passcode('123456');
    raise exception 'a trivial passcode must be refused';
  exception when others then
    if sqlerrm not like '%too easy%' then raise; end if;
  end;
  v := public.admin_set_console_passcode('KunThai-Ops-71');
  assert (v ->> 'passcodeSet')::boolean and (v ->> 'unlocked')::boolean, 'setting the passcode opens the console';
  assert public.admin_has_permission('marketplace.businesses.view', 'marketplace'), 'an unlocked console has its powers back';
  begin
    perform 1 from public.admin_console_passcodes;
    raise exception 'clients must not be able to read passcode hashes';
  exception when insufficient_privilege then null;
  end;

  perform public.admin_lock_console();
  assert not public.admin_has_permission('marketplace.businesses.view', 'marketplace'), 'locking removes the powers immediately';

  v := public.admin_unlock_console('wrong-code');
  assert v ->> 'reason' = 'wrong_passcode' and (v ->> 'attemptsLeft')::int = 4, 'a wrong passcode counts down';
  v := public.admin_unlock_console('KunThai-Ops-71');
  assert (v ->> 'ok')::boolean, 'the right passcode unlocks';
  assert (public.admin_console_status() ->> 'attemptsLeft')::int = 5, 'success resets the counter';

  perform public.admin_lock_console();
  for i in 1..5 loop
    v := public.admin_unlock_console('nope-' || i);
  end loop;
  assert v ->> 'reason' = 'locked_out', 'five wrong passcodes lock the console out';
  v := public.admin_unlock_console('KunThai-Ops-71');
  assert v ->> 'reason' = 'locked_out', 'even the right passcode waits out the lockout';
  assert exists (select 1 from public.admin_audit_logs where action_key = 'security.console_lockout' and resource_id = pg_temp.id('mgr')), 'the lockout is audited';

  -- A fresh authenticator check is the way back in.
  v := public.admin_unlock_console_with_mfa();
  assert (v ->> 'unlocked')::boolean, 'the authenticator unlocks after a lockout';
  v := public.admin_console_heartbeat();
  assert (v ->> 'expiresAt')::timestamptz > now() + interval '5 minutes', 'activity slides the session forward';
end $$;

select pg_temp.claims('mgr', 'aal2', interval '20 minutes');
do $$
begin
  if to_regclass('public.admin_console_sessions') is null then return; end if;
  perform public.admin_lock_console();
  begin
    perform public.admin_unlock_console_with_mfa();
    raise exception 'an old authenticator check must not unlock';
  exception when others then
    if sqlerrm not like '%authenticator%' then raise; end if;
  end;
end $$;
select pg_temp.act_as(null);
select set_config('request.jwt.claims', '', true);
do $$
begin
  if to_regclass('public.admin_console_passcodes') is null then return; end if;
  assert (select passcode_hash from public.admin_console_passcodes where user_id = pg_temp.id('mgr')) like '$2%', 'the passcode is stored as a bcrypt hash';
  assert (select passcode_hash from public.admin_console_passcodes where user_id = pg_temp.id('mgr')) not like '%KunThai-Ops-71%', 'never in plain text';
end $$;
select 'ADMIN OPERATIONS PLATFORM: ALL CHECKS PASSED' as result;

rollback;
