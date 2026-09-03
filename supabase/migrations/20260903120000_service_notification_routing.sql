-- Keep each service's notifications in that service's bell. UrMall business
-- admin lifecycle updates used to be written as Explore notifications; they
-- now use the shared platform inbox with an explicit marketplace sector and a
-- direct Admin roles destination.

create or replace function public.notify_urmall_business_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  recipient_id uuid;
  notice_type text;
  notice_title text;
  notice_body text;
  notice_target text;
  notice_key text;
begin
  if tg_op = 'INSERT' then
    recipient_id := new.user_id;
    notice_type := 'urmall_admin_invite';
    notice_title := 'UrMall admin invitation';
    notice_body := coalesce(nullif(new.business_name, ''), 'An UrMall business')
      || ' invited you to become a business admin.';
    notice_target := 'urmall:admin-roles';
    notice_key := 'urmall-admin-invite:' || new.id::text;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    recipient_id := new.invited_by;
    notice_type := 'urmall_admin_response';
    notice_title := 'UrMall admin invitation updated';
    notice_body := coalesce(nullif(new.admin_name, ''), 'A KunThai member')
      || case when new.status = 'accepted' then ' accepted' else ' declined' end
      || ' the admin invitation for '
      || coalesce(nullif(new.business_name, ''), 'your UrMall business') || '.';
    notice_target := 'urmall:business';
    notice_key := 'urmall-admin-response:' || new.id::text || ':' || new.status;
  elsif tg_op = 'UPDATE' and new.responsibilities is distinct from old.responsibilities then
    recipient_id := new.user_id;
    notice_type := 'urmall_admin_responsibilities';
    notice_title := 'UrMall admin access updated';
    notice_body := coalesce(nullif(new.business_name, ''), 'An UrMall business')
      || ' updated your admin responsibilities.';
    notice_target := 'urmall:admin-roles';
    notice_key := 'urmall-admin-responsibilities:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text;
  elsif tg_op = 'DELETE' then
    if auth.uid() = old.user_id then
      recipient_id := old.invited_by;
      notice_type := 'urmall_admin_left';
      notice_title := 'An UrMall admin left';
      notice_body := coalesce(nullif(old.admin_name, ''), 'A KunThai member')
        || ' left the admin role at '
        || coalesce(nullif(old.business_name, ''), 'your UrMall business') || '.';
      notice_target := 'urmall:business';
    else
      recipient_id := old.user_id;
      notice_type := 'urmall_admin_removed';
      notice_title := 'UrMall admin access removed';
      notice_body := 'Your admin access to '
        || coalesce(nullif(old.business_name, ''), 'an UrMall business')
        || ' was removed.';
      notice_target := 'urmall:admin-roles';
    end if;
    notice_key := 'urmall-admin-removed:' || old.id::text || ':' || extract(epoch from now())::bigint::text;
  else
    return coalesce(new, old);
  end if;

  if recipient_id is not null then
    insert into public.platform_notifications (
      user_id, sector, notification_type, title, body, priority, status,
      category, workspace, workspace_id, action_target, action_data,
      channels, presentation, dedupe_key
    ) values (
      recipient_id, 'marketplace', notice_type, notice_title, notice_body,
      'high', 'unread', 'commerce', 'marketplace', coalesce(new.business_id, old.business_id),
      notice_target, jsonb_build_object('businessAdminId', coalesce(new.id, old.id)),
      array['in_app', 'push']::text[], 'floating', notice_key
    )
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists notify_urmall_business_admin_change on public.marketplace_business_admins;
create trigger notify_urmall_business_admin_change
after insert or update of status, responsibilities or delete on public.marketplace_business_admins
for each row execute function public.notify_urmall_business_admin_change();

-- Preserve old invitations while moving their visible copy into UrMall. The
-- client filters these legacy Explore rows, so users see exactly one notice.
insert into public.platform_notifications (
  user_id, sector, notification_type, title, body, priority, status,
  category, workspace, action_target, channels, presentation, dedupe_key,
  created_at, read_at
)
select
  notification.user_id,
  'marketplace',
  'urmall_legacy_admin_notice',
  coalesce(nullif(notification.actor_name, ''), 'UrMall') || ' update',
  notification.message,
  'high',
  case when notification.read then 'read' else 'unread' end,
  'commerce',
  'marketplace',
  'urmall:admin-roles',
  array['in_app']::text[],
  'inbox',
  'legacy-explore-urmall:' || notification.id::text,
  notification.created_at,
  case when notification.read then notification.created_at else null end
from public.explore_notifications notification
where notification.type = 'system'
  and (
    lower(coalesce(notification.message, '')) like '%urmall%'
    or lower(coalesce(notification.message, '')) like '%store admin%'
  )
on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
