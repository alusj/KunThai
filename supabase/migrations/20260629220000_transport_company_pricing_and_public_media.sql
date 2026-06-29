-- Company owners control company fleet pricing. Passenger-visible media is kept
-- separate from private identity and vehicle documents.

alter table if exists public.transport_operators
  add column if not exists public_selfie_url text;

alter table if exists public.transport_company_fleets
  add column if not exists base_fare numeric(12, 2),
  add column if not exists price_per_km numeric(12, 2),
  add column if not exists price_per_hour numeric(12, 2),
  add column if not exists price_hint text,
  add column if not exists public_fleet_photos jsonb not null default '[]'::jsonb;

alter table if exists public.transport_fleets
  add column if not exists public_fleet_photos jsonb not null default '[]'::jsonb,
  add column if not exists public_operator_photo_url text;

do $$ begin
  alter table public.transport_company_fleets
    add constraint transport_company_fleets_nonnegative_pricing_check
    check (
      coalesce(base_fare, 0) >= 0
      and coalesce(price_per_km, 0) >= 0
      and coalesce(price_per_hour, 0) >= 0
    );
exception
  when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transport-public-media',
  'transport-public-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "transport public media is readable" on storage.objects;
create policy "transport public media is readable"
on storage.objects for select
to public
using (bucket_id = 'transport-public-media');

drop policy if exists "users upload their transport public media" on storage.objects;
create policy "users upload their transport public media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'transport-public-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users update their transport public media" on storage.objects;
create policy "users update their transport public media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'transport-public-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'transport-public-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users delete their transport public media" on storage.objects;
create policy "users delete their transport public media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'transport-public-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.sync_transport_company_pricing_and_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transport_fleets runtime
  set
    base_fare = new.base_fare,
    price_per_km = new.price_per_km,
    price_per_hour = new.price_per_hour,
    price_hint = new.price_hint,
    public_fleet_photos = coalesce(new.public_fleet_photos, '[]'::jsonb),
    public_operator_photo_url = coalesce(operator.public_selfie_url, runtime.public_operator_photo_url),
    updated_at = now()
  from public.transport_operators operator
  where runtime.company_fleet_id = new.id
    and operator.id = runtime.operator_id;
  return new;
end;
$$;

drop trigger if exists sync_transport_company_pricing_and_media_trigger on public.transport_company_fleets;
create trigger sync_transport_company_pricing_and_media_trigger
after insert or update of base_fare, price_per_km, price_per_hour, price_hint, public_fleet_photos
on public.transport_company_fleets
for each row execute function public.sync_transport_company_pricing_and_media();

create or replace function public.sync_accepted_company_fleet_pricing_and_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and new.company_fleet_id is not null then
    update public.transport_fleets runtime
    set
      base_fare = company_fleet.base_fare,
      price_per_km = company_fleet.price_per_km,
      price_per_hour = company_fleet.price_per_hour,
      price_hint = company_fleet.price_hint,
      public_fleet_photos = coalesce(company_fleet.public_fleet_photos, '[]'::jsonb),
      public_operator_photo_url = coalesce(operator.public_selfie_url, runtime.public_operator_photo_url),
      updated_at = now()
    from public.transport_company_fleets company_fleet
    left join public.transport_operators operator on operator.id = new.operator_id
    where runtime.company_fleet_id = new.company_fleet_id
      and company_fleet.id = new.company_fleet_id;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_sync_accepted_company_fleet_pricing_and_media_trigger on public.transport_company_operator_invites;
create trigger zz_sync_accepted_company_fleet_pricing_and_media_trigger
after insert or update of status, operator_id, company_fleet_id
on public.transport_company_operator_invites
for each row execute function public.sync_accepted_company_fleet_pricing_and_media();

create or replace function public.sync_transport_operator_public_selfie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transport_fleets
  set public_operator_photo_url = new.public_selfie_url, updated_at = now()
  where operator_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_transport_operator_public_selfie_trigger on public.transport_operators;
create trigger sync_transport_operator_public_selfie_trigger
after update of public_selfie_url on public.transport_operators
for each row execute function public.sync_transport_operator_public_selfie();

update public.transport_fleets runtime
set
  base_fare = company_fleet.base_fare,
  price_per_km = company_fleet.price_per_km,
  price_per_hour = company_fleet.price_per_hour,
  price_hint = company_fleet.price_hint,
  public_fleet_photos = coalesce(company_fleet.public_fleet_photos, '[]'::jsonb),
  public_operator_photo_url = coalesce(operator.public_selfie_url, runtime.public_operator_photo_url),
  updated_at = now()
from public.transport_company_fleets company_fleet
left join public.transport_operators operator on operator.id = company_fleet.operator_id
where runtime.company_fleet_id = company_fleet.id;
