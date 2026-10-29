-- Verification cases name the operator, company or business they are about
-- (2026-10-28).
--
-- Fleet and document cases were titled "Fleet Verification" / "Document
-- Verification" with nothing tying them to the operator's code (51337) that
-- the directory and the operator dashboard (KT-51337) show, so admins could
-- not tell whose case they were looking at.
--
-- Each verification case now carries metadata.owner:
--   { kind: 'operator' | 'company' | 'business', id, name, code }
-- resolved from the case's record when it is created; existing cases are
-- filled in. The console shows it on queue rows and the case drawer, search
-- finds cases by it, and the directory drawer lists an operator's cases with
-- it (src/admin/adminCaseRules.js, getCaseOwner).
--
-- Safe to run more than once.

begin;

create or replace function public.admin_case_owner(p_resource_type text, p_resource_id uuid, p_source jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_source jsonb := coalesce(p_source, '{}'::jsonb);
  v_operator uuid;
  v_company uuid;
  v_business uuid;
  v_owner jsonb;
begin
  if p_resource_type in ('transport_operator_verification', 'transport_fleet_verification',
                         'transport_solo_fleet_verification', 'transport_document_verification') then
    v_operator := case when p_resource_type = 'transport_operator_verification' then p_resource_id
                       else public.explore_try_uuid(v_source ->> 'operator_id') end;
    if v_operator is null and v_source ? 'fleet_id' then
      select fleet.operator_id into v_operator
      from public.transport_fleets fleet where fleet.id = public.explore_try_uuid(v_source ->> 'fleet_id');
    end if;
    select jsonb_build_object('kind', 'operator', 'id', operator.id, 'name', operator.full_name, 'code', operator.operator_code::text)
      into v_owner
    from public.transport_operators operator where operator.id = v_operator;
    if v_owner is not null then return v_owner; end if;
    v_company := public.explore_try_uuid(v_source ->> 'company_id');
  elsif p_resource_type = 'transport_company_verification' then
    v_company := p_resource_id;
  elsif p_resource_type = 'marketplace_business_registration' then
    v_business := p_resource_id;
  elsif p_resource_type in ('marketplace_business_document', 'marketplace_verification') then
    v_business := coalesce(public.explore_try_uuid(v_source ->> 'business_id'), p_resource_id);
  end if;

  if v_company is not null then
    select jsonb_build_object('kind', 'company', 'id', company.id, 'name', company.company_name, 'code', company.company_code)
      into v_owner
    from public.transport_companies company where company.id = v_company;
  elsif v_business is not null then
    select jsonb_build_object('kind', 'business', 'id', business.id, 'name', business.business_name, 'code', business.public_business_id)
      into v_owner
    from public.marketplace_businesses business where business.id = v_business;
  end if;
  return v_owner;
end;
$$;

revoke all on function public.admin_case_owner(text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.admin_cases_attach_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner jsonb;
begin
  if new.queue <> 'verification' or coalesce(new.metadata, '{}'::jsonb) ? 'owner' then
    return new;
  end if;
  begin
    v_owner := public.admin_case_owner(new.resource_type, new.resource_id, new.metadata -> 'source');
  exception when others then
    -- A missing name must never stop a case from being opened.
    v_owner := null;
  end;
  if v_owner is not null then
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object('owner', jsonb_strip_nulls(v_owner));
  end if;
  return new;
end;
$$;

revoke all on function public.admin_cases_attach_owner() from public;

drop trigger if exists admin_cases_attach_owner on public.admin_cases;
create trigger admin_cases_attach_owner
before insert on public.admin_cases
for each row execute function public.admin_cases_attach_owner();

-- Existing cases. Only metadata changes; updated_at is left alone so queues
-- keep their order.
update public.admin_cases admin_case
set metadata = admin_case.metadata || jsonb_build_object('owner', jsonb_strip_nulls(owner.value))
from (
  select id, public.admin_case_owner(resource_type, resource_id, metadata -> 'source') as value
  from public.admin_cases
  where queue = 'verification' and not (metadata ? 'owner')
) owner
where owner.id = admin_case.id
  and owner.value is not null;

-- The directory drawer lists an operator's (company's, business's) cases.
create index if not exists admin_cases_owner_id_idx
  on public.admin_cases ((metadata -> 'owner' ->> 'id'))
  where metadata ? 'owner';

commit;
