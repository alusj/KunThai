-- UrRide company workspace, operator and rental fixes (2026-10-08 audit).
--
-- 1. Company invitations expire: a pending invitation older than 30 days can
--    no longer be accepted, and the company owner can never be invited as an
--    operator of their own company.
-- 2. Suspending or removing a company member is one checked database action
--    (owner or manage_operators). Removal revokes EVERY open invitation the
--    person has in the company, clears them as operator of their fleets and
--    takes those vehicles offline. Suspension takes their vehicles offline
--    and withdraws pending invitations, but keeps accepted assignments so a
--    restore puts them straight back on their vehicle.
-- 3. The public company profile only names an operator who still holds an
--    accepted assignment on that fleet.
-- 4. Deleting a company fleet also deals with its live vehicle: deleted when
--    it has no trip history, otherwise kept offline and hidden for history.
-- 5. A deleted rental fleet no longer uses a plan vehicle slot and is marked
--    archived so Fleet HQ stops listing and counting it.
-- 6. Rentals: existing requests can be confirmed while the vehicle is hidden
--    for new requests; requests whose pickup time passed are declined so they
--    no longer block deleting the fleet; listings carry a display status
--    (reserved / rented out) from the booking covering now; listings page.
-- 7. Renters can ask whether the server would accept their review.

begin;

-- ---------------------------------------------------------------------------
-- 1. Invitation expiry and owner self-invites
-- ---------------------------------------------------------------------------

alter table public.transport_company_operator_invites add column if not exists expires_at timestamptz;
update public.transport_company_operator_invites
set expires_at = coalesce(created_at, now()) + interval '30 days'
where expires_at is null;

create or replace function public.guard_transport_company_invite_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := now() + interval '30 days';
    return new;
  end if;

  if old.status = 'pending' and new.status = 'accepted'
    and old.expires_at is not null and old.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the company to send a new one.'
      using errcode = 'check_violation';
  end if;

  -- Reopening a closed invitation starts a new 30 days; otherwise the
  -- expiry is fixed and cannot be extended by a client.
  if new.status = 'pending' and old.status is distinct from 'pending' then
    new.expires_at := now() + interval '30 days';
  else
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_transport_company_invite_expiry_trigger on public.transport_company_operator_invites;
create trigger guard_transport_company_invite_expiry_trigger
before insert or update on public.transport_company_operator_invites
for each row execute function public.guard_transport_company_invite_expiry();

create or replace function public.guard_transport_company_owner_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('pending', 'accepted') then return new; end if;
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.operator_user_id is not distinct from old.operator_user_id then
    return new;
  end if;
  if new.operator_user_id is not null and exists (
    select 1 from public.transport_companies company
    where company.id = new.company_id and company.owner_user_id = new.operator_user_id
  ) then
    raise exception 'The company owner cannot be invited as an operator.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_transport_company_owner_invite_trigger on public.transport_company_operator_invites;
create trigger guard_transport_company_owner_invite_trigger
before insert or update on public.transport_company_operator_invites
for each row execute function public.guard_transport_company_owner_invite();

-- ---------------------------------------------------------------------------
-- 2. Suspend / remove a company member
-- ---------------------------------------------------------------------------

create or replace function public.manage_transport_company_member(
  p_member_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.transport_company_members%rowtype;
  v_now timestamptz := now();
  v_fleet_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage company operators.';
  end if;
  if p_action not in ('suspend', 'remove') then
    raise exception 'Unsupported operator action.';
  end if;

  select * into v_member from public.transport_company_members where id = p_member_id for update;
  if v_member.id is null then
    raise exception 'This operator membership no longer exists. Refresh Fleet HQ.';
  end if;
  if not public.transport_company_user_has_permission(v_member.company_id, 'manage_operators', auth.uid()) then
    raise exception 'Only the company owner or an operator manager can manage operators.';
  end if;
  if v_member.role = 'owner' or exists (
    select 1 from public.transport_companies company
    where company.id = v_member.company_id and company.owner_user_id = v_member.user_id
  ) then
    raise exception 'The company creator cannot be suspended or removed.';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'You cannot suspend or remove yourself. Use Leave company instead.';
  end if;

  if p_action = 'suspend' then
    update public.transport_company_members
    set service_status = 'suspended', suspended_at = v_now, managed_by = auth.uid(), updated_at = v_now
    where id = v_member.id;
  else
    update public.transport_company_members
    set status = 'removed', service_status = 'removed', managed_by = auth.uid(), updated_at = v_now
    where id = v_member.id;
  end if;

  -- Fleets this person is assigned to in the company.
  select coalesce(array_agg(distinct invite.company_fleet_id) filter (where invite.company_fleet_id is not null), '{}')
  into v_fleet_ids
  from public.transport_company_operator_invites invite
  where invite.company_id = v_member.company_id
    and invite.status = 'accepted'
    and (invite.operator_user_id = v_member.user_id
      or (v_member.operator_id is not null and invite.operator_id = v_member.operator_id));
  if v_member.operator_id is not null then
    select coalesce(array_agg(distinct fleet_id), '{}') into v_fleet_ids
    from (
      select unnest(v_fleet_ids) as fleet_id
      union
      select fleet.id from public.transport_company_fleets fleet
      where fleet.company_id = v_member.company_id and fleet.operator_id = v_member.operator_id
    ) assigned;
  end if;

  -- Pending invitations are withdrawn either way; removal also ends every
  -- accepted assignment in this company, not only the one that was clicked.
  update public.transport_company_operator_invites invite
  set status = 'revoked', updated_at = v_now
  where invite.company_id = v_member.company_id
    and invite.status = any(case when p_action = 'remove' then array['pending', 'accepted'] else array['pending'] end)
    and (invite.operator_user_id = v_member.user_id
      or (v_member.operator_id is not null and invite.operator_id = v_member.operator_id));

  if p_action = 'remove' and cardinality(v_fleet_ids) > 0 then
    update public.transport_company_fleets fleet
    set operator_id = case when fleet.operator_id is not distinct from v_member.operator_id then null else fleet.operator_id end,
        operators = (
          select coalesce(jsonb_agg(
            case when lower(coalesce(entry ->> 'status', '')) in ('pending', 'accepted', 'accepted_pending_documents')
              and (
                coalesce(entry ->> 'userId', entry ->> 'operator_user_id', '') = v_member.user_id::text
                or (v_member.operator_id is not null
                  and coalesce(entry ->> 'operatorId', entry ->> 'operator_id', '') = v_member.operator_id::text)
              )
              then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
              else entry end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(fleet.operators, '[]'::jsonb)) entry
        ),
        is_visible_to_passengers = false,
        updated_at = v_now
    where fleet.id = any(v_fleet_ids);
  end if;

  -- Their company vehicles go offline for both actions.
  update public.transport_fleets runtime
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where runtime.company_fleet_id = any(v_fleet_ids)
    or (v_member.operator_id is not null
      and runtime.company_id = v_member.company_id
      and runtime.operator_id = v_member.operator_id);

  return jsonb_build_object('ok', true, 'action', p_action, 'memberId', v_member.id, 'companyFleetIds', to_jsonb(v_fleet_ids));
end;
$$;

revoke all on function public.manage_transport_company_member(uuid, text) from public, anon;
grant execute on function public.manage_transport_company_member(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Public profile names only a currently assigned operator
-- ---------------------------------------------------------------------------

do $patch$
declare
  definition text;
  old_join constant text := 'left join public.transport_operators op on op.id = tf.operator_id';
begin
  if to_regprocedure('public.get_public_transport_company_profile(uuid)') is null then return; end if;
  select pg_get_functiondef('public.get_public_transport_company_profile(uuid)'::regprocedure) into definition;
  if position(old_join in definition) = 0 then
    raise notice 'get_public_transport_company_profile: operator join not found, left unchanged';
    return;
  end if;
  execute replace(definition, old_join, old_join || '
        and exists (
          select 1 from public.transport_company_operator_invites assignment
          where assignment.company_fleet_id = cf.id
            and assignment.status = ''accepted''
            and (assignment.operator_id = tf.operator_id or assignment.operator_user_id = op.user_id)
        )');
end $patch$;

-- ---------------------------------------------------------------------------
-- 4. Deleting a company fleet also handles its live vehicle
--    (latest definition: 20261007180000_urride_fleet_management.sql)
-- ---------------------------------------------------------------------------

create or replace function public.manage_transport_company_fleet(
  p_company_fleet_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fleet public.transport_company_fleets%rowtype;
  v_now timestamptz := now();
  v_runtime_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage company fleets.';
  end if;
  if p_action not in ('removeOperator', 'delete') then
    raise exception 'Unsupported fleet action.';
  end if;

  select * into v_fleet from public.transport_company_fleets
  where id = p_company_fleet_id for update;
  if v_fleet.id is null then
    raise exception 'This fleet no longer exists. Refresh Fleet HQ.';
  end if;
  if not public.transport_company_user_has_permission(v_fleet.company_id, 'manage_fleets', auth.uid()) then
    raise exception 'Only the company owner or a fleet manager can manage this fleet.';
  end if;

  -- The passenger-facing vehicle goes offline for both actions.
  update public.transport_fleets
  set active_status = 'offline', is_visible_to_passengers = false, updated_at = v_now
  where company_fleet_id = p_company_fleet_id;

  update public.transport_company_operator_invites
  set status = 'revoked', updated_at = v_now
  where company_fleet_id = p_company_fleet_id and status in ('pending', 'accepted');

  if p_action = 'removeOperator' then
    update public.transport_company_fleets
    set operator_id = null,
        operators = (
          select coalesce(jsonb_agg(
            case when lower(coalesce(entry ->> 'status', '')) in ('pending', 'accepted', 'accepted_pending_documents')
              then entry || jsonb_build_object('status', 'revoked', 'updatedAt', v_now)
              else entry end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_fleet.operators, '[]'::jsonb)) entry
        ),
        is_visible_to_passengers = false,
        updated_at = v_now
    where id = p_company_fleet_id;
  else
    -- The live vehicle record must not outlive the company fleet as the
    -- operator's "own" vehicle. Without trips it is deleted; with trip
    -- history it stays offline and hidden, still tagged with the company
    -- (company_id) so it is never shown as the operator's personal fleet.
    for v_runtime_id in
      select runtime.id from public.transport_fleets runtime where runtime.company_fleet_id = p_company_fleet_id
    loop
      if exists (select 1 from public.transport_trips trip where trip.fleet_id = v_runtime_id) then
        update public.transport_fleets
        set company_id = coalesce(company_id, v_fleet.company_id), updated_at = v_now
        where id = v_runtime_id;
      else
        delete from public.transport_fleets where id = v_runtime_id;
      end if;
    end loop;
    delete from public.transport_company_fleets where id = p_company_fleet_id;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'companyFleetId', p_company_fleet_id);
end;
$$;

revoke all on function public.manage_transport_company_fleet(uuid, text) from public, anon;
grant execute on function public.manage_transport_company_fleet(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Deleted rental fleets are archived and use no plan vehicle slot
-- ---------------------------------------------------------------------------

alter table public.transport_company_fleets add column if not exists archived_at timestamptz;
update public.transport_company_fleets fleet
set archived_at = rental.deleted_at
from public.transport_company_rentals rental
where rental.company_fleet_id = fleet.id and rental.deleted_at is not null and fleet.archived_at is null;

create or replace function public.transport_company_counted_fleets(p_company_id uuid, p_exclude_fleet_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.transport_company_fleets fleet
  where fleet.company_id = p_company_id
    and fleet.id is distinct from p_exclude_fleet_id
    and fleet.archived_at is null
    and not exists (
      select 1 from public.transport_company_rentals rental
      where rental.company_fleet_id = fleet.id and rental.deleted_at is not null
    );
$$;
revoke all on function public.transport_company_counted_fleets(uuid, uuid) from public, anon, authenticated;

-- Latest definition: 20260820140000_business_subscription_capacity_guards.sql
create or replace function public.kunthai_guard_urride_vehicle_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement record;
  v_current integer;
begin
  if tg_op = 'UPDATE' and old.company_id is not distinct from new.company_id then
    return new;
  end if;

  select * into v_entitlement
  from public.kunthai_business_effective_entitlement('urride', new.company_id);
  if v_entitlement.vehicle_limit is null then return new; end if;

  v_current := public.transport_company_counted_fleets(new.company_id, new.id);

  if v_current >= v_entitlement.vehicle_limit then
    perform public.kunthai_raise_capacity_limit(
      'urride', 'vehicles', v_current, v_entitlement.vehicle_limit, v_entitlement.plan_code
    );
  end if;
  return new;
end;
$$;

-- Latest definition: 20260905130000_urmall_expiry_retention.sql (a wrapper
-- around kunthai_business_usage_before_urmall_retention). UrRide vehicles
-- leave out deleted rentals; operators leave out expired pending invitations.
create or replace function public.kunthai_business_usage(p_surface text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_usage jsonb; v_count integer; v_operators integer;
begin
  v_usage := public.kunthai_business_usage_before_urmall_retention(p_surface, p_entity_id);
  if lower(p_surface) = 'urmall' then
    select count(*)::integer into v_count from public.kunthai_urmall_retention_inventory where business_id = p_entity_id and eligible_to_keep;
    v_usage := v_usage || jsonb_build_object('products', v_count);
  elsif lower(p_surface) = 'urride' then
    with operator_identities as (
      select coalesce(
        invite.operator_user_id::text,
        invite.operator_id::text,
        nullif(lower(btrim(invite.operator_public_id)), '')
      ) as identity_key
      from public.transport_company_operator_invites invite
      where invite.company_id = p_entity_id
        and (invite.status = 'accepted'
          or (invite.status = 'pending' and (invite.expires_at is null or invite.expires_at > now())))
      union
      select coalesce(
        member.user_id::text,
        member.operator_id::text,
        nullif(lower(btrim(member.public_id)), '')
      ) as identity_key
      from public.transport_company_members member
      where member.company_id = p_entity_id
        and member.role = 'operator'
        and member.status in ('pending', 'active')
        and coalesce(member.service_status, 'active') = 'active'
    )
    select count(*)::integer into v_operators
    from operator_identities where identity_key is not null;
    v_usage := v_usage || jsonb_build_object(
      'vehicles', public.transport_company_counted_fleets(p_entity_id, null),
      'operators', v_operators
    );
  end if;
  return v_usage;
end;
$$;
revoke all on function public.kunthai_business_usage(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Rentals
-- ---------------------------------------------------------------------------

-- Requests whose pickup time passed can never be confirmed: decline them so
-- they leave the open queue. ('expired' is not an allowed reservation status.)
create or replace function public.expire_stale_transport_rental_requests(p_rental_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_count integer;
begin
  update public.transport_rental_reservations
  set status = 'declined', updated_at = now()
  where rental_id = p_rental_id and status = 'requested' and starts_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.expire_stale_transport_rental_requests(uuid) from public, anon, authenticated;

-- Latest definition: 20260909120000_rental_fleet_experience.sql
create or replace function public.delete_transport_rental_fleet(p_rental_id uuid)
returns void language plpgsql security definer set search_path=public,auth as $$
declare r public.transport_company_rentals;
begin
  select * into r from public.transport_company_rentals where id=p_rental_id for update;
  if not found or not public.can_manage_transport_rentals(r.company_id) then raise exception 'Only the owner or an active admin can delete rental fleets.'; end if;
  perform public.expire_stale_transport_rental_requests(r.id);
  if exists(select 1 from public.transport_rental_reservations where rental_id=r.id and status in ('requested','confirmed','active')) then raise exception 'Resolve open requests and rentals before deleting this fleet.'; end if;
  update public.transport_company_rentals set deleted_at=now(),status='hidden',updated_at=now() where id=r.id;
  -- The fleet row stays for reservation history but leaves Fleet HQ and the plan count.
  update public.transport_company_fleets set archived_at=now(),is_visible_to_passengers=false,updated_at=now()
  where id=r.company_fleet_id and archived_at is null;
end;
$$;

-- Latest definition: 20260905160000_urride_company_rentals.sql.
-- Hiding a vehicle stops NEW requests; requests already received can still
-- be confirmed. Only a deleted fleet or a passed pickup time blocks it.
create or replace function public.update_transport_rental_reservation(p_reservation_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare b public.transport_rental_reservations; v public.transport_company_rentals; manager boolean;
begin
  -- Always lock rental before reservation, matching request and date guard order.
  select r.* into v from public.transport_company_rentals r join public.transport_rental_reservations booking on booking.rental_id=r.id where booking.id=p_reservation_id for update of r;
  if not found then raise exception 'Reservation not found.'; end if;
  select * into b from public.transport_rental_reservations where id=p_reservation_id for update;
  manager := public.can_manage_transport_rentals(v.company_id);
  if auth.uid() is null or not (manager or b.customer_user_id=auth.uid()) then raise exception 'You cannot manage this reservation.'; end if;
  if not manager and not (p_status='cancelled' and b.status in ('requested','confirmed') and b.starts_at > now()) then raise exception 'Contact the company to change an active rental.'; end if;
  if not ((b.status='requested' and p_status in ('confirmed','declined','cancelled')) or (b.status='confirmed' and p_status in ('active','cancelled')) or (b.status='active' and p_status='completed')) then raise exception 'This reservation has already changed. Refresh and try again.'; end if;
  if p_status='confirmed' and v.deleted_at is not null then raise exception 'This rental fleet has been deleted.'; end if;
  if p_status='confirmed' and b.starts_at < now() then raise exception 'The pickup time has passed. Decline this request and ask the renter for new dates.'; end if;
  update public.transport_rental_reservations set status=p_status,managed_by=auth.uid(),updated_at=now() where id=b.id;
  return b.id;
end;
$$;

-- Latest definition: 20260909120000_rental_fleet_experience.sql. Adds a
-- display status from the booking covering now, and paging (at most 500 per
-- call). The old three-argument form is replaced; three-argument calls still
-- resolve to this one through the defaults.
drop function if exists public.list_transport_rentals(uuid, uuid, text);
create or replace function public.list_transport_rentals(
  p_rental_id uuid default null,
  p_company_id uuid default null,
  p_country text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns setof jsonb language sql stable security definer set search_path=public,auth as $$
 select to_jsonb(r)||jsonb_build_object('company_name',c.company_name,'company_phone',c.phone,'company_email',c.email,'company_country',c.country,'company_city',c.city,'can_manage',public.can_manage_transport_rentals(r.company_id),
   'display_status',case
     when exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.status='active' and b.starts_at<=now() and b.ends_at>now()) then 'rented_out'
     when exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.status='confirmed' and b.starts_at<=now() and b.ends_at>now()) then 'reserved'
     else r.status end)
 from public.transport_company_rentals r join public.transport_companies c on c.id=r.company_id
 where (p_rental_id is null or r.id=p_rental_id) and (p_company_id is null or r.company_id=p_company_id) and (p_country is null or c.country=p_country)
 and ((r.status='available' and r.deleted_at is null)
   or (p_company_id is not null and public.can_manage_transport_rentals(r.company_id))
   or (p_rental_id is not null and (public.can_manage_transport_rentals(r.company_id) or exists(select 1 from public.transport_rental_reservations b where b.rental_id=r.id and b.customer_user_id=auth.uid()))))
 order by r.created_at desc, r.id
 limit least(greatest(coalesce(p_limit,200),1),500) offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.list_transport_rentals(uuid,uuid,text,integer,integer) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 7. Rental review eligibility (same rules as save_transport_rental_review in
--    20261006140000_review_integrity.sql)
-- ---------------------------------------------------------------------------

create or replace function public.get_transport_rental_review_eligibility(p_rental_id uuid)
returns table (eligible boolean, mode text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare r public.transport_company_rentals;
begin
  select * into r from public.transport_company_rentals where id = p_rental_id;
  if auth.uid() is null or r.id is null or public.can_manage_transport_rentals(r.company_id) then
    return query select false, ''::text;
    return;
  end if;
  if exists (
    select 1 from public.transport_rental_reservations reservation
    where reservation.rental_id = p_rental_id
      and reservation.customer_user_id = auth.uid()
      and reservation.status = 'completed'
      and coalesce(reservation.completed_at, reservation.updated_at) > now() - interval '30 days'
      and not exists (select 1 from public.transport_rental_reviews review where review.reservation_id = reservation.id)
  ) then
    return query select true, 'new'::text;
    return;
  end if;
  if exists (
    select 1 from public.transport_rental_reviews review
    where review.rental_id = p_rental_id
      and review.customer_user_id = auth.uid()
      and review.edit_count = 0
      and review.created_at > now() - interval '7 days'
  ) then
    return query select true, 'edit'::text;
    return;
  end if;
  return query select false, ''::text;
end;
$$;
revoke all on function public.get_transport_rental_review_eligibility(uuid) from public, anon;
grant execute on function public.get_transport_rental_review_eligibility(uuid) to authenticated;

commit;
