-- Explore notifications are kept as long as other KunThai notifications
-- (90 days) instead of being removed after 30. The app no longer hides them
-- after 10 days either. Platform notification retention is unchanged.
create or replace function public.cleanup_expired_user_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer := 0;
  affected integer := 0;
begin
  if to_regclass('public.explore_notifications') is not null then
    delete from public.explore_notifications where created_at < now() - interval '90 days';
    get diagnostics affected = row_count;
    removed := removed + affected;
  end if;

  delete from public.platform_notifications
  where (
      campaign_id is not null
      and created_at < now() - interval '365 days'
    )
    or (
      campaign_id is null
      and (
        (expires_at is not null and expires_at < now())
        or (
          expires_at is null
          and created_at < now() - case
            when category in ('payment','account','safety','security') then interval '365 days'
            else interval '90 days'
          end
        )
      )
    );
  get diagnostics affected = row_count;
  return removed + affected;
end;
$$;
