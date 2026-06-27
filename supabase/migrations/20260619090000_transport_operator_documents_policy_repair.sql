create or replace function public.transport_operator_is_owned_by_user(
  operator_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transport_operators operator
    where operator.id = operator_uuid
      and operator.user_id = user_uuid
  );
$$;

create or replace function public.transport_operator_documents_are_visible_to_user(
  operator_uuid uuid,
  user_uuid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.transport_operator_is_owned_by_user(operator_uuid, user_uuid)
    or exists (
      select 1
      from public.transport_company_operator_invites invite
      join public.transport_companies company on company.id = invite.company_id
      where invite.operator_id = operator_uuid
        and invite.status = 'accepted'
        and company.owner_user_id = user_uuid
    );
$$;

revoke all on function public.transport_operator_is_owned_by_user(uuid, uuid) from public;
revoke all on function public.transport_operator_documents_are_visible_to_user(uuid, uuid) from public;
grant execute on function public.transport_operator_is_owned_by_user(uuid, uuid) to authenticated;
grant execute on function public.transport_operator_documents_are_visible_to_user(uuid, uuid) to authenticated;

alter table if exists public.transport_operator_documents enable row level security;

drop policy if exists "operators can read own documents" on public.transport_operator_documents;
create policy "operators can read own documents"
on public.transport_operator_documents
for select
to authenticated
using (
  public.transport_operator_documents_are_visible_to_user(operator_id, auth.uid())
);

drop policy if exists "operators can insert own documents" on public.transport_operator_documents;
create policy "operators can insert own documents"
on public.transport_operator_documents
for insert
to authenticated
with check (
  public.transport_operator_is_owned_by_user(operator_id, auth.uid())
);

drop policy if exists "operators can update own documents" on public.transport_operator_documents;
create policy "operators can update own documents"
on public.transport_operator_documents
for update
to authenticated
using (
  public.transport_operator_is_owned_by_user(operator_id, auth.uid())
)
with check (
  public.transport_operator_is_owned_by_user(operator_id, auth.uid())
);

drop policy if exists "operators can delete own documents" on public.transport_operator_documents;
create policy "operators can delete own documents"
on public.transport_operator_documents
for delete
to authenticated
using (
  public.transport_operator_is_owned_by_user(operator_id, auth.uid())
);
