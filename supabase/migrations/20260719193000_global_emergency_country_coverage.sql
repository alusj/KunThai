-- Global emergency-contact coverage.
-- The country catalogue used by phone authentication is the source of truth.
-- Rows without verified numbers remain intentionally empty and clearly marked
-- so the application never recommends a guessed emergency number.

create extension if not exists "pgcrypto";

create table if not exists public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
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
  updated_at timestamptz not null default now(),
  constraint emergency_contacts_country_code_format
    check (country_code = upper(country_code) and length(country_code) = 2)
);

alter table public.emergency_contacts
  add column if not exists national text[] not null default '{}'::text[],
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists emergency_contacts_country_code_unique_idx
  on public.emergency_contacts(country_code);

alter table public.emergency_contacts enable row level security;

drop policy if exists "Anyone can read emergency contacts" on public.emergency_contacts;
create policy "Anyone can read emergency contacts"
on public.emergency_contacts
for select
to anon, authenticated
using (true);

grant select on public.emergency_contacts to anon, authenticated;

insert into public.emergency_contacts (
  country_code,
  country_name,
  police,
  ambulance,
  fire,
  national,
  notes,
  metadata
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
  updated_at = now();

-- 112 is the common emergency number across these European markets. This is
-- still tagged for official review because service-specific local numbers can
-- provide a better dispatch route in some countries and territories.
update public.emergency_contacts
set
  police = array['112'],
  ambulance = array['112'],
  fire = array['112'],
  national = array['112'],
  notes = '112 is the common emergency number. Confirm service-specific local numbers with an official national source.',
  metadata = metadata || '{"catalogCoverage":"global","numberCoverage":"regional_standard","verificationStatus":"requires_official_review"}'::jsonb,
  updated_at = now()
where country_code = any(array[
  'AD','AL','AT','AX','BA','BE','BG','BY','CY','CZ','DK','EE','FI','FO','GI','GL',
  'GR','HR','HU','IS','LI','LT','LU','LV','MC','MD','ME','MK','MT','NO','PL','PT',
  'RO','RS','SE','SI','SK','SM','UA','VA','XK'
]);

with known_numbers (
  country_code, police, ambulance, fire, national
) as (
  values
    ('AE', array['999'], array['998'], array['997'], array['999']),
    ('AR', array['911'], array['107'], array['100'], array['911']),
    ('AU', array['000'], array['000'], array['000'], array['000','112']),
    ('BR', array['190'], array['192'], array['193'], array['190']),
    ('CA', array['911'], array['911'], array['911'], array['911']),
    ('CH', array['117'], array['144'], array['118'], array['112']),
    ('CN', array['110'], array['120'], array['119'], array['110']),
    ('DE', array['110'], array['112'], array['112'], array['112']),
    ('ES', array['112'], array['112'], array['112'], array['112']),
    ('FR', array['17'], array['15'], array['18'], array['112']),
    ('GB', array['999'], array['999'], array['999'], array['999','112']),
    ('HK', array['999'], array['999'], array['999'], array['999']),
    ('ID', array['110'], array['118'], array['113'], array['112']),
    ('IE', array['999'], array['999'], array['999'], array['999','112']),
    ('IN', array['100'], array['108','102'], array['101'], array['112']),
    ('IT', array['112'], array['118'], array['115'], array['112']),
    ('JP', array['110'], array['119'], array['119'], array['110']),
    ('KE', array['999'], array['999'], array['999'], array['999','112']),
    ('KR', array['112'], array['119'], array['119'], array['112']),
    ('MX', array['911'], array['911'], array['911'], array['911']),
    ('MR', array['117'], array['101'], array['118'], '{}'::text[]),
    ('MY', array['999'], array['999'], array['994'], array['999']),
    ('NL', array['112'], array['112'], array['112'], array['112']),
    ('NZ', array['111'], array['111'], array['111'], array['111']),
    ('PH', array['911'], array['911'], array['911'], array['911']),
    ('PK', array['15'], array['115'], array['16'], array['1122']),
    ('RU', array['102'], array['103'], array['101'], array['112']),
    ('SA', array['999'], array['997'], array['998'], array['911']),
    ('SG', array['999'], array['995'], array['995'], array['999']),
    ('TH', array['191'], array['1669'], array['199'], array['191']),
    ('TR', array['112'], array['112'], array['112'], array['112']),
    ('TW', array['110'], array['119'], array['119'], array['110']),
    ('US', array['911'], array['911'], array['911'], array['911']),
    ('ZA', array['10111'], array['10177'], array['10177'], array['112'])
)
update public.emergency_contacts contact
set
  police = known.police,
  ambulance = known.ambulance,
  fire = known.fire,
  national = known.national,
  notes = 'Seeded from the KunThai international emergency catalogue. Verify against an official national source before production launch.',
  metadata = contact.metadata || '{"catalogCoverage":"global","numberCoverage":"known_catalog","verificationStatus":"requires_official_review"}'::jsonb,
  updated_at = now()
from known_numbers known
where contact.country_code = known.country_code;

-- Preserve national numbers for the existing curated West African rows while
-- leaving their service-specific police, ambulance, and fire values untouched.
with national_numbers (country_code, national) as (
  values
    ('SL', array['112','911']),
    ('NG', array['112']),
    ('GH', array['112']),
    ('LR', array['911']),
    ('GM', array['117']),
    ('GN', '{}'::text[]),
    ('GW', array['112']),
    ('SN', '{}'::text[]),
    ('CI', '{}'::text[]),
    ('BF', array['112']),
    ('ML', array['112']),
    ('NE', array['112']),
    ('TG', '{}'::text[]),
    ('BJ', '{}'::text[]),
    ('CV', array['132'])
)
update public.emergency_contacts contact
set
  national = numbers.national,
  metadata = contact.metadata || '{"catalogCoverage":"global","numberCoverage":"curated_seed"}'::jsonb,
  updated_at = now()
from national_numbers numbers
where contact.country_code = numbers.country_code;

create or replace function public.kunthai_sync_emergency_contact_country()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.emergency_contacts (
    country_code, country_name, notes, metadata
  ) values (
    new.iso2,
    new.name,
    'Emergency numbers are awaiting verification from an official national source.',
    '{"catalogCoverage":"global","verificationStatus":"pending_official_review"}'::jsonb
  )
  on conflict (country_code) do update set
    country_name = excluded.country_name,
    metadata = public.emergency_contacts.metadata || jsonb_build_object('catalogCoverage', 'global'),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists kunthai_country_emergency_contact_sync on public.kunthai_countries;
create trigger kunthai_country_emergency_contact_sync
after insert or update of name on public.kunthai_countries
for each row execute function public.kunthai_sync_emergency_contact_country();

comment on column public.emergency_contacts.national is
  'Primary national emergency number(s), separate from police, ambulance, and fire service numbers.';
comment on function public.kunthai_sync_emergency_contact_country() is
  'Keeps emergency_contacts country coverage aligned with the global KunThai country catalogue.';
