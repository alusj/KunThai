-- Churn campaigns: checks for the helpers in 20261106161000_churn_campaigns.sql.
-- Read-only (pure functions, rolled back). Run against the linked project:
--   supabase db query --linked -f supabase/tests/churn_campaign_checks.sql
-- A failure raises an exception naming the check. Success returns ok = true.
begin;

do $$
declare
  v_campaign uuid := '00000000-0000-4000-8000-000000000001';
  v_share numeric;
  v_again integer;
begin
  -- About 10% land in a 10% holdout (10,000 synthetic people), and the split is stable.
  select avg(case when public.churn_campaign_in_holdout(v_campaign, gen.id, 10) then 1 else 0 end)
  into v_share
  from (select md5(i::text)::uuid as id from generate_series(1, 10000) i) gen;
  if v_share < 0.085 or v_share > 0.115 then
    raise exception 'FAIL holdout share %', v_share;
  end if;

  select count(*) into v_again
  from (select md5(i::text)::uuid as id from generate_series(1, 500) i) gen
  where public.churn_campaign_in_holdout(v_campaign, gen.id, 10)
     <> public.churn_campaign_in_holdout(v_campaign, gen.id, 10);
  if v_again <> 0 then
    raise exception 'FAIL holdout is not deterministic';
  end if;

  if public.churn_campaign_in_holdout(v_campaign, gen_random_uuid(), 0) then
    raise exception 'FAIL a 0%% holdout held someone back';
  end if;

  -- Every sector has a destination that matches the app's campaign screens.
  if exists (
    select 1 from public.churn_product_settings s
    where public.churn_campaign_destination(s.product, null) is null
       or public.churn_campaign_destination(s.product, null) ->> 'sector' not in ('explore', 'marketplace', 'transport', 'platform')
  ) then
    raise exception 'FAIL a sector has no campaign destination';
  end if;
  if public.churn_campaign_destination('urmall_seller', 'urmall_unanswered_nudge') ->> 'screen' <> 'urmall:business-messages' then
    raise exception 'FAIL the unanswered nudge should open seller messages';
  end if;
  if public.churn_campaign_destination('swip', null) ->> 'screen' <> 'explore:swip-tab' then
    raise exception 'FAIL Swip campaigns should open the Swip tab';
  end if;
end $$;

select true as ok;
rollback;
