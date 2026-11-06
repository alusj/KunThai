-- Churn intelligence, Phase 5: retention campaigns with a holdout, and their results.
-- Plan: docs/2026-11-06-churn-intelligence-plan.md (§4 screens 6 and 7)
-- Builds on 20261106131000 … 20261106160000.
--
-- How a campaign goes out
--   * An admin with churn.campaigns.send picks one sector, optionally a country, who to
--     reach (at risk, churned, needs attention), and optionally a signal or suggested action.
--   * A holdout share (default 10%) is set aside at random and gets nothing; it is the
--     comparison that shows whether the message actually brought people back.
--   * Skipped: anyone messaged by a churn campaign in the last 7 days, and anyone (target or
--     holdout) still inside the 30-day window of a campaign for the same sector. At most 5,000
--     people per campaign. No second approval (decision of 6 Nov 2026); every send is audit-logged.
--   * The campaign is an ordinary admin_notification_campaigns row (category 'marketing',
--     in-app + push), so the existing triggers send the push and respect each person's
--     push and marketing settings, and it appears in the Notifications analytics too.
--   * The message is chosen per person from p_messages by their account country's locale
--     (kunthai_countries.locale), falling back to English.
--
-- How results are measured
--   * Recovered = active in that sector (open or action) from the day after sending until
--     the end of the window (30 days). Compared between the target group and the holdout.

-- 1. Permission and scope ----------------------------------------------------------

insert into public.admin_permissions (permission_key, name, description, permission_group) values
  ('churn.campaigns.send', 'Send churn campaigns', 'Send retention messages to churn segments in the sectors and countries in scope. Audit-logged.', 'churn')
on conflict (permission_key) do update
set name = excluded.name, description = excluded.description, permission_group = excluded.permission_group;

insert into public.admin_role_permissions (role_id, permission_key)
select role.id, 'churn.campaigns.send'
from public.admin_roles role
where role.role_key in ('super_admin', 'chief_admin', 'operations_lead', 'explore_manager', 'marketplace_manager', 'transport_manager', 'notification_officer')
on conflict do nothing;

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
  where p_permission in ('churn.view', 'churn.users.view', 'churn.campaigns.send')
    and a.user_id = auth.uid()
    and public.admin_assignment_is_active(a)
    and public.admin_has_permission(p_permission)
    and ('all' = any(a.churn_product_scopes) or s.product = any(a.churn_product_scopes))
    and ('all' = any(a.sector_scopes) or s.sector = any(a.sector_scopes))
$$;

revoke execute on function public.churn_admin_scope(text) from public, anon, authenticated;

-- 2. Tables ----------------------------------------------------------------------

create table if not exists public.churn_campaigns (
  id uuid primary key default gen_random_uuid(),
  notification_campaign_id uuid references public.admin_notification_campaigns(id) on delete set null,
  name text not null,
  product text not null references public.churn_product_settings(product) on update cascade,
  country_iso text,
  audience jsonb not null default '{}'::jsonb,
  action_key text,
  holdout_pct smallint not null check (holdout_pct between 0 and 50),
  window_days smallint not null default 30 check (window_days between 7 and 90),
  messages jsonb not null,
  target_count integer not null default 0,
  holdout_count integer not null default 0,
  skipped_recent integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists churn_campaigns_sent_idx on public.churn_campaigns (sent_at desc);

create table if not exists public.churn_campaign_members (
  campaign_id uuid not null references public.churn_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  grp text not null check (grp in ('target', 'holdout')),
  country_iso text,
  locale text,
  score smallint,
  status text,
  segment text,
  primary key (campaign_id, user_id)
);

create index if not exists churn_campaign_members_user_idx on public.churn_campaign_members (user_id, campaign_id);

alter table public.churn_campaigns enable row level security;
alter table public.churn_campaign_members enable row level security;
revoke all on public.churn_campaigns, public.churn_campaign_members from public, anon, authenticated;

-- 3. Helpers ---------------------------------------------------------------------

-- Where a campaign for each sector lands in the app (matches src/Backend/services/campaigns/campaignModel.js).
create or replace function public.churn_campaign_destination(p_product text, p_action text default null)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case p_product
    when 'explore' then jsonb_build_object('sector', 'explore', 'inbox', 'explore', 'screen', 'explore:urfeed')
    when 'swip' then jsonb_build_object('sector', 'explore', 'inbox', 'explore', 'screen', 'explore:swip-tab')
    when 'urmall_buyer' then jsonb_build_object('sector', 'marketplace', 'inbox', 'urmall', 'screen', 'urmall')
    when 'urmall_seller' then jsonb_build_object('sector', 'marketplace', 'inbox', 'urmall.seller',
      'screen', case when p_action = 'urmall_unanswered_nudge' then 'urmall:business-messages' else 'urmall:business' end)
    when 'urride_passenger' then jsonb_build_object('sector', 'transport', 'inbox', 'urride', 'screen', 'urride')
    when 'urride_operator' then jsonb_build_object('sector', 'transport', 'inbox', 'urride.operator', 'screen', 'urride:operator-dashboard')
    when 'business_plan' then jsonb_build_object('sector', 'platform', 'inbox', 'explore', 'screen', 'settings')
    when 'credits' then jsonb_build_object('sector', 'platform', 'inbox', 'explore', 'screen', 'explore:urfeed')
  end
$$;

-- Deterministic holdout: the same person in the same campaign always lands in the same group.
create or replace function public.churn_campaign_in_holdout(p_campaign uuid, p_user uuid, p_pct integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_pct, 0) > 0
    and (('x' || substr(md5(p_campaign::text || ':' || p_user::text), 1, 8))::bit(32)::bigint % 100) < p_pct
$$;

-- The people a campaign would reach, before the holdout split.
create or replace function public.churn_campaign_audience(
  p_product text, p_country text, p_status text, p_signal text, p_action text
)
returns table (user_id uuid, country_iso text, score smallint, status text, segment text, recently_contacted boolean, locale text)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select * from public.churn_admin_scope('churn.campaigns.send') sc where sc.product = p_product
  ),
  latest as (select max(scored_on) as day from public.churn_scores)
  select s.user_id, s.country_iso, s.score, s.status, s.segment,
    -- Skipped: messaged by any churn campaign in the last 7 days, or still inside the
    -- measuring window of a campaign for this sector (target or holdout), so a
    -- holdout is never messaged before its results are in.
    exists (
      select 1 from public.churn_campaign_members m
      join public.churn_campaigns c on c.id = m.campaign_id
      where m.user_id = s.user_id
        and (
          (m.grp = 'target' and c.sent_at > now() - interval '7 days')
          or (c.product = p_product and c.sent_at > now() - make_interval(days => c.window_days))
        )
    ) as recently_contacted,
    lower(split_part(coalesce(kc.locale, 'en'), '-', 1)) as locale
  from public.churn_scores s
  join latest on latest.day = s.scored_on
  left join public.kunthai_countries kc on kc.iso2 = s.country_iso
  where s.product = p_product
    and (nullif(upper(trim(coalesce(p_country, ''))), '') is null or s.country_iso = upper(trim(p_country)))
    and exists (select 1 from scope sc where sc.country_iso is null or sc.country_iso = s.country_iso)
    and case coalesce(nullif(p_status, ''), 'attention')
      when 'attention' then s.status = 'at_risk' or (s.status in ('new', 'active') and s.score >= 40)
      when 'at_risk' then s.status = 'at_risk'
      when 'churned' then s.status = 'churned'
      when 'at_risk_churned' then s.status in ('at_risk', 'churned')
      else false
    end
    and (nullif(p_signal, '') is null or s.top_signals @> jsonb_build_array(jsonb_build_object('key', p_signal)))
    and (nullif(p_action, '') is null or s.recommended_action = p_action)
$$;

revoke execute on function public.churn_campaign_audience(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.churn_campaign_in_holdout(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.churn_campaign_destination(text, text) from public, anon, authenticated;

-- 4. Preview ---------------------------------------------------------------------

create or replace function public.admin_churn_campaign_preview(
  p_product text,
  p_country text default null,
  p_status text default 'attention',
  p_signal text default null,
  p_action text default null,
  p_holdout_pct integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct integer := least(greatest(coalesce(p_holdout_pct, 10), 0), 50);
  v_result jsonb;
begin
  if not public.admin_has_permission('churn.campaigns.send') then
    raise exception 'Sending churn campaigns is not available for this account.' using errcode = '42501';
  end if;
  if coalesce(p_status, 'attention') not in ('attention', 'at_risk', 'churned', 'at_risk_churned') then
    raise exception 'Unknown audience %', p_status using errcode = '22023';
  end if;
  if not exists (select 1 from public.churn_admin_scope('churn.campaigns.send') sc where sc.product = p_product) then
    raise exception 'This sector is not in your campaign access.' using errcode = '42501';
  end if;

  with audience as (
    select * from public.churn_campaign_audience(p_product, p_country, p_status, p_signal, p_action)
  ),
  eligible as (select * from audience where not recently_contacted)
  select jsonb_build_object(
    'matching', (select count(*) from audience),
    'recentlyContacted', (select count(*) from audience where recently_contacted),
    'eligible', (select count(*) from eligible),
    'holdoutPct', v_pct,
    'holdoutEstimate', round((select count(*) from eligible) * v_pct / 100.0),
    'targetEstimate', (select count(*) from eligible) - round((select count(*) from eligible) * v_pct / 100.0),
    'reachableByPush', (select count(*) from eligible e where public.push_campaign_recipient_allows(e.user_id, 'marketing')),
    'cap', 5000,
    'languages', coalesce((select jsonb_agg(jsonb_build_object('locale', locale, 'users', n) order by n desc)
      from (select locale, count(*) as n from eligible group by locale) l), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('iso', coalesce(country_iso, '??'), 'name', kc.name, 'users', n) order by n desc)
      from (select country_iso, count(*) as n from eligible group by country_iso) c
      left join public.kunthai_countries kc on kc.iso2 = c.country_iso), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_campaign_preview(text, text, text, text, text, integer) from public, anon;
grant execute on function public.admin_churn_campaign_preview(text, text, text, text, text, integer) to authenticated;

-- 5. Send ------------------------------------------------------------------------

create or replace function public.admin_churn_campaign_send(
  p_product text,
  p_country text,
  p_status text,
  p_signal text,
  p_action text,
  p_holdout_pct integer,
  p_messages jsonb,
  p_name text default null,
  p_message_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pct integer := least(greatest(coalesce(p_holdout_pct, 10), 0), 50);
  v_country text := nullif(upper(trim(coalesce(p_country, ''))), '');
  v_status text := coalesce(nullif(p_status, ''), 'attention');
  -- The message chosen (template and where it opens); p_action only narrows the audience.
  v_message_action text := coalesce(nullif(p_message_action, ''), nullif(p_action, ''));
  v_dest jsonb;
  v_en jsonb := p_messages -> 'en';
  v_campaign uuid := gen_random_uuid();
  v_notification_campaign uuid := gen_random_uuid();
  v_label text;
  v_name text;
  v_eligible integer;
  v_skipped integer;
  v_target integer;
  v_holdout integer;
  v_sent integer;
  v_key text;
begin
  if not public.admin_has_permission('churn.campaigns.send') then
    raise exception 'Sending churn campaigns is not available for this account.' using errcode = '42501';
  end if;
  if v_status not in ('attention', 'at_risk', 'churned', 'at_risk_churned') then
    raise exception 'Unknown audience %', v_status using errcode = '22023';
  end if;
  if not exists (select 1 from public.churn_admin_scope('churn.campaigns.send') sc where sc.product = p_product) then
    raise exception 'This sector is not in your campaign access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_messages) is distinct from 'object'
     or length(trim(coalesce(v_en ->> 'title', ''))) = 0
     or length(trim(coalesce(v_en ->> 'body', ''))) = 0 then
    raise exception 'An English title and message are required.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_messages) loop
    if v_key !~ '^[a-z]{2}$' then
      raise exception 'Unknown language %', v_key using errcode = '22023';
    end if;
    if length(coalesce(p_messages -> v_key ->> 'title', '')) > 100
       or length(coalesce(p_messages -> v_key ->> 'body', '')) > 300
       or length(coalesce(p_messages -> v_key ->> 'cta', '')) > 40 then
      raise exception 'The % message is too long (title 100, message 300, button 40 characters).', v_key using errcode = '22023';
    end if;
  end loop;

  v_dest := public.churn_campaign_destination(p_product, v_message_action);
  select label into v_label from public.churn_product_settings where product = p_product;
  v_name := left(coalesce(nullif(trim(coalesce(p_name, '')), ''),
    'Churn · ' || v_label || ' · ' || coalesce(v_message_action, v_status) || ' · ' || to_char(now(), 'YYYY-MM-DD')), 120);

  perform pg_advisory_xact_lock(hashtext('public.admin_churn_campaign_send'));

  drop table if exists pg_temp.churn_send_audience;
  create temp table churn_send_audience on commit drop as
  select * from public.churn_campaign_audience(p_product, v_country, v_status, p_signal, p_action);

  select count(*) filter (where not recently_contacted), count(*) filter (where recently_contacted)
  into v_eligible, v_skipped
  from churn_send_audience;

  if v_eligible = 0 then
    raise exception 'No one to send to with these filters.' using errcode = '22023';
  end if;
  if v_eligible > 5000 then
    raise exception 'This would reach % people. Narrow it to 5,000 or fewer (a country, a signal or an action).', v_eligible using errcode = '22023';
  end if;

  insert into public.admin_notification_campaigns (
    id, title, body, sector, audience_type, audience_filter, priority, status, created_by, approved_by, approved_at,
    sent_at, channels, presentation, category, action_target, action_data, campaign_name, configuration,
    published_by, published_at, estimated_audience, delivery_count
  ) values (
    v_notification_campaign, left(v_en ->> 'title', 100), left(v_en ->> 'body', 300), v_dest ->> 'sector',
    'specific_users', jsonb_build_object('source', 'churn', 'churnCampaignId', v_campaign, 'product', p_product, 'country', v_country),
    'normal', 'sending', auth.uid(), auth.uid(), now(), now(), array['in_app', 'push'], 'inbox', 'marketing',
    v_dest ->> 'screen', jsonb_build_object('actionLabel', coalesce(nullif(v_en ->> 'cta', ''), 'Open')), v_name,
    jsonb_build_object(
      'source', 'churn', 'churnCampaignId', v_campaign, 'inbox', v_dest ->> 'inbox',
      'media', jsonb_build_object('url', '', 'kind', 'none'),
      'action', jsonb_build_object('type', 'screen', 'label', coalesce(nullif(v_en ->> 'cta', ''), 'Open'),
        'screen', v_dest ->> 'screen', 'actionTarget', v_dest ->> 'screen', 'entityKind', 'urmall:product', 'entityId', '',
        'url', '', 'secondaryLabel', '', 'actionData', jsonb_build_object('actionLabel', coalesce(nullif(v_en ->> 'cta', ''), 'Open')))
    ),
    auth.uid(), now(), 0, 0
  );

  insert into public.churn_campaigns (
    id, notification_campaign_id, name, product, country_iso, audience, action_key, holdout_pct, messages, created_by, sent_at
  ) values (
    v_campaign, v_notification_campaign, v_name, p_product, v_country,
    jsonb_build_object('status', v_status, 'signal', nullif(p_signal, ''), 'action', nullif(p_action, '')),
    v_message_action, v_pct, p_messages, auth.uid(), now()
  );

  insert into public.churn_campaign_members (campaign_id, user_id, grp, country_iso, locale, score, status, segment)
  select v_campaign, a.user_id,
    case when public.churn_campaign_in_holdout(v_campaign, a.user_id, v_pct) then 'holdout' else 'target' end,
    a.country_iso,
    case when p_messages ? a.locale and length(trim(coalesce(p_messages -> a.locale ->> 'title', ''))) > 0 then a.locale else 'en' end,
    a.score, a.status, a.segment
  from churn_send_audience a
  where not a.recently_contacted;

  select count(*) filter (where grp = 'target'), count(*) filter (where grp = 'holdout')
  into v_target, v_holdout
  from public.churn_campaign_members where campaign_id = v_campaign;

  insert into public.platform_notifications (
    user_id, campaign_id, sector, notification_type, title, body, priority, category, workspace,
    action_target, action_data, channels, presentation, display_config, dedupe_key
  )
  select m.user_id, v_notification_campaign, v_dest ->> 'sector', 'admin_message',
    left(p_messages -> m.locale ->> 'title', 100), left(p_messages -> m.locale ->> 'body', 300), 'normal', 'marketing',
    v_dest ->> 'sector', v_dest ->> 'screen',
    jsonb_build_object('actionLabel', coalesce(nullif(p_messages -> m.locale ->> 'cta', ''), nullif(v_en ->> 'cta', ''), 'Open')),
    array['in_app', 'push'], 'inbox',
    jsonb_build_object(
      'source', 'churn', 'churnCampaignId', v_campaign, 'inbox', v_dest ->> 'inbox',
      'media', jsonb_build_object('url', '', 'kind', 'none'),
      'action', jsonb_build_object('type', 'screen',
        'label', coalesce(nullif(p_messages -> m.locale ->> 'cta', ''), nullif(v_en ->> 'cta', ''), 'Open'),
        'screen', v_dest ->> 'screen', 'actionTarget', v_dest ->> 'screen', 'entityKind', 'urmall:product', 'entityId', '',
        'url', '', 'secondaryLabel', '',
        'actionData', jsonb_build_object('actionLabel', coalesce(nullif(p_messages -> m.locale ->> 'cta', ''), nullif(v_en ->> 'cta', ''), 'Open')))
    ),
    'campaign:' || v_notification_campaign::text
  from public.churn_campaign_members m
  where m.campaign_id = v_campaign and m.grp = 'target'
  on conflict (campaign_id, user_id) where campaign_id is not null do nothing;
  get diagnostics v_sent = row_count;

  update public.churn_campaigns
  set target_count = v_target, holdout_count = v_holdout, skipped_recent = v_skipped
  where id = v_campaign;

  update public.admin_notification_campaigns
  set status = 'completed', estimated_audience = v_sent, delivery_count = v_sent, updated_at = now()
  where id = v_notification_campaign;

  perform public.admin_log_action(
    'churn.campaign.sent', v_dest ->> 'sector', 'churn_campaign', v_campaign, null, '', null,
    jsonb_build_object('product', p_product, 'country', v_country, 'audience', v_status, 'signal', p_signal, 'action', p_action, 'message', v_message_action,
                       'holdoutPct', v_pct, 'target', v_target, 'holdout', v_holdout, 'skippedRecent', v_skipped),
    jsonb_build_object('notificationCampaignId', v_notification_campaign, 'notificationsCreated', v_sent)
  );

  return jsonb_build_object(
    'campaignId', v_campaign, 'notificationCampaignId', v_notification_campaign, 'name', v_name,
    'target', v_target, 'holdout', v_holdout, 'skippedRecent', v_skipped, 'notificationsCreated', v_sent
  );
end;
$$;

revoke execute on function public.admin_churn_campaign_send(text, text, text, text, text, integer, jsonb, text, text) from public, anon;
grant execute on function public.admin_churn_campaign_send(text, text, text, text, text, integer, jsonb, text, text) to authenticated;

-- 6. Results ---------------------------------------------------------------------

create or replace function public.admin_churn_campaigns(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  if not public.admin_has_permission('churn.view') then
    raise exception 'Churn intelligence is not available for this account.' using errcode = '42501';
  end if;

  drop table if exists pg_temp.churn_campaign_scope;
  create temp table churn_campaign_scope on commit drop as select * from public.churn_admin_scope('churn.view');

  with campaigns as (
    select c.*
    from public.churn_campaigns c
    where exists (
      select 1 from churn_campaign_scope sc
      where sc.product = c.product and (sc.country_iso is null or (c.country_iso is not null and sc.country_iso = c.country_iso))
    )
    order by c.sent_at desc nulls last
    limit v_limit
  ),
  outcome as (
    select m.campaign_id, m.grp, m.user_id,
      exists (
        select 1 from public.churn_activity_daily a
        where a.user_id = m.user_id and a.product = c.product
          and (a.open_count > 0 or a.action_count > 0)
          and a.day > (c.sent_at at time zone 'utc')::date
          and a.day <= (c.sent_at at time zone 'utc')::date + c.window_days
      ) as recovered
    from public.churn_campaign_members m
    join campaigns c on c.id = m.campaign_id
  ),
  stats as (
    select campaign_id,
      count(*) filter (where grp = 'target') as target_n,
      count(*) filter (where grp = 'target' and recovered) as target_recovered,
      count(*) filter (where grp = 'holdout') as holdout_n,
      count(*) filter (where grp = 'holdout' and recovered) as holdout_recovered
    from outcome group by campaign_id
  ),
  delivery as (
    select c.id as campaign_id,
      count(pn.id) as delivered,
      count(pn.id) filter (where pn.read_at is not null or pn.clicked_at is not null or pn.actioned_at is not null or pn.seen_at is not null) as opened,
      count(pn.id) filter (where pn.clicked_at is not null or pn.actioned_at is not null or pn.cta_clicked_at is not null) as clicked,
      (select count(*) from public.push_outbox po
        where po.dedupe_key like 'campaign:' || c.notification_campaign_id::text || ':%' and po.sent_at is not null) as pushed
    from campaigns c
    left join public.platform_notifications pn on pn.campaign_id = c.notification_campaign_id
    group by c.id, c.notification_campaign_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'product', c.product, 'country', c.country_iso, 'audience', c.audience,
    'action', c.action_key, 'holdoutPct', c.holdout_pct, 'windowDays', c.window_days,
    'sentAt', c.sent_at, 'createdBy', coalesce(ep.display_name, u.email),
    'daysSinceSend', greatest(((now() at time zone 'utc')::date - (c.sent_at at time zone 'utc')::date), 0),
    'final', ((now() at time zone 'utc')::date - (c.sent_at at time zone 'utc')::date) >= c.window_days,
    'target', coalesce(st.target_n, 0), 'holdout', coalesce(st.holdout_n, 0), 'skippedRecent', c.skipped_recent,
    'delivered', coalesce(d.delivered, 0), 'pushed', coalesce(d.pushed, 0), 'opened', coalesce(d.opened, 0), 'clicked', coalesce(d.clicked, 0),
    'targetRecovered', coalesce(st.target_recovered, 0), 'holdoutRecovered', coalesce(st.holdout_recovered, 0),
    'targetRate', case when coalesce(st.target_n, 0) > 0 then round(st.target_recovered::numeric / st.target_n, 4) end,
    'holdoutRate', case when coalesce(st.holdout_n, 0) > 0 then round(st.holdout_recovered::numeric / st.holdout_n, 4) end,
    'liftPoints', case when coalesce(st.target_n, 0) > 0 and coalesce(st.holdout_n, 0) > 0
      then round((st.target_recovered::numeric / st.target_n - st.holdout_recovered::numeric / st.holdout_n) * 100, 1) end
  ) order by c.sent_at desc nulls last), '[]'::jsonb)
  into v_result
  from campaigns c
  left join stats st on st.campaign_id = c.id
  left join delivery d on d.campaign_id = c.id
  left join auth.users u on u.id = c.created_by
  left join public.explore_profiles ep on ep.user_id = c.created_by;

  return v_result;
end;
$$;

revoke execute on function public.admin_churn_campaigns(integer) from public, anon;
grant execute on function public.admin_churn_campaigns(integer) to authenticated;

-- 7. Access now also says whether this admin can send campaigns --------------------

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
    'canSendCampaigns', public.admin_has_permission('churn.campaigns.send'),
    'campaignProducts', coalesce((
      select jsonb_agg(distinct sc.product) from public.churn_admin_scope('churn.campaigns.send') sc
    ), '[]'::jsonb),
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
