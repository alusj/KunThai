-- Churn intelligence, Phase 3: admin access and the data behind the admin screens.
-- Plan: docs/2026-11-06-churn-intelligence-plan.md (§2.4, §4)
-- Builds on 20261106131000_churn_activity_layer.sql and 20261106140000_churn_scores.sql.
--
-- 1. admin_assignments.churn_product_scopes: each admin gets all sectors or only some.
--    Scopes are paired per assignment: sectors × products × countries.
-- 2. Permissions: churn.view (totals), churn.users.view (named users, audit-logged).
-- 3. churn_admin_scope(): the (product, country) pairs the signed-in admin may see
--    (worked out once per call).
-- 4. Admin RPCs: access, overview, growth and leaders, watchlist, and product access management.

-- 1. Product scopes ----------------------------------------------------------

alter table public.admin_assignments
  add column if not exists churn_product_scopes text[] not null default array['all']::text[];

-- 2. Permissions -------------------------------------------------------------

insert into public.admin_permissions (permission_key, name, description, permission_group) values
  ('churn.view', 'View churn intelligence', 'Churn, growth and leader totals for the sectors and countries in scope.', 'churn'),
  ('churn.users.view', 'View churn watchlist users', 'Named users on the watchlist and leader boards. Every view is audit-logged.', 'churn')
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group;

with grants (role_key, permission_key) as (
  values
    ('super_admin', 'churn.view'), ('super_admin', 'churn.users.view'),
    ('chief_admin', 'churn.view'), ('chief_admin', 'churn.users.view'),
    ('operations_lead', 'churn.view'), ('operations_lead', 'churn.users.view'),
    ('explore_manager', 'churn.view'), ('explore_manager', 'churn.users.view'),
    ('marketplace_manager', 'churn.view'), ('marketplace_manager', 'churn.users.view'),
    ('transport_manager', 'churn.view'), ('transport_manager', 'churn.users.view'),
    ('notification_officer', 'churn.view'),
    ('analyst', 'churn.view'),
    ('auditor', 'churn.view')
)
insert into public.admin_role_permissions (role_id, permission_key)
select role.id, grants.permission_key
from grants
join public.admin_roles role on role.role_key = grants.role_key
on conflict do nothing;

-- 3. Scope -------------------------------------------------------------------
-- country_iso null = every country.

create or replace function public.churn_admin_scope(p_permission text default 'churn.view')
returns table (product text, country_iso text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    s.product,
    case when 'all' = any(a.region_scopes) then null else upper(region.code) end
  from public.admin_assignments a
  join public.admin_role_permissions rp on rp.role_id = a.role_id and rp.permission_key = p_permission
  join public.churn_product_settings s on s.enabled
  cross join lateral unnest(
    case when 'all' = any(a.region_scopes) or cardinality(a.region_scopes) = 0 then array['all'] else a.region_scopes end
  ) as region(code)
  where p_permission in ('churn.view', 'churn.users.view')
    and a.user_id = auth.uid()
    and public.admin_assignment_is_active(a)
    and public.admin_has_permission(p_permission)
    and ('all' = any(a.churn_product_scopes) or s.product = any(a.churn_product_scopes))
    and ('all' = any(a.sector_scopes) or s.sector = any(a.sector_scopes))
$$;

revoke execute on function public.churn_admin_scope(text) from public, anon, authenticated;


-- 4a. Access: what this admin can see -----------------------------------------

create or replace function public.admin_churn_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scored_on date;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;

  select max(scored_on) into v_scored_on from public.churn_scores;

  return jsonb_build_object(
    'scoredOn', v_scored_on,
    'canViewUsers', public.admin_has_permission('churn.users.view'),
    'canManageAccess', public.admin_has_permission('team.manage'),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product', s.product, 'label', s.label, 'sector', s.sector,
        'churnAfterDays', s.churn_after_days, 'tracksOpens', s.tracks_opens
      ) order by s.sort_order)
      from public.churn_product_settings s
      where s.product in (select sc.product from public.churn_admin_scope('churn.view') sc)
    ), '[]'::jsonb),
    'allCountries', exists (select 1 from public.churn_admin_scope('churn.view') sc where sc.country_iso is null),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('iso', c.iso2, 'name', c.name, 'currency', c.currency_code) order by c.name)
      from public.kunthai_countries c
      where exists (
        select 1 from public.churn_admin_scope('churn.view') sc
        where sc.country_iso is null or sc.country_iso = c.iso2
      )
      and (
        exists (select 1 from public.churn_scores cs where cs.country_iso = c.iso2)
        or exists (select 1 from public.churn_admin_scope('churn.view') sc where sc.country_iso = c.iso2)
      )
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_churn_access() from public, anon;
grant execute on function public.admin_churn_access() to authenticated;

-- 4b. Overview: totals, segments, inactivity, sectors, countries, signals, actions, trend

create or replace function public.admin_churn_overview(p_country text default null, p_product text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day date;
  v_prev date;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_result jsonb;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;

  select max(scored_on) into v_day from public.churn_scores;
  if v_day is null then
    return jsonb_build_object('scoredOn', null);
  end if;
  select max(scored_on) into v_prev from public.churn_scores where scored_on <= v_day - 7;

  with scope as (
    select * from public.churn_admin_scope('churn.view')
  ),
  scores as (
    select s.*
    from public.churn_scores s
    where s.scored_on in (v_day, coalesce(v_prev, v_day))
      and (v_product is null or s.product = v_product)
      and (v_country is null or s.country_iso = v_country)
      and exists (select 1 from scope sc where sc.product = s.product and (sc.country_iso is null or sc.country_iso = s.country_iso))
  ),
  per_user as (
    select scored_on, user_id,
      case
        when bool_and(status = 'churned') then 'churned'
        when bool_or(status = 'at_risk') then 'at_risk'
        when bool_or(status = 'active') then 'active'
        else 'new'
      end as status,
      max(score) filter (where status <> 'churned') as live_score
    from scores
    group by scored_on, user_id
  ),
  kpi as (
    select scored_on,
      count(*) as users,
      count(*) filter (where status = 'churned') as churned,
      count(*) filter (where status = 'at_risk') as at_risk,
      count(*) filter (where status = 'active') as active,
      count(*) filter (where status = 'new') as new_users
    from per_user
    group by scored_on
  ),
  today as (select * from scores where scored_on = v_day),
  revenue as (
    select status, rev.key as currency, sum(rev.value::numeric) as amount
    from today
    cross join lateral jsonb_each_text(today.revenue_at_risk) rev
    where status in ('at_risk', 'churned')
    group by status, rev.key
  ),
  features as (
    select f.*
    from public.churn_user_features f
    join today t on t.user_id = f.user_id and t.product = f.product
  ),
  inactivity as (
    select user_id, min(days_inactive) as days from features group by user_id
  ),
  activity as (
    select a.user_id, a.product, a.day
    from public.churn_activity_daily a
    where a.day > v_day - 30 and a.day <= v_day
      and (a.open_count > 0 or a.action_count > 0)
      and (v_product is null or a.product = v_product)
      and (v_country is null or a.country_iso = v_country)
      and exists (select 1 from scope sc where sc.product = a.product and (sc.country_iso is null or sc.country_iso = a.country_iso))
  ),
  signals as (
    select sig->>'key' as key, count(distinct t.user_id) as users
    from today t
    cross join lateral jsonb_array_elements(t.top_signals) sig
    where t.status in ('at_risk', 'new', 'active') and t.score >= 40
    group by sig->>'key'
  ),
  trend as (
    select d.scored_on,
      count(*) filter (where d.status = 'churned') as churned,
      count(*) filter (where d.status = 'at_risk') as at_risk,
      count(*) as users
    from (
      select s.scored_on, s.user_id,
        case when bool_and(s.status = 'churned') then 'churned' when bool_or(s.status = 'at_risk') then 'at_risk' else 'other' end as status
      from public.churn_scores s
      where s.scored_on > v_day - 30
        and (v_product is null or s.product = v_product)
        and (v_country is null or s.country_iso = v_country)
        and exists (select 1 from scope sc where sc.product = s.product and (sc.country_iso is null or sc.country_iso = s.country_iso))
      group by s.scored_on, s.user_id
    ) d
    group by d.scored_on
  )
  select jsonb_build_object(
    'scoredOn', v_day,
    'comparedTo', v_prev,
    'country', v_country,
    'product', v_product,
    'kpis', (
      select jsonb_build_object(
        'users', coalesce(k.users, 0),
        'churned', coalesce(k.churned, 0),
        'atRisk', coalesce(k.at_risk, 0),
        'active', coalesce(k.active, 0),
        'new', coalesce(k.new_users, 0),
        'churnRate', case when coalesce(k.users, 0) > 0 then round(k.churned::numeric / k.users, 4) else 0 end,
        'previous', case when v_prev is null then null else (
          select jsonb_build_object(
            'users', p.users, 'churned', p.churned, 'atRisk', p.at_risk,
            'churnRate', case when p.users > 0 then round(p.churned::numeric / p.users, 4) else 0 end)
          from kpi p where p.scored_on = v_prev
        ) end
      )
      from (select 1) one left join kpi k on k.scored_on = v_day
    ),
    'revenueAtRisk', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by amount desc) from revenue where status = 'at_risk'), '[]'::jsonb),
    'revenueLost', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by amount desc) from revenue where status = 'churned'), '[]'::jsonb),
    'segments', (
      select jsonb_build_object(
        'low', count(*) filter (where status in ('active', 'at_risk') and coalesce(live_score, 0) < 40),
        'medium', count(*) filter (where status in ('active', 'at_risk') and live_score between 40 and 59),
        'high', count(*) filter (where status in ('active', 'at_risk') and live_score >= 60),
        'churned', count(*) filter (where status = 'churned'),
        'new', count(*) filter (where status = 'new')
      )
      from per_user where scored_on = v_day
    ),
    'inactivity', (
      select jsonb_agg(jsonb_build_object('label', b.label, 'users', coalesce(c.n, 0)) order by b.ord)
      from (values (1, '0–6 days', 0, 6), (2, '7–13 days', 7, 13), (3, '14–29 days', 14, 29),
                   (4, '30–59 days', 30, 59), (5, '60–89 days', 60, 89), (6, '90+ days', 90, 100000)) b(ord, label, lo, hi)
      left join lateral (select count(*) as n from inactivity i where i.days between b.lo and b.hi) c on true
    ),
    'products', coalesce((
      select jsonb_agg(row_to_json(p)::jsonb order by p.sort_order)
      from (
        select s.product, s.label, s.sector, s.sort_order, s.churn_after_days as "churnAfterDays",
          count(t.user_id) as users,
          count(t.user_id) filter (where t.status = 'churned') as churned,
          count(t.user_id) filter (where t.status = 'at_risk') as "atRisk",
          count(t.user_id) filter (where t.status = 'new') as "new",
          case when count(t.user_id) > 0 then round((count(t.user_id) filter (where t.status = 'churned'))::numeric / count(t.user_id), 4) else 0 end as "churnRate",
          coalesce(bool_or(t.provisional), false) as provisional,
          (select count(distinct a.user_id) from activity a where a.product = s.product and a.day = v_day) as dau,
          (select count(distinct a.user_id) from activity a where a.product = s.product and a.day > v_day - 7) as wau,
          (select count(distinct a.user_id) from activity a where a.product = s.product) as mau
        from public.churn_product_settings s
        left join today t on t.product = s.product
        where s.product in (select sc.product from scope sc)
          and (v_product is null or s.product = v_product)
        group by s.product, s.label, s.sector, s.sort_order, s.churn_after_days
      ) p
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(row_to_json(c)::jsonb order by c.users desc, c.iso)
      from (
        select coalesce(u.country_iso, '??') as iso, kc.name,
          count(*) as users,
          count(*) filter (where u.status = 'churned') as churned,
          count(*) filter (where u.status = 'at_risk') as "atRisk",
          round((count(*) filter (where u.status = 'churned'))::numeric / greatest(count(*), 1), 4) as "churnRate"
        from (
          select t.user_id, max(t.country_iso) as country_iso,
            case when bool_and(t.status = 'churned') then 'churned' when bool_or(t.status = 'at_risk') then 'at_risk' else 'other' end as status
          from today t group by t.user_id
        ) u
        left join public.kunthai_countries kc on kc.iso2 = u.country_iso
        group by u.country_iso, kc.name
      ) c
    ), '[]'::jsonb),
    'signals', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'users', users) order by users desc) from signals), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('action', recommended_action, 'product', product, 'users', n) order by n desc)
      from (
        select recommended_action, product, count(*) as n from today
        where recommended_action is not null
        group by recommended_action, product
      ) x
    ), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('day', scored_on, 'users', users, 'churned', churned, 'atRisk', at_risk) order by scored_on) from trend), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_overview(text, text) from public, anon;
grant execute on function public.admin_churn_overview(text, text) to authenticated;

-- 4c. Growth and leaders ---------------------------------------------------------

create or replace function public.admin_churn_leaders(p_country text default null, p_product text default null, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_to date;
  v_from date;
  v_prior_from date;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_users_allowed boolean := public.admin_has_permission('churn.users.view');
  v_result jsonb;
  v_named integer := 0;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;

  v_to := least((select max(day) from public.churn_activity_daily), (now() at time zone 'utc')::date);
  if v_to is null then
    return jsonb_build_object('to', null);
  end if;
  v_from := v_to - v_days + 1;
  v_prior_from := v_from - v_days;

  -- The admin's scope, worked out once.
  drop table if exists pg_temp.churn_scope_view;
  create temp table churn_scope_view on commit drop as select * from public.churn_admin_scope('churn.view');
  drop table if exists pg_temp.churn_scope_users;
  create temp table churn_scope_users on commit drop as select * from public.churn_admin_scope('churn.users.view');

  drop table if exists pg_temp.churn_leader_activity;
  create temp table churn_leader_activity on commit drop as
  select a.user_id, a.product, a.day, a.country_iso, a.open_count, a.action_count
  from public.churn_activity_daily a
  where a.day >= v_prior_from and a.day <= v_to
    and (a.open_count > 0 or a.action_count > 0)
    and (v_product is null or a.product = v_product)
    and (v_country is null or a.country_iso = v_country)
    and exists (select 1 from churn_scope_view sc where sc.product = a.product and (sc.country_iso is null or sc.country_iso = a.country_iso));

  with period as (select * from churn_leader_activity where day >= v_from),
  prior as (select * from churn_leader_activity where day < v_from),
  first_seen as (
    select a.user_id, min(a.day) as first_day
    from public.churn_activity_daily a
    where (a.open_count > 0 or a.action_count > 0)
      and (v_product is null or a.product = v_product)
      and (v_country is null or a.country_iso = v_country)
      and exists (select 1 from churn_scope_view sc where sc.product = a.product and (sc.country_iso is null or sc.country_iso = a.country_iso))
    group by a.user_id
  ),
  latest_scores as (
    select s.*
    from public.churn_scores s
    where s.scored_on = (select max(scored_on) from public.churn_scores)
      and (v_product is null or s.product = v_product)
      and (v_country is null or s.country_iso = v_country)
      and exists (select 1 from churn_scope_view sc where sc.product = s.product and (sc.country_iso is null or sc.country_iso = s.country_iso))
  ),
  spend as (
    select coalesce(sd.country_iso, '??') as iso, sd.currency, sum(sd.amount) as amount
    from public.churn_spend_daily sd
    where sd.day >= v_from and sd.day <= v_to
      and (v_product is null or sd.product = v_product)
      and (v_country is null or sd.country_iso = v_country)
      and exists (select 1 from churn_scope_view sc where sc.product = sd.product and (sc.country_iso is null or sc.country_iso = sd.country_iso))
    group by 1, 2
  ),
  user_sectors as (
    select user_id, array_agg(distinct product order by product) as products
    from period group by user_id
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'days', v_days,
    'countries', coalesce((
      select jsonb_agg(row_to_json(c)::jsonb order by c."activeUsers" desc, c.iso)
      from (
        select coalesce(x.iso, '??') as iso, kc.name,
          x.active_users as "activeUsers",
          coalesce(pr.prior_users, 0) as "priorActiveUsers",
          case when coalesce(pr.prior_users, 0) > 0 then round((x.active_users - pr.prior_users)::numeric / pr.prior_users, 4) end as growth,
          (select count(*) from first_seen fs
             where fs.first_day >= v_from
               and exists (select 1 from period p2 where p2.user_id = fs.user_id and p2.country_iso is not distinct from x.iso)) as "newUsers",
          (select round((count(*) filter (where ls.status = 'churned'))::numeric / greatest(count(*), 1), 4)
             from latest_scores ls where ls.country_iso is not distinct from x.iso) as "churnRate",
          coalesce((select jsonb_agg(jsonb_build_object('currency', sp.currency, 'amount', round(sp.amount, 2)) order by sp.amount desc)
             from spend sp where sp.iso = coalesce(x.iso, '??')), '[]'::jsonb) as spend
        from (select country_iso as iso, count(distinct user_id) as active_users from period group by country_iso) x
        left join (select country_iso as iso, count(distinct user_id) as prior_users from prior group by country_iso) pr
          on pr.iso is not distinct from x.iso
        left join public.kunthai_countries kc on kc.iso2 = x.iso
      ) c
    ), '[]'::jsonb),
    'sectors', coalesce((
      select jsonb_agg(row_to_json(s)::jsonb order by s."activeUsers" desc, s.sort_order)
      from (
        select ps.product, ps.label, ps.sort_order,
          (select count(distinct user_id) from period p where p.product = ps.product) as "activeUsers",
          (select count(distinct user_id) from prior p where p.product = ps.product) as "priorActiveUsers",
          (select count(distinct user_id) from period p where p.product = ps.product and p.day = v_to) as dau,
          (select count(distinct user_id) from period p where p.product = ps.product and p.day > v_to - 7) as wau,
          (select count(*) from period p where p.product = ps.product and p.action_count > 0) as "actionDays",
          coalesce((select sum(action_count) from period p where p.product = ps.product), 0) as actions,
          (select round((count(*) filter (where ls.status = 'churned'))::numeric / greatest(count(*), 1), 4)
             from latest_scores ls where ls.product = ps.product) as "churnRate",
          (select coalesce(bool_or(ls.provisional), false) from latest_scores ls where ls.product = ps.product) as provisional
        from public.churn_product_settings ps
        where ps.enabled
          and (v_product is null or ps.product = v_product)
          and ps.product in (select sc.product from churn_scope_view sc)
      ) s
    ), '[]'::jsonb),
    'crossSector', jsonb_build_object(
      'buckets', (
        select jsonb_build_object(
          'one', count(*) filter (where cardinality(products) = 1),
          'two', count(*) filter (where cardinality(products) = 2),
          'threePlus', count(*) filter (where cardinality(products) >= 3))
        from user_sectors
      ),
      'pairs', coalesce((
        select jsonb_agg(jsonb_build_object('a', a, 'b', b, 'users', n) order by n desc)
        from (
          select pa.product as a, pb.product as b, count(*) as n
          from user_sectors us
          cross join lateral unnest(us.products) pa(product)
          cross join lateral unnest(us.products) pb(product)
          where pa.product < pb.product
          group by 1, 2
          order by 3 desc
          limit 10
        ) pairs
      ), '[]'::jsonb)
    ),
    'cohorts', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'users', users, 'retained', retained,
                         'retention', round(retained::numeric / greatest(users, 1), 4)) order by month)
      from (
        select date_trunc('month', u.created_at)::date as month,
          count(distinct u.id) as users,
          count(distinct u.id) filter (where exists (
            select 1 from churn_leader_activity a where a.user_id = u.id and a.day > v_to - 30)) as retained
        from auth.users u
        where u.created_at >= date_trunc('month', v_to::timestamp) - interval '5 months'
          and u.id in (select ls.user_id from latest_scores ls)
        group by 1
      ) co
    ), '[]'::jsonb),
    'weekdays', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', wd, 'userDays', n) order by wd)
      from (select extract(isodow from day)::integer as wd, count(*) as n from period group by 1) w
    ), '[]'::jsonb),
    'usersHidden', not v_users_allowed
  )
  into v_result;

  if v_users_allowed then
    with period as (select * from churn_leader_activity where day >= v_from),
    prior as (select * from churn_leader_activity where day < v_from),
    allowed as (
      select distinct p.user_id from period p
      where exists (select 1 from churn_scope_users sc where sc.product = p.product and (sc.country_iso is null or sc.country_iso = p.country_iso))
    ),
    ranked as (
      select p.user_id,
        count(distinct p.day) as active_days,
        sum(p.action_count) as actions,
        array_agg(distinct p.product order by p.product) as products,
        max(p.country_iso) as country_iso,
        (select count(distinct pr.day) from prior pr where pr.user_id = p.user_id) as prior_days
      from period p
      join allowed al on al.user_id = p.user_id
      group by p.user_id
    ),
    named as (
      select r.*, ep.display_name, ep.username, case when ep.avatar_url like 'data:%' then null else ep.avatar_url end as avatar_url
      from ranked r
      left join public.explore_profiles ep on ep.user_id = r.user_id
    )
    select v_result || jsonb_build_object(
      'mostActive', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', user_id, 'name', display_name, 'username', username, 'avatarUrl', avatar_url,
          'country', country_iso, 'products', products, 'activeDays', active_days, 'actions', actions,
          'priorActiveDays', prior_days) order by active_days desc, actions desc)
        from (select * from named order by active_days desc, actions desc limit 20) t
      ), '[]'::jsonb),
      'rising', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', user_id, 'name', display_name, 'username', username, 'avatarUrl', avatar_url,
          'country', country_iso, 'products', products, 'activeDays', active_days, 'actions', actions,
          'priorActiveDays', prior_days, 'gain', active_days - prior_days) order by active_days - prior_days desc, actions desc)
        from (select * from named where active_days - prior_days >= 2 order by active_days - prior_days desc, actions desc limit 20) t
      ), '[]'::jsonb)
    ),
    (select count(*) from (select 1 from named limit 40) n)
    into v_result, v_named;

    if v_named > 0 then
      perform public.admin_log_action(
        'churn.leaders.viewed', null, 'churn_leaders', null, null, '', null, null,
        jsonb_build_object('country', v_country, 'product', v_product, 'days', v_days)
      );
    end if;
  end if;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_leaders(text, text, integer) from public, anon;
grant execute on function public.admin_churn_leaders(text, text, integer) to authenticated;

-- 4d. Watchlist: named users, audit-logged ------------------------------------

create or replace function public.admin_churn_watchlist(
  p_country text default null,
  p_product text default null,
  p_status text default 'at_risk',
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date;
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_status text := coalesce(nullif(trim(coalesce(p_status, '')), ''), 'at_risk');
  v_search text := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_rows jsonb;
begin
  if not public.admin_has_permission('churn.users.view') then
    raise exception 'The churn watchlist is not available for this account.' using errcode = '42501';
  end if;
  if v_status not in ('at_risk', 'churned', 'new', 'active', 'all', 'attention') then
    raise exception 'Unknown status %', v_status using errcode = '22023';
  end if;

  select max(scored_on) into v_day from public.churn_scores;
  if v_day is null then
    return jsonb_build_object('scoredOn', null, 'total', 0, 'rows', '[]'::jsonb);
  end if;

  drop table if exists pg_temp.churn_scope_users;
  create temp table churn_scope_users on commit drop as select * from public.churn_admin_scope('churn.users.view');

  drop table if exists pg_temp.churn_watch;
  create temp table churn_watch on commit drop as
  select s.user_id, s.product, s.country_iso, s.status, s.segment, s.score, s.top_signals,
    s.revenue_at_risk, s.recommended_action, s.provisional,
    f.last_active_day, f.days_inactive, f.active_days_30, f.actions_30,
    ep.display_name, ep.username, case when ep.avatar_url like 'data:%' then null else ep.avatar_url end as avatar_url
  from public.churn_scores s
  left join public.churn_user_features f on f.user_id = s.user_id and f.product = s.product
  left join public.explore_profiles ep on ep.user_id = s.user_id
  where s.scored_on = v_day
    and (v_product is null or s.product = v_product)
    and (v_country is null or s.country_iso = v_country)
    and (
      v_status = 'all'
      or (v_status = 'attention' and (s.status = 'at_risk' or (s.status in ('new', 'active') and s.score >= 40)))
      or s.status = v_status
    )
    and (v_search is null
         or lower(coalesce(ep.display_name, '')) like '%' || v_search || '%'
         or lower(coalesce(ep.username, '')) like '%' || v_search || '%')
    and exists (select 1 from churn_scope_users sc where sc.product = s.product and (sc.country_iso is null or sc.country_iso = s.country_iso));

  select count(*) into v_total from churn_watch;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', w.user_id, 'name', w.display_name, 'username', w.username, 'avatarUrl', w.avatar_url,
    'product', w.product, 'country', w.country_iso, 'status', w.status, 'segment', w.segment, 'score', w.score,
    'signals', w.top_signals, 'revenueAtRisk', w.revenue_at_risk, 'action', w.recommended_action,
    'provisional', w.provisional, 'lastActiveDay', w.last_active_day, 'daysInactive', w.days_inactive,
    'activeDays30', w.active_days_30, 'actions30', w.actions_30
  ) order by w.score desc, w.days_inactive asc nulls last, w.user_id), '[]'::jsonb)
  into v_rows
  from (
    select * from churn_watch
    order by score desc, days_inactive asc nulls last, user_id
    limit v_limit offset v_offset
  ) w;

  if v_total > 0 then
    perform public.admin_log_action(
      'churn.watchlist.viewed', null, 'churn_watchlist', null, null, '', null, null,
      jsonb_build_object('country', v_country, 'product', v_product, 'status', v_status,
                         'search', v_search is not null, 'returned', jsonb_array_length(v_rows), 'total', v_total)
    );
  end if;

  return jsonb_build_object('scoredOn', v_day, 'total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$$;

revoke execute on function public.admin_churn_watchlist(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_churn_watchlist(text, text, text, text, integer, integer) to authenticated;

-- 4e. Product access: which churn sectors each admin sees (team.manage) -------

create or replace function public.admin_churn_list_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.admin_has_permission('team.manage') then
    raise exception 'Managing churn access is not available for this account.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assignmentId', a.id, 'userId', a.user_id,
      'name', ep.display_name, 'email', u.email, 'jobTitle', sp.job_title,
      'roleKey', r.role_key, 'roleName', r.name,
      'sectors', a.sector_scopes, 'regions', a.region_scopes,
      'products', a.churn_product_scopes,
      'canViewUsers', exists (select 1 from public.admin_role_permissions rp2 where rp2.role_id = a.role_id and rp2.permission_key = 'churn.users.view')
    ) order by r.rank desc, coalesce(ep.display_name, u.email))
    from public.admin_assignments a
    join public.admin_roles r on r.id = a.role_id
    join auth.users u on u.id = a.user_id
    left join public.admin_staff_profiles sp on sp.user_id = a.user_id
    left join public.explore_profiles ep on ep.user_id = a.user_id
    where public.admin_assignment_is_active(a)
      and exists (select 1 from public.admin_role_permissions rp where rp.role_id = a.role_id and rp.permission_key = 'churn.view')
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_churn_list_access() from public, anon;
grant execute on function public.admin_churn_list_access() to authenticated;

create or replace function public.admin_set_churn_product_scopes(p_assignment_id uuid, p_products text[], p_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before text[];
  v_after text[];
begin
  if not public.admin_has_permission('team.manage') then
    raise exception 'Managing churn access is not available for this account.' using errcode = '42501';
  end if;

  select array_agg(distinct p order by p) into v_after
  from unnest(coalesce(p_products, array[]::text[])) p
  where p = 'all' or exists (select 1 from public.churn_product_settings s where s.product = p);

  if v_after is null or cardinality(v_after) = 0 then
    raise exception 'Choose at least one sector, or all.' using errcode = '22023';
  end if;
  if 'all' = any(v_after) then
    v_after := array['all'];
  end if;

  select churn_product_scopes into v_before from public.admin_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  update public.admin_assignments
  set churn_product_scopes = v_after, updated_at = now()
  where id = p_assignment_id;

  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  perform public.admin_log_action(
    'churn.access.updated', null, 'admin_assignment', p_assignment_id, null, coalesce(p_reason, ''),
    jsonb_build_object('products', v_before), jsonb_build_object('products', v_after), '{}'::jsonb
  );

  return jsonb_build_object('assignmentId', p_assignment_id, 'products', v_after);
end;
$$;

revoke execute on function public.admin_set_churn_product_scopes(uuid, text[], text) from public, anon;
grant execute on function public.admin_set_churn_product_scopes(uuid, text[], text) to authenticated;
