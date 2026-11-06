-- Churn intelligence, Phase 4: sector detail pages and the region drill-down.
-- Plan: docs/2026-11-06-churn-intelligence-plan.md (§4, screen 4 and the map)
-- Builds on 20261106131000, 20261106140000 and 20261106150000.
--
-- 1. admin_churn_product_detail(): one sector's rule, engagement funnel, score bands,
--    signals with their churn lift (once there is score history), spend and top countries.
-- 2. admin_churn_regions(): country → region → district churn, from each person's
--    KunThai area (kunthai_account_regions.region_path). Regions have no shapes, so
--    the admin page draws them as heat tiles.
-- Both read only, scoped like the Phase 3 RPCs (churn.view, sector × product × country).

create or replace function public.admin_churn_product_detail(p_product text, p_country text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_day date;
  v_baseline date;
  v_settings record;
  v_result jsonb;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;

  select * into v_settings from public.churn_product_settings where product = v_product;
  if not found then
    raise exception 'Unknown sector %', v_product using errcode = '22023';
  end if;

  drop table if exists pg_temp.churn_detail_scope;
  create temp table churn_detail_scope on commit drop as
  select * from public.churn_admin_scope('churn.view') sc where sc.product = v_product;
  if not exists (select 1 from churn_detail_scope) then
    raise exception 'This sector is not in your churn access.' using errcode = '42501';
  end if;

  select max(scored_on) into v_day from public.churn_scores;
  if v_day is null then
    return jsonb_build_object('scoredOn', null, 'product', v_product);
  end if;
  -- Lift needs an earlier score day to compare outcomes against: at least 14 days back.
  select max(scored_on) into v_baseline from public.churn_scores where scored_on <= v_day - 14;

  drop table if exists pg_temp.churn_detail_now;
  create temp table churn_detail_now on commit drop as
  select s.*, f.active_days_7, f.active_days_30, f.actions_30, f.spend_30, f.last_open_day, f.days_inactive
  from public.churn_scores s
  left join public.churn_user_features f on f.user_id = s.user_id and f.product = s.product
  where s.scored_on = v_day and s.product = v_product
    and (v_country is null or s.country_iso = v_country)
    and exists (select 1 from churn_detail_scope sc where sc.country_iso is null or sc.country_iso = s.country_iso);

  with baseline as (
    select b.user_id, b.top_signals
    from public.churn_scores b
    where v_baseline is not null and b.scored_on = v_baseline and b.product = v_product and b.status <> 'churned'
      and (v_country is null or b.country_iso = v_country)
      and exists (select 1 from churn_detail_scope sc where sc.country_iso is null or sc.country_iso = b.country_iso)
  ),
  outcome as (
    select b.user_id, b.top_signals, coalesce(n.status = 'churned', false) as churned
    from baseline b
    left join churn_detail_now n on n.user_id = b.user_id
  ),
  signal_keys as (
    select distinct sig->>'key' as key from outcome cross join lateral jsonb_array_elements(outcome.top_signals) sig
  ),
  lift as (
    select k.key,
      count(*) filter (where o.top_signals @> jsonb_build_array(jsonb_build_object('key', k.key))) as with_n,
      count(*) filter (where o.churned and o.top_signals @> jsonb_build_array(jsonb_build_object('key', k.key))) as with_churned,
      count(*) filter (where not o.top_signals @> jsonb_build_array(jsonb_build_object('key', k.key))) as without_n,
      count(*) filter (where o.churned and not o.top_signals @> jsonb_build_array(jsonb_build_object('key', k.key))) as without_churned
    from signal_keys k cross join outcome o
    group by k.key
  ),
  live as (select * from churn_detail_now where status <> 'churned'),
  signals_now as (
    select sig->>'key' as key, count(distinct l.user_id) as users
    from live l cross join lateral jsonb_array_elements(l.top_signals) sig
    group by 1
  ),
  spend as (
    select sd.currency, sum(sd.amount) as amount
    from public.churn_spend_daily sd
    where sd.product = v_product and sd.day > v_day - 30 and sd.day <= v_day
      and (v_country is null or sd.country_iso = v_country)
      and exists (select 1 from churn_detail_scope sc where sc.country_iso is null or sc.country_iso = sd.country_iso)
    group by sd.currency
  ),
  at_risk_revenue as (
    select rev.key as currency, sum(rev.value::numeric) as amount
    from churn_detail_now n cross join lateral jsonb_each_text(n.revenue_at_risk) rev
    where n.status = 'at_risk'
    group by rev.key
  )
  select jsonb_build_object(
    'scoredOn', v_day,
    'baselineDay', v_baseline,
    'product', v_product,
    'label', v_settings.label,
    'sector', v_settings.sector,
    'churnAfterDays', v_settings.churn_after_days,
    'tracksOpens', v_settings.tracks_opens,
    'provisional', coalesce((select bool_or(provisional) from churn_detail_now), false),
    'funnel', (
      select jsonb_build_object(
        'customers', count(*),
        'opened30', count(*) filter (where last_open_day > v_day - 30),
        'active30', count(*) filter (where coalesce(active_days_30, 0) > 0),
        'active7', count(*) filter (where coalesce(active_days_7, 0) > 0),
        'acted30', count(*) filter (where coalesce(actions_30, 0) > 0),
        'spent30', count(*) filter (where coalesce(spend_30, 0) > 0),
        'atRisk', count(*) filter (where status = 'at_risk'),
        'churned', count(*) filter (where status = 'churned'),
        'new', count(*) filter (where status = 'new'),
        'avgActiveDays30', round(coalesce(avg(active_days_30) filter (where coalesce(active_days_30, 0) > 0), 0), 1),
        'avgActions30', round(coalesce(avg(actions_30) filter (where coalesce(actions_30, 0) > 0), 0), 1)
      )
      from churn_detail_now
    ),
    'scoreBands', (
      select jsonb_agg(jsonb_build_object('from', b.lo, 'to', b.hi, 'users',
        (select count(*) from live l where l.score between b.lo and b.hi)) order by b.lo)
      from (values (0, 19), (20, 39), (40, 59), (60, 79), (80, 100)) b(lo, hi)
    ),
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', sn.key,
        'users', sn.users,
        'share', round(sn.users::numeric / greatest((select count(*) from live), 1), 4),
        'withChurnRate', case when l.with_n > 0 then round(l.with_churned::numeric / l.with_n, 4) end,
        'withoutChurnRate', case when l.without_n > 0 then round(l.without_churned::numeric / l.without_n, 4) end,
        'lift', case when l.with_n >= 3 and l.without_n >= 3 and l.without_churned > 0
          then round((l.with_churned::numeric / l.with_n) / (l.without_churned::numeric / l.without_n), 2) end
      ) order by sn.users desc)
      from signals_now sn left join lift l on l.key = sn.key
    ), '[]'::jsonb),
    'spend30', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by amount desc) from spend), '[]'::jsonb),
    'revenueAtRisk', coalesce((select jsonb_agg(jsonb_build_object('currency', currency, 'amount', round(amount, 2)) order by amount desc) from at_risk_revenue), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object('action', recommended_action, 'users', n) order by n desc)
      from (select recommended_action, count(*) as n from churn_detail_now where recommended_action is not null group by 1) a
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_object('iso', coalesce(c.country_iso, '??'), 'name', kc.name, 'users', c.users,
        'churnRate', round(c.churned::numeric / greatest(c.users, 1), 4)) order by c.users desc)
      from (
        select country_iso, count(*) as users, count(*) filter (where status = 'churned') as churned
        from churn_detail_now group by country_iso
      ) c
      left join public.kunthai_countries kc on kc.iso2 = c.country_iso
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_product_detail(text, text) from public, anon;
grant execute on function public.admin_churn_product_detail(text, text) to authenticated;

-- 2. Regions ---------------------------------------------------------------------

create or replace function public.admin_churn_regions(p_country text, p_product text default null, p_parent uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_day date;
  v_parent public.kunthai_country_regions%rowtype;
  v_country_row public.kunthai_countries%rowtype;
  v_result jsonb;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;
  if v_country is null then
    raise exception 'Choose a country first.' using errcode = '22023';
  end if;

  drop table if exists pg_temp.churn_region_scope;
  create temp table churn_region_scope on commit drop as
  select * from public.churn_admin_scope('churn.view') sc
  where (sc.country_iso is null or sc.country_iso = v_country)
    and (v_product is null or sc.product = v_product);
  if not exists (select 1 from churn_region_scope) then
    raise exception 'This country is not in your churn access.' using errcode = '42501';
  end if;

  select * into v_country_row from public.kunthai_countries where iso2 = v_country;

  if p_parent is not null then
    select * into v_parent from public.kunthai_country_regions where id = p_parent and country_iso = v_country;
    if not found then
      raise exception 'Region not found in this country.' using errcode = 'P0002';
    end if;
  end if;

  select max(scored_on) into v_day from public.churn_scores;

  drop table if exists pg_temp.churn_region_people;
  create temp table churn_region_people on commit drop as
  select s.user_id,
    case
      when bool_and(s.status = 'churned') then 'churned'
      when bool_or(s.status = 'at_risk') then 'at_risk'
      when bool_or(s.status = 'active') then 'active'
      else 'new'
    end as status,
    bool_or(coalesce(f.active_days_30, 0) > 0) as active30,
    a.region_path
  from public.churn_scores s
  left join public.churn_user_features f on f.user_id = s.user_id and f.product = s.product
  left join public.kunthai_account_regions a on a.user_id = s.user_id
  where s.scored_on = v_day
    and s.country_iso = v_country
    and (v_product is null or s.product = v_product)
    and s.product in (select product from churn_region_scope)
  group by s.user_id, a.region_path;

  with children as (
    select r.id, r.name, coalesce(nullif(r.display_name, ''), r.name) as display_name, r.type_label, r.level, r.sort_order,
      exists (select 1 from public.kunthai_country_regions c where c.parent_id = r.id and c.is_active) as has_children
    from public.kunthai_country_regions r
    where r.country_iso = v_country and r.is_active
      and (case when p_parent is null then r.level = 1 and r.parent_id is null else r.parent_id = p_parent end)
  ),
  placed as (
    select p.*, (select c.id from children c where c.id = any(coalesce(p.region_path, '{}'::uuid[])) limit 1) as child_id
    from churn_region_people p
    where p_parent is null or p_parent = any(coalesce(p.region_path, '{}'::uuid[]))
  )
  select jsonb_build_object(
    'scoredOn', v_day,
    'country', v_country,
    'countryName', v_country_row.name,
    'subdivisionLabel', v_country_row.subdivision_label_plural,
    'parent', case when p_parent is null then null else jsonb_build_object(
      'id', v_parent.id, 'name', coalesce(nullif(v_parent.display_name, ''), v_parent.name),
      'typeLabel', v_parent.type_label, 'parentId', v_parent.parent_id, 'level', v_parent.level) end,
    'breadcrumb', case when p_parent is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', coalesce(nullif(r.display_name, ''), r.name)) order by r.level)
      from public.kunthai_country_regions r
      where r.id = any(v_parent.path_ids || v_parent.id)
    ), '[]'::jsonb) end,
    'people', (select count(*) from placed),
    'unplaced', (select count(*) from placed where child_id is null),
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.display_name, 'typeLabel', c.type_label, 'hasChildren', c.has_children,
        'users', coalesce(x.users, 0), 'churned', coalesce(x.churned, 0), 'atRisk', coalesce(x.at_risk, 0),
        'active', coalesce(x.active, 0), 'new', coalesce(x.new_users, 0), 'active30', coalesce(x.active30, 0),
        'churnRate', case when coalesce(x.users, 0) > 0 then round(x.churned::numeric / x.users, 4) end
      ) order by coalesce(x.users, 0) desc, c.sort_order, c.display_name)
      from children c
      left join (
        select child_id,
          count(*) as users,
          count(*) filter (where status = 'churned') as churned,
          count(*) filter (where status = 'at_risk') as at_risk,
          count(*) filter (where status = 'active') as active,
          count(*) filter (where status = 'new') as new_users,
          count(*) filter (where active30) as active30
        from placed where child_id is not null group by child_id
      ) x on x.child_id = c.id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_regions(text, text, uuid) from public, anon;
grant execute on function public.admin_churn_regions(text, text, uuid) to authenticated;
