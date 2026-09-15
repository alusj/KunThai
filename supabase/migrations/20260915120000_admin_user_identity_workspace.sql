-- Consolidated admin user identity workspace.
--
-- This is additive: the existing user workspace RPC remains available for
-- older clients while the v2 RPC exposes linked UrMall, UrRide, plan, and
-- administrator relationships to the upgraded Users screen.

create or replace function public.admin_search_users_v3(
  search_text text default '',
  account_status_filter text default null,
  account_type_filter text default null,
  sort_key text default 'newest',
  result_limit integer default 25,
  result_offset integer default 0
)
returns table (
  user_id uuid,
  public_id text,
  email text,
  phone text,
  display_name text,
  username text,
  avatar_url text,
  account_type text,
  account_status text,
  status_reason text,
  restricted_sectors text[],
  status_expires_at timestamptz,
  email_verified boolean,
  phone_verified boolean,
  profile_verified boolean,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
stable
set search_path = public, auth
as $$
  with matching_users as (
    select
      users.id as user_id,
      public.kunthai_public_user_id_from_uuid(users.id)::text as public_id,
      users.email::text as email,
      users.phone::text as phone,
      coalesce(profile.display_name, users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'full_name', split_part(users.email, '@', 1))::text as display_name,
      coalesce(profile.username, users.raw_user_meta_data ->> 'username')::text as username,
      coalesce(profile.avatar_url, users.raw_user_meta_data ->> 'avatar_url')::text as avatar_url,
      coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal')::text as account_type,
      coalesce(control.status, 'active')::text as account_status,
      coalesce(control.reason, '')::text as status_reason,
      coalesce(control.restricted_sectors, '{}'::text[]) as restricted_sectors,
      control.expires_at as status_expires_at,
      users.email_confirmed_at is not null as email_verified,
      users.phone_confirmed_at is not null as phone_verified,
      coalesce(profile.verified, false) as profile_verified,
      users.last_sign_in_at,
      users.created_at
    from auth.users users
    left join public.explore_profiles profile on profile.user_id = users.id
    left join public.platform_account_controls control on control.user_id = users.id
    where public.admin_has_permission('users.view')
      and (
        coalesce(btrim(search_text), '') = ''
        or users.email ilike '%' || btrim(search_text) || '%'
        or users.phone ilike '%' || btrim(search_text) || '%'
        or profile.display_name ilike '%' || btrim(search_text) || '%'
        or profile.username ilike '%' || btrim(search_text) || '%'
        or upper(regexp_replace(public.kunthai_public_user_id_from_uuid(users.id), '[^A-Za-z0-9]', '', 'g')) like '%' || upper(regexp_replace(btrim(search_text), '[^A-Za-z0-9]', '', 'g')) || '%'
      )
      and (coalesce(btrim(account_status_filter), '') in ('', 'all') or coalesce(control.status, 'active') = lower(btrim(account_status_filter)))
      and (coalesce(btrim(account_type_filter), '') in ('', 'all') or coalesce(profile.account_type, users.raw_user_meta_data ->> 'account_type', 'personal') = lower(btrim(account_type_filter)))
  ), counted as (
    select matching_users.*, count(*) over () as total_count
    from matching_users
  )
  select *
  from counted
  order by
    case when lower(coalesce(sort_key, 'newest')) = 'oldest' then created_at end asc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'name' then lower(display_name) end asc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'last_active' then last_sign_in_at end desc nulls last,
    case when lower(coalesce(sort_key, 'newest')) = 'newest' then created_at end desc nulls last,
    created_at desc
  limit greatest(1, least(coalesce(result_limit, 25), 100))
  offset greatest(0, coalesce(result_offset, 0));
$$;

create or replace function public.admin_get_user_workspace_v2(target_user_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_base jsonb;
  v_user jsonb;
  v_businesses jsonb := '[]'::jsonb;
  v_companies jsonb := '[]'::jsonb;
  v_operators jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_admin_roles jsonb := '[]'::jsonb;
  v_accounts jsonb := '[]'::jsonb;
  v_summary jsonb;
begin
  if target_user_id is null or not public.admin_has_permission('users.view') then
    raise exception 'Not authorized';
  end if;

  v_base := public.admin_get_user_workspace(target_user_id);
  if v_base is null or (v_base -> 'user') is null then
    raise exception 'User not found';
  end if;

  v_user := jsonb_set(
    v_base -> 'user',
    '{public_id}',
    to_jsonb(coalesce(public.kunthai_public_user_id_from_uuid(target_user_id), '')),
    true
  );

  if to_regclass('public.admin_assignments') is not null then
    select coalesce(jsonb_agg(to_jsonb(role_row) order by role_row.rank desc, role_row.created_at desc), '[]'::jsonb)
    into v_admin_roles
    from (
      select assignment.id, role.role_key, role.name, assignment.sector_scopes,
        assignment.region_scopes, assignment.authority_level, assignment.status,
        assignment.expires_at, assignment.created_at, role.rank
      from public.admin_assignments assignment
      join public.admin_roles role on role.id = assignment.role_id
      where assignment.user_id = target_user_id
        and assignment.status = 'active'
        and (assignment.expires_at is null or assignment.expires_at > now())
    ) role_row;
  end if;

  v_user := jsonb_set(v_user, '{is_admin}', to_jsonb(jsonb_array_length(v_admin_roles) > 0), true);

  if to_regclass('public.marketplace_businesses') is not null
    and to_regclass('public.marketplace_products') is not null
    and to_regclass('public.marketplace_orders') is not null
    and to_regclass('public.marketplace_business_admins') is not null
    and to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', business.id,
          'name', business.business_name,
          'business_name', business.business_name,
          'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')),
          'role', 'owner',
          'status', business.verification_status,
          'verification_status', business.verification_status,
          'country', business.country,
          'city', business.city,
          'plan_code', subscription.plan_code,
          'plan_name', plan.display_name,
          'plan_status', subscription.status,
          'product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id),
          'published_product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id and product.status = 'active'),
          'order_count', (select count(*) from public.marketplace_orders order_row where order_row.business_id = business.id),
          'content_count', (select count(*) from public.marketplace_activities activity where activity.business_id = business.id),
          'admin_count', (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted'),
          'product_limit', plan.product_limit,
          'admin_limit', plan.admin_limit
        ) as entry, business.created_at
        from public.marketplace_businesses business
        left join public.kunthai_business_subscriptions subscription on subscription.marketplace_business_id = business.id and subscription.surface = 'urmall'
        left join public.kunthai_business_plans plan on plan.surface = 'urmall' and plan.plan_code = subscription.plan_code
        where business.user_id = $1
        union all
        select jsonb_build_object(
          'id', business.id,
          'name', business.business_name,
          'business_name', business.business_name,
          'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')),
          'role', 'admin',
          'status', business.verification_status,
          'verification_status', business.verification_status,
          'country', business.country,
          'city', business.city,
          'plan_code', subscription.plan_code,
          'plan_name', plan.display_name,
          'plan_status', subscription.status,
          'product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id),
          'published_product_count', (select count(*) from public.marketplace_products product where product.business_id = business.id and product.status = 'active'),
          'order_count', (select count(*) from public.marketplace_orders order_row where order_row.business_id = business.id),
          'content_count', (select count(*) from public.marketplace_activities activity where activity.business_id = business.id),
          'admin_count', (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted'),
          'product_limit', plan.product_limit,
          'admin_limit', plan.admin_limit
        ) as entry, business.created_at
        from public.marketplace_business_admins business_admin
        join public.marketplace_businesses business on business.id = business_admin.business_id
        left join public.kunthai_business_subscriptions subscription on subscription.marketplace_business_id = business.id and subscription.surface = 'urmall'
        left join public.kunthai_business_plans plan on plan.surface = 'urmall' and plan.plan_code = subscription.plan_code
        where business_admin.user_id = $1 and business_admin.status = 'accepted' and business.user_id is distinct from $1
      ) rows
    $query$ into v_businesses using target_user_id;
  elsif to_regclass('public.marketplace_businesses') is not null
    and public.admin_has_permission('marketplace.view', 'marketplace') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', business.id, 'name', business.business_name, 'business_name', business.business_name,
        'business_kind', lower(coalesce(nullif(business.business_kind, ''), nullif(business.business_type, ''), 'general')), 'role', 'owner',
        'status', business.verification_status, 'verification_status', business.verification_status,
        'country', business.country, 'city', business.city, 'product_count', 0,
        'published_product_count', 0, 'order_count', 0, 'content_count', 0, 'admin_count', 0
      ) order by business.created_at desc), '[]'::jsonb)
      from public.marketplace_businesses business where business.user_id = $1
    $query$ into v_businesses using target_user_id;
  end if;

  if to_regclass('public.transport_companies') is not null
    and to_regclass('public.transport_company_fleets') is not null
    and to_regclass('public.transport_company_members') is not null
    and to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(entry order by created_at desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
          'company_code', company.company_code, 'company_type', company.company_type, 'role', 'owner',
          'status', company.account_status, 'account_status', company.account_status,
          'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
          'plan_code', subscription.plan_code, 'plan_name', plan.display_name, 'plan_status', subscription.status,
          'fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id),
          'active_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.active_status = 'active'),
          'rental_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.service_category = 'Rental'),
          'operator_count', (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role = 'operator' and member.status = 'active'),
          'admin_count', (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role in ('owner', 'admin') and member.status = 'active'),
          'reservation_count', case when to_regclass('public.transport_company_rentals') is not null and to_regclass('public.transport_rental_reservations') is not null then (select count(*) from public.transport_rental_reservations reservation join public.transport_company_rentals rental on rental.id = reservation.rental_id where rental.company_id = company.id) else 0 end,
          'vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit
        ) as entry, company.created_at
        from public.transport_companies company
        left join public.kunthai_business_subscriptions subscription on subscription.transport_company_id = company.id and subscription.surface = 'urride'
        left join public.kunthai_business_plans plan on plan.surface = 'urride' and plan.plan_code = subscription.plan_code
        where company.owner_user_id = $1
        union all
        select jsonb_build_object(
          'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
          'company_code', company.company_code, 'company_type', company.company_type, 'role', member.role,
          'status', company.account_status, 'account_status', company.account_status,
          'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
          'plan_code', subscription.plan_code, 'plan_name', plan.display_name, 'plan_status', subscription.status,
          'fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id),
          'active_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.active_status = 'active'),
          'rental_fleet_count', (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id and fleet.service_category = 'Rental'),
          'operator_count', (select count(*) from public.transport_company_members operator_member where operator_member.company_id = company.id and operator_member.role = 'operator' and operator_member.status = 'active'),
          'admin_count', (select count(*) from public.transport_company_members admin_member where admin_member.company_id = company.id and admin_member.role in ('owner', 'admin') and admin_member.status = 'active'),
          'reservation_count', 0, 'vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit
        ) as entry, company.created_at
        from public.transport_company_members member
        join public.transport_companies company on company.id = member.company_id
        left join public.kunthai_business_subscriptions subscription on subscription.transport_company_id = company.id and subscription.surface = 'urride'
        left join public.kunthai_business_plans plan on plan.surface = 'urride' and plan.plan_code = subscription.plan_code
        where member.user_id = $1 and member.status = 'active' and company.owner_user_id is distinct from $1
      ) rows
    $query$ into v_companies using target_user_id;
  elsif to_regclass('public.transport_companies') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', company.id, 'name', company.company_name, 'company_name', company.company_name,
        'company_code', company.company_code, 'company_type', company.company_type, 'role', 'owner',
        'status', company.account_status, 'account_status', company.account_status,
        'verification_status', company.verification_status, 'country', company.country, 'city', company.city,
        'fleet_count', 0, 'active_fleet_count', 0, 'rental_fleet_count', 0, 'operator_count', 0, 'admin_count', 0, 'reservation_count', 0
      ) order by company.created_at desc), '[]'::jsonb)
      from public.transport_companies company where company.owner_user_id = $1
    $query$ into v_companies using target_user_id;
  end if;

  if to_regclass('public.transport_operators') is not null
    and to_regclass('public.transport_fleets') is not null
    and public.admin_has_permission('transport.view', 'transport') then
    execute $query$
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', operator.id, 'full_name', operator.full_name, 'display_code', operator.display_code,
        'public_id', operator.display_code, 'city', operator.city, 'account_status', operator.account_status,
        'verification_status', operator.verification_status::text,
        'operator_mode', case when to_regclass('public.transport_company_members') is not null and exists (select 1 from public.transport_company_members member where member.user_id = $1 and member.operator_id = operator.id and member.status = 'active') then 'company-linked' else 'solo' end,
        'service_modes', coalesce((select jsonb_agg(distinct lower(replace(fleet.service_category::text, ' ', '_'))) from public.transport_fleets fleet where fleet.operator_id = operator.id), '[]'::jsonb),
        'fleet_count', (select count(*) from public.transport_fleets fleet where fleet.operator_id = operator.id),
        'company_count', case when to_regclass('public.transport_company_members') is not null then (select count(*) from public.transport_company_members member where member.user_id = $1 and member.operator_id = operator.id and member.status = 'active') else 0 end,
        'completed_jobs', coalesce((select sum(fleet.completed_jobs) from public.transport_fleets fleet where fleet.operator_id = operator.id), 0)
      ) order by operator.created_at desc), '[]'::jsonb)
      from public.transport_operators operator where operator.user_id = $1
    $query$ into v_operators using target_user_id;
  end if;

  if to_regclass('public.kunthai_business_subscriptions') is not null
    and to_regclass('public.kunthai_business_plans') is not null
    and (public.admin_has_permission('marketplace.view', 'marketplace') or public.admin_has_permission('transport.view', 'transport')) then
    execute $query$
      select coalesce(jsonb_agg(entry order by period_end desc nulls last), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', subscription.id, 'surface', subscription.surface, 'entity_id', business.id,
          'entity_name', business.business_name, 'plan_code', subscription.plan_code,
          'plan_name', plan.display_name, 'status', subscription.status,
          'current_period_end', subscription.current_period_end, 'auto_renew', subscription.auto_renew,
          'limits', jsonb_build_object('product_limit', plan.product_limit, 'admin_limit', plan.admin_limit),
          'usage', jsonb_build_object(
            'product_count', case when to_regclass('public.marketplace_products') is not null then (select count(*) from public.marketplace_products product where product.business_id = business.id) else 0 end,
            'admin_count', case when to_regclass('public.marketplace_business_admins') is not null then (select count(*) from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.status = 'accepted') else 0 end
          )
        ) as entry, subscription.current_period_end as period_end
        from public.kunthai_business_subscriptions subscription
        join public.kunthai_business_plans plan on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
        join public.marketplace_businesses business on business.id = subscription.marketplace_business_id
        where subscription.surface = 'urmall'
          and public.admin_has_permission('marketplace.view', 'marketplace')
          and (business.user_id = $1 or exists (select 1 from public.marketplace_business_admins admin_row where admin_row.business_id = business.id and admin_row.user_id = $1 and admin_row.status = 'accepted'))
        union all
        select jsonb_build_object(
          'id', subscription.id, 'surface', subscription.surface, 'entity_id', company.id,
          'entity_name', company.company_name, 'plan_code', subscription.plan_code,
          'plan_name', plan.display_name, 'status', subscription.status,
          'current_period_end', subscription.current_period_end, 'auto_renew', subscription.auto_renew,
          'limits', jsonb_build_object('vehicle_limit', plan.vehicle_limit, 'operator_limit', plan.operator_limit, 'admin_limit', plan.admin_limit),
          'usage', jsonb_build_object(
            'fleet_count', case when to_regclass('public.transport_company_fleets') is not null then (select count(*) from public.transport_company_fleets fleet where fleet.company_id = company.id) else 0 end,
            'operator_count', case when to_regclass('public.transport_company_members') is not null then (select count(*) from public.transport_company_members member where member.company_id = company.id and member.role = 'operator' and member.status = 'active') else 0 end
          )
        ) as entry, subscription.current_period_end as period_end
        from public.kunthai_business_subscriptions subscription
        join public.kunthai_business_plans plan on plan.surface = subscription.surface and plan.plan_code = subscription.plan_code
        join public.transport_companies company on company.id = subscription.transport_company_id
        where subscription.surface = 'urride'
          and public.admin_has_permission('transport.view', 'transport')
          and (company.owner_user_id = $1 or exists (select 1 from public.transport_company_members member where member.company_id = company.id and member.user_id = $1 and member.status = 'active'))
      ) rows
    $query$ into v_subscriptions using target_user_id;
  end if;

  v_accounts := jsonb_build_array(jsonb_build_object('id', target_user_id, 'kind', 'personal', 'name', coalesce(v_user ->> 'display_name', 'Personal account'), 'role', 'account_holder', 'status', coalesce(v_user ->> 'account_status', 'active'), 'public_id', v_user ->> 'public_id'));
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'business', 'name', coalesce(item ->> 'name', item ->> 'business_name'), 'role', item ->> 'role', 'status', coalesce(item ->> 'status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_businesses) item;
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'company', 'name', coalesce(item ->> 'name', item ->> 'company_name'), 'role', item ->> 'role', 'status', coalesce(item ->> 'status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_companies) item;
  select v_accounts || coalesce(jsonb_agg(jsonb_build_object('id', item ->> 'id', 'kind', 'operator', 'name', item ->> 'full_name', 'role', case when item ->> 'operator_mode' = 'solo' then 'solo_operator' else 'company_operator' end, 'status', coalesce(item ->> 'account_status', 'active'))) filter (where item is not null), '[]'::jsonb)
  into v_accounts from jsonb_array_elements(v_operators) item;

  v_summary := coalesce(v_base -> 'summary', '{}'::jsonb) || jsonb_build_object(
    'account_count', jsonb_array_length(v_accounts),
    'business_count', jsonb_array_length(v_businesses),
    'company_count', jsonb_array_length(v_companies),
    'operator_count', jsonb_array_length(v_operators),
    'fleet_count', coalesce((select sum(coalesce((item ->> 'fleet_count')::integer, 0)) from jsonb_array_elements(v_companies) item), 0),
    'rental_count', coalesce((select sum(coalesce((item ->> 'rental_fleet_count')::integer, 0)) from jsonb_array_elements(v_companies) item), 0),
    'product_count', coalesce((select sum(coalesce((item ->> 'product_count')::integer, 0)) from jsonb_array_elements(v_businesses) item), 0),
    'subscription_count', jsonb_array_length(v_subscriptions),
    'admin_role_count', jsonb_array_length(v_admin_roles)
  );

  return v_base || jsonb_build_object(
    'user', v_user,
    'accounts', v_accounts,
    'businesses', v_businesses,
    'companies', v_companies,
    'operators', v_operators,
    'subscriptions', v_subscriptions,
    'admin_roles', v_admin_roles,
    'activity', coalesce(v_base -> 'audit', '[]'::jsonb),
    'summary', v_summary
  );
end;
$$;

revoke all on function public.admin_search_users_v3(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_get_user_workspace_v2(uuid) from public, anon;
grant execute on function public.admin_search_users_v3(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_get_user_workspace_v2(uuid) to authenticated;
