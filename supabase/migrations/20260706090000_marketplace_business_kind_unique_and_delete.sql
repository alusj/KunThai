-- One business per vertical (retail / restaurant / hotel / property_agent)
-- per user, and a self-service deletion function that removes a single
-- business while the seller's other businesses remain untouched.

-- 1) Block new duplicate business kinds. Existing legacy duplicates remain
--    readable; only new registrations (or kind changes) are validated.
create or replace function public.enforce_unique_marketplace_business_kind()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.marketplace_businesses existing
    where existing.user_id = new.user_id
      and coalesce(existing.business_kind, 'retail') = coalesce(new.business_kind, 'retail')
      and existing.id is distinct from new.id
  ) then
    raise exception 'You already run a % business. Each business type can only be registered once per account.',
      replace(coalesce(new.business_kind, 'retail'), '_', ' ')
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_businesses_unique_kind on public.marketplace_businesses;
create trigger marketplace_businesses_unique_kind
before insert or update of business_kind, user_id on public.marketplace_businesses
for each row execute function public.enforce_unique_marketplace_business_kind();

-- 2) Delete a single business owned by the caller. All child records
--    (products, categories, documents, orders, reviews, payout methods)
--    reference marketplace_businesses with ON DELETE CASCADE.
create or replace function public.delete_my_marketplace_business(target_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to manage your business.' using errcode = '28000';
  end if;

  delete from public.marketplace_businesses
  where id = target_business_id
    and user_id = uid;

  if not found then
    raise exception 'This business could not be found on your account.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.delete_my_marketplace_business(uuid) from public, anon;
grant execute on function public.delete_my_marketplace_business(uuid) to authenticated;
