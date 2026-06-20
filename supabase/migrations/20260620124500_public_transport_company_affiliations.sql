create or replace function public.get_public_transport_company_affiliations(operator_ids uuid[])
returns table (
  operator_id uuid,
  company_id uuid,
  company_name text,
  company_code text,
  company_type text,
  company_city text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (member.operator_id)
    member.operator_id,
    company.id as company_id,
    company.company_name,
    company.company_code,
    company.company_type,
    company.city as company_city
  from public.transport_company_members as member
  join public.transport_companies as company on company.id = member.company_id
  where member.operator_id = any(operator_ids)
    and member.status = 'active'
    and member.service_status = 'active'
  order by member.operator_id, member.updated_at desc nulls last;
$$;

revoke all on function public.get_public_transport_company_affiliations(uuid[]) from public;
grant execute on function public.get_public_transport_company_affiliations(uuid[]) to anon, authenticated;
