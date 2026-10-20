-- UrMall Free restaurants: every meal can be served every day (2026-10-20).
--
-- 20261013100000 removed Free's weekday limit, but 20261010100000 (which sets
-- meal_day_limit = 5 on Free) was run on the live database after it, so Free
-- sellers were again limited to meals on 5 days a week and the plan screen
-- said so. This puts back the 20261013100000 Free row: the limit on Free is
-- the 5 active listings (every meal counts, shown or hidden), and each meal
-- can be served every day or on any days the owner picks.
-- meal_day_limit = null turns kunthai_guard_urmall_meal_days off for Free, as
-- for Pro and Premium. Re-runnable.

update public.kunthai_business_plans
set meal_day_limit = null,
    features = '["5 active products, meals or properties","Restaurant meals all 7 days","Seller dashboard","Customer messages","Store analytics"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'free';
