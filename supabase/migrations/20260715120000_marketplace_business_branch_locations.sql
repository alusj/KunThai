-- UrMall sellers can register up to 10 store locations per business (one
-- primary "Main store" plus branches). Buyers read them to locate the
-- nearest branch from the seller profile.

create table if not exists public.marketplace_business_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.marketplace_businesses(id) on delete cascade,
  label text not null default 'Main store',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  latitude double precision,
  longitude double precision,
  is_primary boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_business_locations_business_idx
  on public.marketplace_business_locations (business_id, position);

alter table public.marketplace_business_locations enable row level security;

drop policy if exists "buyers read business locations" on public.marketplace_business_locations;
create policy "buyers read business locations"
  on public.marketplace_business_locations
  for select
  using (true);

drop policy if exists "business owners manage locations" on public.marketplace_business_locations;
create policy "business owners manage locations"
  on public.marketplace_business_locations
  for all
  using (
    exists (
      select 1 from public.marketplace_businesses b
      where b.id = business_id and b.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.marketplace_businesses b
      where b.id = business_id and b.user_id = auth.uid()
    )
  );

-- Sellers keep at most 10 locations per business; enforced in the database so
-- no client can bypass it.
create or replace function public.enforce_marketplace_business_location_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*) from public.marketplace_business_locations
    where business_id = new.business_id
  ) >= 10 then
    raise exception 'A business can have up to 10 store locations.';
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_business_location_limit on public.marketplace_business_locations;
create trigger marketplace_business_location_limit
  before insert on public.marketplace_business_locations
  for each row execute function public.enforce_marketplace_business_location_limit();
