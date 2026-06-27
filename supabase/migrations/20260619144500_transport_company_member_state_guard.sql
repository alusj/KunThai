-- Preserve CEO-managed suspension/removal when an operator later updates an accepted invite.

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
      when public.transport_company_members.status = 'pending' then 'active'
      else public.transport_company_members.status
    end,
    service_status = case
      when public.transport_company_members.role = 'owner' then public.transport_company_members.service_status
      when public.transport_company_members.status = 'pending' then 'active'
      else public.transport_company_members.service_status
    end,
    joined_at = coalesce(public.transport_company_members.joined_at, excluded.joined_at),
    updated_at = now();

  return new;
end;
$$;
