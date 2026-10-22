-- Two objects were open to anyone holding the public (anon) key:
--
-- 1. admin_staff_levels had no row level security and the default full grants,
--    so anon and every signed-in user could UPDATE max_authority, DELETE or
--    TRUNCATE the staff career ladder that admin_authority_level() caps
--    authority with. Only SECURITY DEFINER admin functions read it; the app
--    never queries it directly.
-- 2. transport_operator_dashboard_summary ran with its owner's rights (no
--    security_invoker), so anon could read every operator's trips and earnings
--    for today, past RLS. Nothing in the app reads it.

alter table public.admin_staff_levels enable row level security;
revoke all on table public.admin_staff_levels from anon, authenticated;

alter view public.transport_operator_dashboard_summary set (security_invoker = true);
revoke all on table public.transport_operator_dashboard_summary from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.transport_operator_dashboard_summary from authenticated;

-- Internal helpers that anon could call directly: the welcome-credit grant
-- (run by the sign-up trigger) and the notification clean-up (run by cron).
-- The app never calls either.
revoke execute on function public.grant_kunthai_starter_credits(uuid) from public, anon, authenticated;
revoke execute on function public.cleanup_expired_user_notifications() from public, anon, authenticated;

-- 3. Space team self-service could change more than its status. The policies
--    "invited users respond to space team invitations" and "space members
--    leave their own team" only check user_id and the new status, so a person
--    with any pending invitation could, in the same update, move the row to
--    another Space (space_id) and give themselves the administrator role
--    there. explore_space_members_guard_owner only stops the 'owner' role.
--    Accepting, declining and leaving change status and accepted_at only;
--    everything else on a member row is for the Space's owner and
--    administrators, and a row never moves to another Space.
create or replace function public.explore_space_members_guard_self_service()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.is_kunthai_admin(v_uid) then
    return new;
  end if;

  if new.space_id is distinct from old.space_id then
    raise exception 'A Space team member cannot be moved to another Space.' using errcode = '42501';
  end if;

  if exists (select 1 from public.explore_spaces space where space.id = old.space_id and space.owner_user_id = v_uid)
     or public.explore_space_role_allows(old.space_id, array['owner', 'administrator']) then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.role is distinct from old.role
     or new.department_id is distinct from old.department_id
     or new.responsibilities is distinct from old.responsibilities
     or new.invited_by is distinct from old.invited_by
     or new.member_code is distinct from old.member_code
     or new.member_name is distinct from old.member_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the Space owner or an administrator can change a team member''s role or details.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.explore_space_members_guard_self_service() from public, anon, authenticated;

drop trigger if exists explore_space_members_guard_self_service on public.explore_space_members;
create trigger explore_space_members_guard_self_service
  before update on public.explore_space_members
  for each row execute function public.explore_space_members_guard_self_service();
