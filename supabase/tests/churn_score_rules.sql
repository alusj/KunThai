-- Churn intelligence: tests for public.churn_score_rules (20261106140000_churn_scores.sql).
-- Read-only: it only calls the pure rules function and rolls back.
-- Run against the linked project once the migration is applied:
--   supabase db query --linked -f supabase/tests/churn_score_rules.sql
-- A failure raises an exception naming the case. Success returns one row: ok = true.
begin;

create temp table churn_rule_cases (name text, product text, win integer, f jsonb, expect jsonb) on commit drop;

-- A healthy, reachable, long-standing user: the baseline the cases change.
insert into churn_rule_cases values
  ('healthy explore user is low risk', 'explore', 30,
    '{"days_inactive":1,"days_since_action":1,"days_since_open":1,"product_tenure_days":200,"active_days_14":8,"active_days_30":15,"prior_active_days_30":14,"push_enabled":true,"opens_tracking_days":60}',
    '{"status":"active","segment":"low","score":0,"action":null,"provisional":false}'),
  ('churned after the window', 'explore', 30,
    '{"days_inactive":30,"product_tenure_days":200,"push_enabled":true,"opens_tracking_days":60}',
    '{"status":"churned","segment":"churned","score":100,"action":"explore_comeback"}'),
  ('one day before the window is not churned', 'explore', 30,
    '{"days_inactive":29,"product_tenure_days":200,"push_enabled":true,"opens_tracking_days":60}',
    '{"status":"active","segment":"low","score":30,"signals_has":"inactive"}'),
  ('inactive past half the window, usage collapse, no push is at risk', 'urride_passenger', 60,
    '{"days_inactive":35,"days_since_action":35,"product_tenure_days":300,"active_days_30":0,"prior_active_days_30":6,"push_enabled":false,"opens_tracking_days":90}',
    '{"status":"at_risk","segment":"high","score":60,"action":"urride_saved_places_reminder","first_signal":"inactive"}'),
  ('usage drop needs at least 3 prior active days', 'explore', 30,
    '{"days_inactive":1,"product_tenure_days":200,"active_days_30":0,"prior_active_days_30":2,"push_enabled":true,"opens_tracking_days":60}',
    '{"score":0}'),
  ('usage drop fires at 60 percent down', 'explore', 30,
    '{"days_inactive":1,"product_tenure_days":200,"active_days_30":4,"prior_active_days_30":10,"push_enabled":true,"opens_tracking_days":60}',
    '{"score":25,"signals_has":"usage_drop"}'),
  ('usage drop does not fire at 50 percent down', 'explore', 30,
    '{"days_inactive":1,"product_tenure_days":200,"active_days_30":5,"prior_active_days_30":10,"push_enabled":true,"opens_tracking_days":60}',
    '{"score":0}'),
  ('spend halved', 'urmall_buyer', 60,
    '{"days_inactive":2,"product_tenure_days":200,"spend_30":50,"prior_spend_30":100,"push_enabled":true,"opens_tracking_days":90}',
    '{"score":15,"signals_has":"spend_drop"}'),
  ('habit stopped', 'urmall_buyer', 60,
    '{"days_inactive":20,"product_tenure_days":200,"habit_weeks_prior":5,"active_days_14":0,"push_enabled":true,"opens_tracking_days":90}',
    '{"score":15,"signals_has":"habit_stopped"}'),
  ('opens only fires once opens cover half the window', 'urmall_buyer', 60,
    '{"days_inactive":1,"days_since_open":1,"days_since_action":40,"product_tenure_days":200,"push_enabled":true,"opens_tracking_days":30}',
    '{"score":20,"signals_has":"opens_only","provisional":true}'),
  ('opens only waits while open data is too young', 'urmall_buyer', 60,
    '{"days_inactive":1,"days_since_open":1,"days_since_action":40,"product_tenure_days":200,"push_enabled":true,"opens_tracking_days":10}',
    '{"score":0,"provisional":true}'),
  ('opens only never applies to Explore', 'explore', 30,
    '{"days_inactive":1,"days_since_open":1,"days_since_action":40,"product_tenure_days":200,"push_enabled":true,"opens_tracking_days":60}',
    '{"score":0}'),
  ('seller with unanswered customers gets the nudge', 'urmall_seller', 30,
    '{"days_inactive":20,"product_tenure_days":200,"unanswered_48h":3,"complaints_30":1,"bad_experiences_30":1,"push_enabled":true,"opens_tracking_days":60}',
    '{"status":"at_risk","score":65,"action":"urmall_unanswered_nudge","first_signal":"inactive"}'),
  ('unanswered customers only count for sellers', 'urmall_buyer', 60,
    '{"days_inactive":1,"product_tenure_days":200,"unanswered_48h":3,"push_enabled":true,"opens_tracking_days":90}',
    '{"score":0}'),
  ('new users are new, not churned or at risk', 'swip', 30,
    '{"days_inactive":20,"product_tenure_days":20,"active_days_30":2,"push_enabled":false,"opens_tracking_days":5}',
    '{"status":"new","segment":"new","score":35,"action":null,"provisional":true}'),
  ('a new user past the window is churned', 'swip', 30,
    '{"days_inactive":30,"product_tenure_days":29,"push_enabled":true,"opens_tracking_days":60}',
    '{"status":"churned"}'),
  ('score is capped at 100', 'urmall_seller', 30,
    '{"days_inactive":20,"days_since_open":1,"days_since_action":20,"product_tenure_days":200,"active_days_14":0,"active_days_30":0,"prior_active_days_30":10,"habit_weeks_prior":6,"spend_30":0,"prior_spend_30":10,"unanswered_48h":2,"complaints_30":2,"bad_experiences_30":2,"push_enabled":false,"opens_tracking_days":60}',
    '{"status":"at_risk","score":100}'),
  ('missing features count as never active', 'credits', 60,
    '{}',
    '{"status":"churned","score":100,"action":"credits_boost_reminder","provisional":false}'),
  ('plan in grace is at risk with the grace reminder', 'business_plan', 30,
    '{"plan_status":"grace","days_to_renewal":-2,"auto_renew":true,"product_tenure_days":200,"push_enabled":true}',
    '{"status":"at_risk","segment":"high","score":60,"action":"plan_grace_reminder"}'),
  ('auto-renew off and ending soon, with a downgrade', 'business_plan', 30,
    '{"plan_status":"active","days_to_renewal":5,"auto_renew":false,"downgrade_pending":true,"product_tenure_days":200,"push_enabled":true}',
    '{"status":"at_risk","segment":"high","score":60,"action":"plan_renewal_reminder"}'),
  ('expired or free plan is churned', 'business_plan', 30,
    '{"plan_status":"free","days_to_renewal":-40,"product_tenure_days":200,"push_enabled":true}',
    '{"status":"churned","provisional":false}'),
  ('plan inactivity is not a signal', 'business_plan', 30,
    '{"plan_status":"active","days_to_renewal":20,"auto_renew":true,"days_inactive":300,"product_tenure_days":200,"push_enabled":true}',
    '{"status":"active","score":0}');

do $$
declare
  c record;
  r jsonb;
  k text;
begin
  for c in select * from churn_rule_cases loop
    r := public.churn_score_rules(c.product, c.win, c.f);
    for k in select jsonb_object_keys(c.expect) loop
      if k = 'signals_has' then
        if not exists (select 1 from jsonb_array_elements(r->'signals') s where s->>'key' = c.expect->>k) then
          raise exception 'FAIL [%]: expected signal %, got %', c.name, c.expect->>k, r->'signals';
        end if;
      elsif k = 'first_signal' then
        if (r->'signals'->0->>'key') is distinct from (c.expect->>k) then
          raise exception 'FAIL [%]: expected first signal %, got %', c.name, c.expect->>k, r->'signals';
        end if;
      elsif (r->k) is distinct from (c.expect->k) then
        raise exception 'FAIL [%]: % expected %, got % (full result %)', c.name, k, c.expect->k, r->k, r;
      end if;
    end loop;
  end loop;
end $$;

select true as ok, count(*) as cases from churn_rule_cases;
rollback;
