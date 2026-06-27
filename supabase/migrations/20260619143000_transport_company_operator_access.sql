-- Fleet HQ operator membership, delegated permissions, and scoped dashboard access.

alter table if exists public.transport_company_members
  add column if not exists operator_id uuid references public.transport_operators(id) on delete set null,
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists responsibilities text[] not null default '{}'::text[],
  add column if not exists service_status text not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists managed_by uuid references auth.users(id) on delete set null;

do $$ begin
  alter table public.transport_company_members
    add constraint transport_company_members_service_status_check
    check (service_status in ('active', 'suspended', 'removed'));
exception
  when duplicate_object then null;
end $$;

create index if not exists transport_company_members_operator_idx
  on public.transport_company_members (operator_id, company_id);

create or replace function public.transport_company_user_has_permission(
  company_uuid uuid,
  permission_key text,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.transport_company_is_owner(company_uuid, user_uuid)
    or exists (
      select 1
      from public.transport_company_members member
      where member.company_id = company_uuid
        and member.user_id = user_uuid
        and member.status = 'active'
        and coalesce(member.service_status, 'active') = 'active'
        and (
          coalesce((member.permissions ->> permission_key)::boolean, false)
          or member.role = 'admin'
          or (member.role = 'fleet_manager' and permission_key in (
            'view_company_hq', 'view_all_bookings', 'manage_fleets', 'view_company_activity'
          ))
          or (member.role = 'dispatcher' and permission_key in (
            'view_company_hq', 'view_all_bookings', 'dispatch_bookings', 'view_company_activity'
          ))
        )
    );
$$;

create or replace function public.transport_company_can_view_operator(
  operator_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.operator_id = operator_uuid
      and invite.status = 'accepted'
      and (
        public.transport_company_is_owner(invite.company_id, user_uuid)
        or public.transport_company_user_has_permission(invite.company_id, 'manage_operators', user_uuid)
      )
  );
$$;

grant execute on function public.transport_company_user_has_permission(uuid, text, uuid) to authenticated;
grant execute on function public.transport_company_can_view_operator(uuid, uuid) to authenticated;

create or replace function public.transport_company_sync_operator_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_user_id uuid;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  resolved_user_id := new.operator_user_id;
  if resolved_user_id is null and new.operator_id is not null then
    select operator.user_id into resolved_user_id
    from public.transport_operators operator
    where operator.id = new.operator_id;
  end if;

  if resolved_user_id is null then
    return new;
  end if;

  insert into public.transport_company_members (
    company_id,
    user_id,
    operator_id,
    public_id,
    full_name,
    role,
    status,
    service_status,
    joined_at,
    updated_at
  ) values (
    new.company_id,
    resolved_user_id,
    new.operator_id,
    new.operator_public_id,
    new.operator_name,
    'operator',
    'active',
    'active',
    coalesce(new.responded_at, now()),
    now()
  )
  on conflict (company_id, user_id) do update set
    operator_id = coalesce(excluded.operator_id, public.transport_company_members.operator_id),
    public_id = coalesce(nullif(excluded.public_id, ''), public.transport_company_members.public_id),
    full_name = coalesce(nullif(excluded.full_name, ''), public.transport_company_members.full_name),
    status = case
      when public.transport_company_members.role = 'owner' then public.transport_company_members.status
      else 'active'
    end,
    service_status = case
      when public.transport_company_members.role = 'owner' then public.transport_company_members.service_status
      else 'active'
    end,
    joined_at = coalesce(public.transport_company_members.joined_at, excluded.joined_at),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists transport_company_sync_operator_member_trigger on public.transport_company_operator_invites;
create trigger transport_company_sync_operator_member_trigger
after insert or update of status, operator_id, operator_user_id on public.transport_company_operator_invites
for each row execute function public.transport_company_sync_operator_member();

insert into public.transport_company_members (
  company_id,
  user_id,
  operator_id,
  public_id,
  full_name,
  role,
  status,
  service_status,
  joined_at,
  updated_at
)
select
  invite.company_id,
  coalesce(invite.operator_user_id, operator.user_id),
  invite.operator_id,
  invite.operator_public_id,
  invite.operator_name,
  'operator',
  'active',
  'active',
  coalesce(invite.responded_at, invite.updated_at, invite.created_at, now()),
  now()
from public.transport_company_operator_invites invite
left join public.transport_operators operator on operator.id = invite.operator_id
where invite.status = 'accepted'
  and coalesce(invite.operator_user_id, operator.user_id) is not null
on conflict (company_id, user_id) do update set
  operator_id = coalesce(excluded.operator_id, public.transport_company_members.operator_id),
  public_id = coalesce(nullif(excluded.public_id, ''), public.transport_company_members.public_id),
  full_name = coalesce(nullif(excluded.full_name, ''), public.transport_company_members.full_name),
  updated_at = now();

create or replace function public.transport_company_record_invite_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_kind text;
  activity_title text;
  activity_body text;
  documents_submitted boolean;
begin
  documents_submitted := coalesce((new.documents ->> 'operatorDocumentsSubmitted')::boolean, false);

  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and (new.documents ->> 'operatorDocumentsSubmittedAt') is not distinct from (old.documents ->> 'operatorDocumentsSubmittedAt') then
    return new;
  end if;

  if new.status = 'rejected' then
    activity_kind := 'operator_invite_rejected';
    activity_title := 'Operator invitation declined';
    activity_body := coalesce(nullif(new.operator_name, ''), 'An operator') || ' declined the company invitation.';
  elsif new.status = 'accepted' then
    activity_kind := case when documents_submitted then 'operator_invite_documents_submitted' else 'operator_invite_accepted' end;
    activity_title := case when documents_submitted then 'Operator documents submitted' else 'Operator invitation accepted' end;
    activity_body := coalesce(nullif(new.operator_name, ''), 'An operator') ||
      case when documents_submitted then ' accepted and submitted operator documents for review.' else ' accepted the company invitation.' end;
  else
    return new;
  end if;

  insert into public.transport_company_activities (
    company_id,
    actor_user_id,
    activity_type,
    title,
    body,
    metadata
  ) values (
    new.company_id,
    coalesce(new.operator_user_id, auth.uid()),
    activity_kind,
    activity_title,
    activity_body,
    jsonb_build_object(
      'inviteId', new.id,
      'requestId', new.request_id,
      'operatorId', new.operator_id,
      'operatorUserId', new.operator_user_id,
      'operatorPublicId', new.operator_public_id,
      'operatorName', new.operator_name,
      'fleetCode', new.fleet_code,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists transport_company_record_invite_response_trigger on public.transport_company_operator_invites;
create trigger transport_company_record_invite_response_trigger
after insert or update of status, documents on public.transport_company_operator_invites
for each row execute function public.transport_company_record_invite_response();

-- A basic operator may read the company identity and their assigned company fleet,
-- but Fleet HQ records stay limited to the creator and delegated staff.
drop policy if exists "company members can read fleets" on public.transport_company_fleets;
drop policy if exists "delegated members can read company fleets" on public.transport_company_fleets;
create policy "delegated members can read company fleets"
on public.transport_company_fleets
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'view_company_hq', auth.uid()));

drop policy if exists "company members can read activities" on public.transport_company_activities;
drop policy if exists "delegated members can read company activities" on public.transport_company_activities;
create policy "delegated members can read company activities"
on public.transport_company_activities
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'view_company_activity', auth.uid()));

drop policy if exists "delegated staff can read company members" on public.transport_company_members;
create policy "delegated staff can read company members"
on public.transport_company_members
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));

drop policy if exists "delegated staff can manage company members" on public.transport_company_members;
create policy "delegated staff can manage company members"
on public.transport_company_members
for update
to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()))
with check (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));

drop policy if exists "delegated staff can read company invites" on public.transport_company_operator_invites;
create policy "delegated staff can read company invites"
on public.transport_company_operator_invites
for select
to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));

drop policy if exists "delegated staff can update company invites" on public.transport_company_operator_invites;
create policy "delegated staff can update company invites"
on public.transport_company_operator_invites
for update
to authenticated
using (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()))
with check (public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid()));

drop policy if exists "delegated staff can create company activities" on public.transport_company_activities;
create policy "delegated staff can create company activities"
on public.transport_company_activities
for insert
to authenticated
with check (
  actor_user_id = auth.uid()
  and public.transport_company_user_has_permission(company_id, 'manage_operators', auth.uid())
);

drop policy if exists "company managers can read accepted operators" on public.transport_operators;
create policy "company managers can read accepted operators"
on public.transport_operators
for select
to authenticated
using (public.transport_company_can_view_operator(id, auth.uid()));

drop policy if exists "company managers can read operator fleets" on public.transport_fleets;
create policy "company managers can read operator fleets"
on public.transport_fleets
for select
to authenticated
using (public.transport_company_can_view_operator(operator_id, auth.uid()));

drop policy if exists "company booking viewers can read operator fleet summaries" on public.transport_fleets;
create policy "company booking viewers can read operator fleet summaries"
on public.transport_fleets
for select
to authenticated
using (
  exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.operator_id = transport_fleets.operator_id
      and invite.status = 'accepted'
      and public.transport_company_user_has_permission(invite.company_id, 'view_all_bookings', auth.uid())
  )
);

drop policy if exists "company managers can suspend operator fleets" on public.transport_fleets;
create policy "company managers can suspend operator fleets"
on public.transport_fleets
for update
to authenticated
using (
  exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.operator_id = transport_fleets.operator_id
      and invite.status = 'accepted'
      and (
        public.transport_company_is_owner(invite.company_id, auth.uid())
        or public.transport_company_user_has_permission(invite.company_id, 'manage_operators', auth.uid())
      )
  )
)
with check (
  exists (
    select 1
    from public.transport_company_operator_invites invite
    where invite.operator_id = transport_fleets.operator_id
      and invite.status = 'accepted'
      and (
        public.transport_company_is_owner(invite.company_id, auth.uid())
        or public.transport_company_user_has_permission(invite.company_id, 'manage_operators', auth.uid())
      )
  )
);

drop policy if exists "company managers can read operator trips" on public.transport_trips;
create policy "company managers can read operator trips"
on public.transport_trips
for select
to authenticated
using (
  exists (
    select 1 from public.transport_fleets fleet
    where fleet.id = transport_trips.fleet_id
      and (
        public.transport_company_can_view_operator(fleet.operator_id, auth.uid())
        or exists (
          select 1
          from public.transport_company_operator_invites invite
          where invite.operator_id = fleet.operator_id
            and invite.status = 'accepted'
            and public.transport_company_user_has_permission(invite.company_id, 'view_all_bookings', auth.uid())
        )
      )
  )
);

drop policy if exists "company managers can read operator alerts" on public.transport_operator_alerts;
create policy "company managers can read operator alerts"
on public.transport_operator_alerts
for select
to authenticated
using (public.transport_company_can_view_operator(operator_id, auth.uid()));

drop policy if exists "company managers can read operator reviews" on public.transport_operator_reviews;
create policy "company managers can read operator reviews"
on public.transport_operator_reviews
for select
to authenticated
using (public.transport_company_can_view_operator(operator_id, auth.uid()));

drop policy if exists "company managers can read operator transactions" on public.transport_operator_transactions;
create policy "company managers can read operator transactions"
on public.transport_operator_transactions
for select
to authenticated
using (public.transport_company_can_view_operator(operator_id, auth.uid()));

drop policy if exists "company managers can read operator documents" on public.transport_operator_documents;
create policy "company managers can read operator documents"
on public.transport_operator_documents
for select
to authenticated
using (public.transport_company_can_view_operator(operator_id, auth.uid()));
