-- Explore advertising lifecycle: tell the advertiser when the campaign will end,
-- and actually convert the advert into a normal post when its duration is up.
--
-- Two pieces:
--   1. On creation, a persistent notification confirms the boost and states the
--      date the advert will convert back to a normal post.
--   2. A pg_cron worker ends campaigns whose ends_at has passed and rewrites the
--      creative into an ordinary post (Swip for videos, UrFeed otherwise). It
--      strips the `advert` marker from media_meta in the SAME update so the
--      explore_force_advert_public BEFORE-UPDATE trigger does not force it back
--      to an advert, and it preserves the advert headline as the post title.

-- 1. Creation notice -----------------------------------------------------------
create or replace function public.notify_explore_advert_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Best-effort: a notification failure must never block the boost that already
  -- succeeded (the campaign row and credit spend are committed by the caller).
  begin
    insert into public.platform_notifications (
      user_id, sector, notification_type, title, body, priority, status, action_target
    ) values (
      new.advertiser_id,
      'explore',
      'explore_advert_created',
      'Advertisement created',
      format(
        'Your advertisement was successfully created and will convert to a normal post on %s.',
        to_char(new.ends_at, 'FMMonth FMDD, YYYY')
      ),
      'normal',
      'unread',
      new.creative_post_id::text
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists explore_advert_created_notify on public.explore_ad_campaigns;
create trigger explore_advert_created_notify
after insert on public.explore_ad_campaigns
for each row execute function public.notify_explore_advert_created();

-- 2. Expiry -> normal post -----------------------------------------------------
create or replace function public.convert_expired_explore_adverts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  for v_row in
    select c.id as campaign_id, c.creative_post_id, c.advertiser_id
    from public.explore_ad_campaigns c
    join public.explore_posts p on p.id = c.creative_post_id
    where c.status = 'active'
      and c.ends_at <= timezone('utc', now())
  loop
    update public.explore_ad_campaigns
    set status = 'ended', updated_at = timezone('utc', now())
    where id = v_row.campaign_id;

    -- Rewrite the creative into an ordinary post. Removing the `advert` key and
    -- clearing the advert post_type/category in one statement keeps the
    -- force-advert-public trigger from reverting the change. A video creative
    -- becomes a Swip; anything else becomes an UrFeed post, mirroring how the
    -- composer classifies fresh posts.
    update public.explore_posts
    set
      post_type = case when nullif(btrim(coalesce(video_url, '')), '') is not null then 'video' else 'post' end,
      category = case when nullif(btrim(coalesce(video_url, '')), '') is not null then 'swip' else 'urfeed' end,
      media_meta = (coalesce(media_meta, '{}'::jsonb) - 'advert')
        || case
             when nullif(btrim(coalesce(media_meta -> 'advert' ->> 'title', '')), '') is not null
               then jsonb_build_object('title', media_meta -> 'advert' ->> 'title')
             else '{}'::jsonb
           end
    where id = v_row.creative_post_id;

    begin
      insert into public.platform_notifications (
        user_id, sector, notification_type, title, body, priority, status, action_target
      ) values (
        v_row.advertiser_id,
        'explore',
        'explore_advert_converted',
        'Advertisement ended',
        'Your advertisement campaign has ended and is now a normal post on Explore.',
        'normal',
        'unread',
        v_row.creative_post_id::text
      );
    exception when others then
      null;
    end;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.convert_expired_explore_adverts() from public, anon, authenticated;

-- Run the conversion every 15 minutes so expiry is honoured close to the chosen
-- time without a heavy per-request check.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'kunthai-explore-advert-expiry',
  '*/15 * * * *',
  'select public.convert_expired_explore_adverts()'
);

-- Convert anything already past due at deploy time.
select public.convert_expired_explore_adverts();
