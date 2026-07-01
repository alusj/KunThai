-- Notify affected users when an administrator makes a material account,
-- verification, form, or content decision.
create or replace function public.notify_user_of_admin_case_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  notification_title text;
  notification_body text;
  source jsonb := coalesce(new.metadata -> 'source', '{}'::jsonb);
begin
  if new.resolution_code is null
     or new.resolution_code is not distinct from old.resolution_code
     or new.resolution_code not in ('approve', 'reject', 'remove', 'restrict', 'suspend') then
    return new;
  end if;

  target_user := new.subject_user_id;

  if new.resource_type = 'explore_post_report'
     and to_regclass('public.explore_post_reports') is not null
     and to_regclass('public.explore_posts') is not null then
    select post.user_id into target_user
    from public.explore_post_reports report
    join public.explore_posts post on post.id = report.post_id
    where report.id = new.resource_id;
  elsif new.resource_type = 'explore_comment_report'
     and to_regclass('public.explore_comment_reports') is not null
     and to_regclass('public.explore_post_comments') is not null then
    select comment.user_id into target_user
    from public.explore_comment_reports report
    join public.explore_post_comments comment on comment.id = report.comment_id
    where report.id = new.resource_id;
  elsif new.resource_type = 'explore_post'
     and to_regclass('public.explore_posts') is not null then
    select post.user_id into target_user from public.explore_posts post where post.id = new.resource_id;
  end if;

  if target_user is null and new.queue = 'verification' then
    target_user := new.reporter_user_id;
  end if;
  if target_user is null then
    target_user := nullif(coalesce(source ->> 'operator_user_id', source ->> 'owner_user_id', source ->> 'user_id'), '')::uuid;
  end if;
  if target_user is null then return new; end if;

  notification_title := case new.resolution_code
    when 'approve' then 'Verification approved'
    when 'reject' then 'Verification not approved'
    when 'remove' then 'Content removed by KunThai'
    when 'restrict' then 'Account restriction applied'
    when 'suspend' then 'Account suspended'
  end;
  notification_body := coalesce(nullif(new.resolution_note, ''),
    case new.resolution_code
      when 'approve' then 'KunThai approved your submitted information.'
      when 'reject' then 'KunThai could not approve your submitted information.'
      when 'remove' then 'KunThai removed content after an administrative review.'
      when 'restrict' then 'KunThai applied a restriction after an administrative review.'
      when 'suspend' then 'KunThai suspended this account after an administrative review.'
    end
  );

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, action_target
  ) values (
    target_user,
    coalesce(new.sector, 'platform'),
    case when new.resolution_code = 'approve' then 'verification_approved' else 'moderation_action' end,
    notification_title,
    notification_body,
    case when new.resolution_code in ('remove', 'restrict', 'suspend') then 'high' else 'normal' end,
    'admin-case:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists notify_user_of_admin_case_decision_trigger on public.admin_cases;
create trigger notify_user_of_admin_case_decision_trigger
after update of resolution_code on public.admin_cases
for each row execute function public.notify_user_of_admin_case_decision();

create or replace function public.notify_user_of_account_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  if new.status = 'active' and tg_op = 'INSERT' then return new; end if;

  notification_title := case new.status
    when 'active' then 'Account access restored'
    when 'warned' then 'Account warning'
    when 'restricted' then 'Account restriction applied'
    when 'suspended' then 'Account suspended'
    when 'banned' then 'Account access removed'
    else 'Account status updated'
  end;

  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, action_target
  ) values (
    new.user_id,
    'platform',
    'moderation_action',
    notification_title,
    coalesce(nullif(new.reason, ''), 'KunThai updated the administrative status of your account.'),
    case when new.status in ('restricted', 'suspended', 'banned') then 'high' else 'normal' end,
    'account-status'
  );
  return new;
end;
$$;

drop trigger if exists notify_user_of_account_control_trigger on public.platform_account_controls;
create trigger notify_user_of_account_control_trigger
after insert or update of status on public.platform_account_controls
for each row execute function public.notify_user_of_account_control();

-- Notifications are retained for ten days across both social and platform
-- sources. The insert trigger is a fallback; pg_cron performs daily cleanup.
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
    delete from public.explore_notifications where created_at < now() - interval '10 days';
    get diagnostics affected = row_count;
    removed := removed + affected;
  end if;
  delete from public.platform_notifications where created_at < now() - interval '10 days';
  get diagnostics affected = row_count;
  return removed + affected;
end;
$$;

create or replace function public.cleanup_expired_user_notifications_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.cleanup_expired_user_notifications();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.explore_notifications') is not null then
    drop trigger if exists cleanup_expired_explore_notifications_trigger on public.explore_notifications;
    create trigger cleanup_expired_explore_notifications_trigger
      after insert on public.explore_notifications
      for each statement execute function public.cleanup_expired_user_notifications_on_insert();
  end if;
end;
$$;

drop trigger if exists cleanup_expired_platform_notifications_trigger on public.platform_notifications;
create trigger cleanup_expired_platform_notifications_trigger
after insert on public.platform_notifications
for each statement execute function public.cleanup_expired_user_notifications_on_insert();

select public.cleanup_expired_user_notifications();

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'kuntai-notification-ten-day-retention',
  '20 3 * * *',
  'select public.cleanup_expired_user_notifications()'
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'platform_notifications'
     ) then
    alter publication supabase_realtime add table public.platform_notifications;
  end if;
end;
$$;
