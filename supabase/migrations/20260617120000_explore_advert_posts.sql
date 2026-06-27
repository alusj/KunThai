alter table public.explore_posts
  add column if not exists media_meta jsonb not null default '{}'::jsonb;

alter table public.explore_posts drop constraint if exists explore_posts_post_type_check;
alter table public.explore_posts
  add constraint explore_posts_post_type_check check (post_type in ('post', 'video', 'advert'));

alter table public.explore_posts drop constraint if exists explore_posts_category_check;
alter table public.explore_posts
  add constraint explore_posts_category_check check (category in ('urfeed', 'connections', 'swip', 'advert'));

create index if not exists explore_posts_adverts_created_at_idx
  on public.explore_posts (created_at desc)
  where post_type = 'advert' or category = 'advert';

create or replace function public.normalize_explore_swip_video_post()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_video boolean;
  is_advert boolean;
  requested_moderation_status text;
begin
  has_video := nullif(btrim(coalesce(new.video_url, '')), '') is not null;
  is_advert := new.post_type = 'advert'
    or new.category = 'advert'
    or coalesce(new.media_meta, '{}'::jsonb) ? 'advert';

  if has_video then
    requested_moderation_status := lower(btrim(coalesce(new.moderation_status, '')));

    if requested_moderation_status = 'blocked' then
      raise exception 'This video cannot be published because it violates KunThai safety rules';
    end if;

    if requested_moderation_status = 'approved' then
      new.moderation_status := 'approved';
    elsif tg_op = 'UPDATE'
      and new.video_url is not distinct from old.video_url
      and requested_moderation_status = 'legacy'
    then
      new.moderation_status := 'legacy';
    else
      new.moderation_status := 'pending';
    end if;

    if is_advert then
      new.feed_scope := case when new.feed_scope = 'connections' then 'connections' else 'feed' end;
      new.post_type := 'advert';
      new.category := 'advert';
    else
      new.feed_scope := 'swip';
      new.post_type := 'video';
      new.category := 'swip';
    end if;

    new.video_trim_start := greatest(0, coalesce(new.video_trim_start, 0));
    new.video_trim_end := least(
      new.video_trim_start + 15,
      greatest(new.video_trim_start + 0.5, coalesce(new.video_trim_end, new.video_trim_start + 15))
    );
  else
    new.moderation_status := 'not_required';
    new.video_trim_start := null;
    new.video_trim_end := null;

    if new.feed_scope = 'swip' then
      new.feed_scope := 'feed';
      new.post_type := 'post';
      new.category := 'urfeed';
    end if;
  end if;

  return new;
end;
$$;
