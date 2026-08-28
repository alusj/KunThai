-- Make UrMall promotion windows proportional and restore the five-credit
-- UrFeed starter without weakening Swip or dual-media requirements.
--
-- UrMall pricing (new campaigns only):
--   5 credits  = 1 day
--   10 credits = 2.5 days
--   15 credits = 4 days
--   20 credits = 5.5 days
-- Each additional credit after the first five adds 0.3 day, capped at 30 days.

create or replace function public.enforce_marketplace_visibility_promotion_duration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  credit_amount integer := greatest(0, coalesce(new.credit_budget, new.budget_limit, 0));
  start_time timestamptz := coalesce(new.starts_at, timezone('utc', now()));
  duration_days numeric;
begin
  if credit_amount < 5
     or coalesce(new.metadata ->> 'source', '') <> 'visibility_credits'
  then
    return new;
  end if;

  -- Existing campaigns keep the window under which they were purchased. Only
  -- campaigns created under this pricing version are recalculated on update.
  if tg_op = 'UPDATE'
     and coalesce(old.metadata ->> 'pricingVersion', '') <> 'fair_v2'
  then
    return new;
  end if;

  duration_days := least(
    30::numeric,
    1::numeric + greatest(0, credit_amount - 5)::numeric * 0.3
  );

  new.starts_at := start_time;
  new.ends_at := start_time + duration_days * interval '1 day';
  new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{durationDays}', to_jsonb(duration_days), true);
  new.metadata := jsonb_set(new.metadata, '{pricingVersion}', '"fair_v2"'::jsonb, true);
  return new;
end;
$$;

create or replace function public.enforce_explore_ad_visibility_media_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  credit_amount integer := greatest(0, coalesce(new.credit_budget, floor(coalesce(new.budget_amount, 0))::integer, 0));
  minimum_credit integer;
  creative public.explore_posts;
  has_image boolean;
  has_video boolean;
begin
  minimum_credit := case lower(coalesce(new.placement, 'urfeed'))
    when 'both' then 15
    when 'swip' then 10
    else 5
  end;

  if credit_amount < minimum_credit then
    raise exception '% placement requires at least % Visibility Credits.',
      case lower(coalesce(new.placement, 'urfeed'))
        when 'both' then 'UrFeed & Swip'
        when 'swip' then 'Swip'
        else 'UrFeed'
      end,
      minimum_credit;
  end if;

  select * into creative from public.explore_posts where id = new.creative_post_id;
  if creative.id is null then
    raise exception 'Explore advert creative was not found.';
  end if;

  has_image := nullif(btrim(coalesce(creative.image_url, '')), '') is not null;
  has_video := nullif(btrim(coalesce(creative.video_url, '')), '') is not null;

  if credit_amount < 15
     and (lower(coalesce(new.placement, 'urfeed')) = 'both' or (has_image and has_video))
  then
    raise exception 'Image and video together require at least 15 Visibility Credits. Choose one placement for a smaller campaign.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_marketplace_visibility_promotion_duration() from public, anon, authenticated;
revoke all on function public.enforce_explore_ad_visibility_media_rules() from public, anon, authenticated;
