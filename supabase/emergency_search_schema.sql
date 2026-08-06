-- KUNTHAI SOS EMERGENCY SEARCH HARDENING SQL
-- Verify all emergency numbers with official national agencies before production launch.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique check (country_code = upper(country_code) and length(country_code) = 2),
  country_name text not null,
  police text[] not null default '{}'::text[],
  ambulance text[] not null default '{}'::text[],
  fire text[] not null default '{}'::text[],
  national text[] not null default '{}'::text[],
  notes text,
  source_url text,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade older versions of this table in place. CREATE TABLE IF NOT EXISTS
-- does not add columns when the table already exists.
alter table public.emergency_contacts
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists police text[] not null default '{}'::text[],
  add column if not exists ambulance text[] not null default '{}'::text[],
  add column if not exists fire text[] not null default '{}'::text[],
  add column if not exists national text[] not null default '{}'::text[],
  add column if not exists notes text,
  add column if not exists source_url text,
  add column if not exists verified_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.emergency_contacts
set
  country_code = upper(country_code),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where country_code is not null;

with ranked_contacts as (
  select
    ctid,
    row_number() over (
      partition by country_code
      order by updated_at desc nulls last, created_at desc nulls last, ctid
    ) as duplicate_rank
  from public.emergency_contacts
  where country_code is not null
)
delete from public.emergency_contacts contacts
using ranked_contacts ranked
where contacts.ctid = ranked.ctid
  and ranked.duplicate_rank > 1;

drop trigger if exists set_emergency_contacts_updated_at on public.emergency_contacts;
create trigger set_emergency_contacts_updated_at
before update on public.emergency_contacts
for each row execute function public.set_updated_at();

alter table public.emergency_contacts enable row level security;

drop policy if exists "Anyone can read emergency contacts" on public.emergency_contacts;
create policy "Anyone can read emergency contacts"
on public.emergency_contacts
for select
to anon, authenticated
using (true);

create unique index if not exists emergency_contacts_country_code_unique_idx
on public.emergency_contacts(country_code);

grant usage on schema public to anon, authenticated;
grant select on public.emergency_contacts to anon, authenticated;

insert into public.emergency_contacts
  (country_code, country_name, police, ambulance, fire, notes, metadata)
values
  ('SL', 'Sierra Leone', array['999', '112', '911'], array['999', '112', '911'], array['019', '112', '911'], 'Use 112/911 on mobile where supported.', '{"region":"West Africa"}'),
  ('NG', 'Nigeria', array['112', '199'], array['112'], array['112'], null, '{"region":"West Africa"}'),
  ('GH', 'Ghana', array['191', '112'], array['193', '112'], array['192', '112'], null, '{"region":"West Africa"}'),
  ('LR', 'Liberia', array['911'], array['911'], array['911'], null, '{"region":"West Africa"}'),
  ('GM', 'The Gambia', array['117'], array['116'], array['118'], null, '{"region":"West Africa"}'),
  ('GN', 'Guinea', array['117'], array['442020'], array['18'], null, '{"region":"West Africa"}'),
  ('GW', 'Guinea-Bissau', array['117'], array['119'], array['118'], null, '{"region":"West Africa"}'),
  ('SN', 'Senegal', array['17'], array['15'], array['18'], null, '{"region":"West Africa"}'),
  ('CI', 'Cote d''Ivoire', array['111', '170'], array['185'], array['180'], null, '{"region":"West Africa"}'),
  ('BF', 'Burkina Faso', array['17'], array['112'], array['18'], null, '{"region":"West Africa"}'),
  ('ML', 'Mali', array['17'], array['15'], array['18'], null, '{"region":"West Africa"}'),
  ('NE', 'Niger', array['17'], array['15'], array['18'], null, '{"region":"West Africa"}'),
  ('TG', 'Togo', array['117'], array['8200'], array['118'], null, '{"region":"West Africa"}'),
  ('BJ', 'Benin', array['117'], array['118'], array['118'], null, '{"region":"West Africa"}'),
  ('CV', 'Cape Verde', array['132'], array['130'], array['131'], null, '{"region":"West Africa"}')
on conflict (country_code) do update set
  country_name = excluded.country_name,
  police = excluded.police,
  ambulance = excluded.ambulance,
  fire = excluded.fire,
  notes = excluded.notes,
  metadata = public.emergency_contacts.metadata || excluded.metadata,
  updated_at = now();

-- Keep emergency coverage aligned with the same global country catalogue used
-- by account creation. Unknown numbers stay empty until they are verified; a
-- country row must never silently inherit another country's emergency number.
do $$
begin
  if to_regclass('public.kunthai_countries') is not null then
    execute $global_emergency_seed$
      insert into public.emergency_contacts (
        country_code, country_name, police, ambulance, fire, national, notes, metadata
      )
      select
        country.iso2,
        country.name,
        '{}'::text[],
        '{}'::text[],
        '{}'::text[],
        '{}'::text[],
        'Emergency numbers are awaiting verification from an official national source.',
        jsonb_build_object(
          'catalogCoverage', 'global',
          'verificationStatus', 'pending_official_review'
        )
      from public.kunthai_countries country
      on conflict (country_code) do update set
        country_name = excluded.country_name,
        metadata = public.emergency_contacts.metadata || jsonb_build_object('catalogCoverage', 'global'),
        updated_at = now()
    $global_emergency_seed$;
  end if;
end;
$$;
