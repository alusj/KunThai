-- Promotion pricing rules requested on 2026-08-27.
--
-- UrMall: a new five-credit listing promotion lasts exactly one day. Higher
-- budgets keep their existing duration calculation.
-- Explore: adverts start at ten credits. A campaign below fifteen credits can
-- contain one media type only; image + video / UrFeed + Swip starts at fifteen.

create or replace function public.enforce_marketplace_visibility_promotion_duration()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  credit_amount integer := greatest(0, coalesce(new.credit_budget, new.budget_limit, 0));
  start_time timestamptz := coalesce(new.starts_at, timezone('utc', now()));
begin
  if credit_amount = 5
     and coalesce(new.metadata ->> 'source', '') = 'visibility_credits'
  then
    new.starts_at := start_time;
    new.ends_at := start_time + interval '1 day';
    new.metadata := jsonb_set(coalesce(new.metadata, '{}'::jsonb), '{durationDays}', '1'::jsonb, true);
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_visibility_promotion_duration_guard on public.marketplace_promotions;
create trigger marketplace_visibility_promotion_duration_guard
before insert or update of credit_budget, budget_limit, starts_at, ends_at, metadata
on public.marketplace_promotions
for each row execute function public.enforce_marketplace_visibility_promotion_duration();

create or replace function public.enforce_explore_ad_visibility_media_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  credit_amount integer := greatest(0, coalesce(new.credit_budget, floor(coalesce(new.budget_amount, 0))::integer, 0));
  creative public.explore_posts;
  has_image boolean;
  has_video boolean;
begin
  if credit_amount < 10 then
    raise exception 'Choose at least 10 Visibility Credits for an Explore advert.';
  end if;

  select * into creative from public.explore_posts where id = new.creative_post_id;
  if creative.id is null then
    raise exception 'Explore advert creative was not found.';
  end if;

  has_image := nullif(btrim(coalesce(creative.image_url, '')), '') is not null;
  has_video := nullif(btrim(coalesce(creative.video_url, '')), '') is not null;

  if credit_amount < 15 and (lower(coalesce(new.placement, 'urfeed')) = 'both' or (has_image and has_video)) then
    raise exception 'Image and video together require at least 15 Visibility Credits. With 10 to 14 credits, choose one media type.';
  end if;

  return new;
end;
$$;

drop trigger if exists explore_ad_visibility_media_guard on public.explore_ad_campaigns;
create trigger explore_ad_visibility_media_guard
before insert or update of creative_post_id, placement, credit_budget, budget_amount
on public.explore_ad_campaigns
for each row execute function public.enforce_explore_ad_visibility_media_rules();

revoke all on function public.enforce_marketplace_visibility_promotion_duration() from public, anon, authenticated;
revoke all on function public.enforce_explore_ad_visibility_media_rules() from public, anon, authenticated;
