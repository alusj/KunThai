-- Space team actions notify the people they concern (2026-10-31).
--
-- Inviting a team member, answering an invitation, changing a member's role or
-- responsibilities, removing a member, leaving, and pausing, resuming or
-- deleting a Space wrote nothing: an invited person only found the invitation
-- by opening their Profile. Each now writes one Explore notification (bell +
-- push via platform_notifications_add_push_channel) that opens the Profile
-- screen, where Space invitations are answered and Spaces are opened. The
-- person who acted is never notified of their own action.
--
--   invited (pending row)              -> the invited person
--   invitation accepted / declined     -> the person who invited them
--   role or responsibilities changed   -> that member
--   removed by the team                -> that member
--   left (removed by themselves)       -> the owner and administrators
--   Space paused / resumed / deleted   -> every active team member
begin;

create or replace function public.explore_space_notify(
  p_user uuid, p_space uuid, p_type text, p_title text, p_body text, p_key text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_user is not distinct from auth.uid() then return; end if;
  insert into public.platform_notifications (
    user_id, sector, notification_type, title, body, priority, status,
    category, workspace, workspace_id, action_target, action_data,
    channels, presentation, dedupe_key
  ) values (
    p_user, 'explore', p_type, p_title, p_body, 'high', 'unread',
    'system', 'explore', p_space, 'explore:spaces', jsonb_build_object('spaceId', p_space),
    array['in_app', 'push']::text[], 'floating', p_key
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

revoke all on function public.explore_space_notify(uuid, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.explore_space_role_label(p_role text)
returns text language sql immutable as $$
  select case p_role
    when 'administrator' then 'Administrator'
    when 'moderator' then 'Moderator'
    when 'editor' then 'Editor'
    when 'customer_support' then 'Customer Support'
    when 'analyst' then 'Analyst'
    when 'owner' then 'Owner'
    else initcap(replace(coalesce(p_role, 'member'), '_', ' '))
  end;
$$;

create or replace function public.notify_explore_space_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_space text;
  v_status text;
  v_who text := coalesce(nullif(btrim(new.member_name), ''), 'A team member');
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
  v_admin uuid;
begin
  select coalesce(nullif(btrim(space.name), ''), 'A Space'), space.status
  into v_space, v_status
  from public.explore_spaces space where space.id = new.space_id;
  if v_space is null or v_status = 'deleted' then return new; end if;

  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.explore_space_notify(new.user_id, new.space_id, 'explore_space_invite', 'Space team invitation',
        v_space || ' invited you to join its team as ' || public.explore_space_role_label(new.role) || '. Open your profile to accept or decline.',
        'explore-space-invite:' || new.id::text || ':' || v_stamp);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status = 'active' then
      perform public.explore_space_notify(new.invited_by, new.space_id, 'explore_space_invite_accepted', 'Space invitation accepted',
        v_who || ' joined the ' || v_space || ' team.',
        'explore-space-joined:' || new.id::text);
    elsif old.status = 'pending' and new.status = 'removed' then
      if auth.uid() is not distinct from new.user_id then
        perform public.explore_space_notify(new.invited_by, new.space_id, 'explore_space_invite_declined', 'Space invitation declined',
          v_who || ' declined the invitation to the ' || v_space || ' team.',
          'explore-space-declined:' || new.id::text || ':' || v_stamp);
      end if;
    elsif old.status = 'active' and new.status = 'removed' then
      if auth.uid() is not distinct from new.user_id then
        for v_admin in
          select member.user_id from public.explore_space_members member
          where member.space_id = new.space_id and member.status = 'active'
            and member.role in ('owner', 'administrator') and member.user_id <> new.user_id
        loop
          perform public.explore_space_notify(v_admin, new.space_id, 'explore_space_member_left', 'A team member left',
            v_who || ' left the ' || v_space || ' team.',
            'explore-space-left:' || new.id::text || ':' || v_admin::text || ':' || v_stamp);
        end loop;
      else
        perform public.explore_space_notify(new.user_id, new.space_id, 'explore_space_member_removed', 'Removed from a Space team',
          'You were removed from the ' || v_space || ' team.',
          'explore-space-removed:' || new.id::text || ':' || v_stamp);
      end if;
    end if;
    return new;
  end if;

  if new.status = 'active' and new.role is distinct from old.role then
    perform public.explore_space_notify(new.user_id, new.space_id, 'explore_space_role_changed', 'Space role updated',
      'Your role in ' || v_space || ' is now ' || public.explore_space_role_label(new.role) || '.',
      'explore-space-role:' || new.id::text || ':' || v_stamp);
  elsif new.status = 'active' and new.responsibilities is distinct from old.responsibilities then
    perform public.explore_space_notify(new.user_id, new.space_id, 'explore_space_role_changed', 'Space responsibilities updated',
      'Your responsibilities in ' || v_space || ' were updated.',
      'explore-space-duties:' || new.id::text || ':' || v_stamp);
  end if;
  return new;
exception when others then
  -- A notification never blocks the team change itself.
  return new;
end;
$$;

drop trigger if exists notify_explore_space_member_change on public.explore_space_members;
create trigger notify_explore_space_member_change
after insert or update of status, role, responsibilities on public.explore_space_members
for each row execute function public.notify_explore_space_member_change();

create or replace function public.notify_explore_space_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_space text := coalesce(nullif(btrim(new.name), ''), 'A Space');
  v_title text;
  v_body text;
  v_member uuid;
  v_stamp text := extract(epoch from clock_timestamp())::bigint::text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'paused' then
    v_title := 'Space paused';
    v_body := v_space || ' was paused. It is hidden until it is resumed.';
  elsif new.status = 'active' and old.status = 'paused' then
    v_title := 'Space resumed';
    v_body := v_space || ' is active again.';
  elsif new.status = 'deleted' then
    v_title := 'Space deleted';
    v_body := v_space || ' was deleted. Its team no longer has access.';
  else
    return new;
  end if;

  for v_member in
    select member.user_id from public.explore_space_members member
    where member.space_id = new.id and member.status = 'active'
  loop
    perform public.explore_space_notify(v_member, new.id, 'explore_space_status', v_title, v_body,
      'explore-space-status:' || new.id::text || ':' || new.status || ':' || v_member::text || ':' || v_stamp);
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_explore_space_status_change on public.explore_spaces;
create trigger notify_explore_space_status_change
after update of status on public.explore_spaces
for each row execute function public.notify_explore_space_status_change();

commit;
