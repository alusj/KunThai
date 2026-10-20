-- UrMall Free plan wording (2026-10-20): "Restaurant meals all 7 days" did not
-- say that a Free restaurant's meals (at most 5, the Free listings) can each
-- be shown every day. The Free line now says exactly that; the rule itself is
-- unchanged (meal_day_limit stays null, 20261020180000). Pro and Premium keep
-- "Restaurant meals all 7 days". Re-runnable.

update public.kunthai_business_plans
set features = '["5 active products, meals or properties","Every meal can be shown all 7 days","Seller dashboard","Customer messages","Store analytics"]'::jsonb,
    updated_at = timezone('utc', now())
where surface = 'urmall' and plan_code = 'free';
