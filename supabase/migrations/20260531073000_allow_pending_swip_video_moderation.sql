alter table public.explore_posts drop constraint if exists explore_posts_moderation_status_check;
alter table public.explore_posts
  add constraint explore_posts_moderation_status_check check (moderation_status in ('not_required', 'approved', 'pending', 'blocked', 'legacy'));

create or replace function public.normalize_explore_swip_video_post()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_video boolean;
  requested_moderation_status text;
begin
  has_video := nullif(btrim(coalesce(new.video_url, '')), '') is not null;

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

    new.feed_scope := 'swip';
    new.post_type := 'video';
    new.category := 'swip';
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

comment on column public.explore_posts.moderation_status is
'approved marks completed review; pending allows publication while review is unavailable or incomplete; blocked is rejected for new Swip video writes; legacy marks videos published before pending review support.';
