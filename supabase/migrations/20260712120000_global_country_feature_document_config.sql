-- Global country, feature, and document requirement configuration.
-- This keeps the current Sierra Leone default behavior while moving country
-- and currency decisions into shared database helpers for global expansion.

create table if not exists public.kunthai_countries (
  iso2 text primary key check (iso2 ~ '^[A-Z]{2}$'),
  name text not null,
  aliases text[] not null default '{}'::text[],
  dial_code text not null default '',
  currency_code text not null check (currency_code ~ '^[A-Z]{3,5}$'),
  currency_name text not null default '',
  currency_symbol text not null default '',
  locale text not null default '',
  default_city text not null default '',
  popular_area text not null default '',
  address_example text not null default '',
  market_status text not null default 'coming_soon'
    check (market_status in ('active', 'coming_soon', 'disabled')),
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kunthai_countries_one_default_idx
  on public.kunthai_countries (is_default)
  where is_default = true;

create index if not exists kunthai_countries_currency_idx
  on public.kunthai_countries (currency_code);

create table if not exists public.kunthai_country_feature_settings (
  country_iso text not null references public.kunthai_countries(iso2) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  status text not null default 'coming_soon'
    check (status in ('available', 'coming_soon', 'disabled')),
  rollout_note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_iso, feature_key)
);

create index if not exists kunthai_country_feature_settings_feature_idx
  on public.kunthai_country_feature_settings (feature_key, enabled);

create table if not exists public.kunthai_document_requirements (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('urride', 'urmall')),
  requirement_group text not null,
  country_iso text not null default '*',
  field_key text not null,
  label text not null,
  inline_note text not null default 'if applicable',
  required boolean not null default true,
  applies_to_categories text[] not null default '{}'::text[],
  legacy_label text,
  legacy_document_type text,
  file_field text,
  name_field text,
  error_key text,
  public_media_role text,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (surface, requirement_group, country_iso, field_key)
);

create index if not exists kunthai_document_requirements_lookup_idx
  on public.kunthai_document_requirements (surface, requirement_group, country_iso, sort_order);

create or replace function public.kunthai_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists kunthai_countries_updated_at on public.kunthai_countries;
create trigger kunthai_countries_updated_at
before update on public.kunthai_countries
for each row execute function public.kunthai_touch_updated_at();

drop trigger if exists kunthai_country_feature_settings_updated_at on public.kunthai_country_feature_settings;
create trigger kunthai_country_feature_settings_updated_at
before update on public.kunthai_country_feature_settings
for each row execute function public.kunthai_touch_updated_at();

drop trigger if exists kunthai_document_requirements_updated_at on public.kunthai_document_requirements;
create trigger kunthai_document_requirements_updated_at
before update on public.kunthai_document_requirements
for each row execute function public.kunthai_touch_updated_at();

insert into public.kunthai_countries (
  iso2, name, aliases, dial_code, currency_code, currency_name, currency_symbol,
  locale, default_city, popular_area, address_example, market_status, is_default, metadata
) values
  ('SL', 'Sierra Leone', array['salone'], '+232', 'SLE', 'Sierra Leonean Leone', 'Le', 'en-SL', 'Freetown', 'Lumley, Freetown', '15 Siaka Stevens Street', 'active', true, '{"mapCenter":{"lat":8.4657,"lng":-13.2317,"label":"Freetown, Sierra Leone"}}'::jsonb),
  ('NG', 'Nigeria', array['naija'], '+234', 'NGN', 'Nigerian Naira', 'NGN', 'en-NG', 'Lagos', 'Ikeja, Lagos', '12 Allen Avenue', 'active', false, '{"mapCenter":{"lat":6.5244,"lng":3.3792,"label":"Lagos, Nigeria"}}'::jsonb),
  ('GH', 'Ghana', array[]::text[], '+233', 'GHS', 'Ghanaian Cedi', 'GHS', 'en-GH', 'Accra', 'Osu, Accra', 'Oxford Street, Osu', 'active', false, '{"mapCenter":{"lat":5.6037,"lng":-0.187,"label":"Accra, Ghana"}}'::jsonb),
  ('LR', 'Liberia', array[]::text[], '+231', 'LRD', 'Liberian Dollar', 'L$', 'en-LR', 'Monrovia', 'Sinkor, Monrovia', 'Broad Street', 'active', false, '{"mapCenter":{"lat":6.3156,"lng":-10.8074,"label":"Monrovia, Liberia"}}'::jsonb),
  ('GN', 'Guinea', array['guinee'], '+224', 'GNF', 'Guinean Franc', 'FG', 'fr-GN', 'Conakry', 'Kaloum, Conakry', 'Kaloum, Conakry', 'active', false, '{"mapCenter":{"lat":9.6412,"lng":-13.5784,"label":"Conakry, Guinea"}}'::jsonb),
  ('CI', 'Ivory Coast', array['cote d''ivoire','cote divoire','ivory coast'], '+225', 'XOF', 'West African CFA Franc', 'CFA', 'fr-CI', 'Abidjan', 'Plateau, Abidjan', 'Plateau, Abidjan', 'active', false, '{"mapCenter":{"lat":5.3599,"lng":-4.0083,"label":"Abidjan, Ivory Coast"}}'::jsonb),
  ('SN', 'Senegal', array[]::text[], '+221', 'XOF', 'West African CFA Franc', 'CFA', 'fr-SN', 'Dakar', 'Plateau, Dakar', 'Avenue Cheikh Anta Diop', 'active', false, '{"mapCenter":{"lat":14.7167,"lng":-17.4677,"label":"Dakar, Senegal"}}'::jsonb),
  ('GM', 'The Gambia', array['gambia'], '+220', 'GMD', 'Gambian Dalasi', 'D', 'en-GM', 'Banjul', 'Serrekunda', 'Kairaba Avenue', 'active', false, '{"mapCenter":{"lat":13.4549,"lng":-16.579,"label":"Banjul, The Gambia"}}'::jsonb),
  ('ML', 'Mali', array[]::text[], '+223', 'XOF', 'West African CFA Franc', 'CFA', 'fr-ML', 'Bamako', 'ACI 2000, Bamako', 'ACI 2000, Bamako', 'active', false, '{"mapCenter":{"lat":12.6392,"lng":-8.0029,"label":"Bamako, Mali"}}'::jsonb),
  ('BF', 'Burkina Faso', array[]::text[], '+226', 'XOF', 'West African CFA Franc', 'CFA', 'fr-BF', 'Ouagadougou', 'Zone du Bois, Ouagadougou', 'Avenue Kwame Nkrumah', 'active', false, '{"mapCenter":{"lat":12.3714,"lng":-1.5197,"label":"Ouagadougou, Burkina Faso"}}'::jsonb),
  ('BJ', 'Benin', array[]::text[], '+229', 'XOF', 'West African CFA Franc', 'CFA', 'fr-BJ', 'Cotonou', 'Cadjehoun, Cotonou', 'Avenue Steinmetz', 'active', false, '{"mapCenter":{"lat":6.3703,"lng":2.3912,"label":"Cotonou, Benin"}}'::jsonb),
  ('TG', 'Togo', array[]::text[], '+228', 'XOF', 'West African CFA Franc', 'CFA', 'fr-TG', 'Lome', 'Tokoin, Lome', 'Boulevard du 13 Janvier', 'active', false, '{"mapCenter":{"lat":6.1725,"lng":1.2314,"label":"Lome, Togo"}}'::jsonb),
  ('NE', 'Niger', array[]::text[], '+227', 'XOF', 'West African CFA Franc', 'CFA', 'fr-NE', 'Niamey', 'Plateau, Niamey', 'Plateau, Niamey', 'active', false, '{"mapCenter":{"lat":13.5116,"lng":2.1254,"label":"Niamey, Niger"}}'::jsonb),
  ('GW', 'Guinea-Bissau', array['guinea bissau'], '+245', 'XOF', 'West African CFA Franc', 'CFA', 'pt-GW', 'Bissau', 'Bissau Velho, Bissau', 'Avenida Amilcar Cabral', 'active', false, '{"mapCenter":{"lat":11.8636,"lng":-15.5977,"label":"Bissau, Guinea-Bissau"}}'::jsonb),
  ('CV', 'Cape Verde', array['cabo verde'], '+238', 'CVE', 'Cape Verdean Escudo', 'CVE', 'pt-CV', 'Praia', 'Plateau, Praia', 'Achada Santo Antonio', 'active', false, '{"mapCenter":{"lat":14.933,"lng":-23.5133,"label":"Praia, Cape Verde"}}'::jsonb),
  ('MR', 'Mauritania', array['mauritanie'], '+222', 'MRU', 'Mauritanian Ouguiya', 'UM', 'fr-MR', 'Nouakchott', 'Tevragh Zeina, Nouakchott', 'Tevragh Zeina', 'active', false, '{"mapCenter":{"lat":18.0735,"lng":-15.9582,"label":"Nouakchott, Mauritania"}}'::jsonb),
  ('ZA', 'South Africa', array['rsa'], '+27', 'ZAR', 'South African Rand', 'R', 'en-ZA', 'Johannesburg', 'Sandton, Johannesburg', '5th Street, Sandton', 'coming_soon', false, '{"mapCenter":{"lat":-26.2041,"lng":28.0473,"label":"Johannesburg, South Africa"}}'::jsonb),
  ('KE', 'Kenya', array[]::text[], '+254', 'KES', 'Kenyan Shilling', 'KSh', 'en-KE', 'Nairobi', 'Westlands, Nairobi', 'Moi Avenue', 'coming_soon', false, '{"mapCenter":{"lat":-1.2921,"lng":36.8219,"label":"Nairobi, Kenya"}}'::jsonb),
  ('US', 'United States', array['usa','america','united states of america'], '+1', 'USD', 'US Dollar', '$', 'en-US', 'New York', 'Brooklyn, New York', '350 5th Avenue', 'coming_soon', false, '{"mapCenter":{"lat":40.7128,"lng":-74.006,"label":"New York, United States"}}'::jsonb),
  ('CA', 'Canada', array[]::text[], '+1', 'CAD', 'Canadian Dollar', 'C$', 'en-CA', 'Toronto', 'Downtown Toronto', '100 Queen Street West', 'coming_soon', false, '{"mapCenter":{"lat":43.6532,"lng":-79.3832,"label":"Toronto, Canada"}}'::jsonb),
  ('GB', 'United Kingdom', array['uk','great britain','britain'], '+44', 'GBP', 'Pound Sterling', 'GBP', 'en-GB', 'London', 'Central London', '10 Downing Street', 'coming_soon', false, '{"mapCenter":{"lat":51.5072,"lng":-0.1276,"label":"London, United Kingdom"}}'::jsonb),
  ('FR', 'France', array[]::text[], '+33', 'EUR', 'Euro', 'EUR', 'fr-FR', 'Paris', 'Paris Centre', 'Avenue des Champs-Elysees', 'coming_soon', false, '{"mapCenter":{"lat":48.8566,"lng":2.3522,"label":"Paris, France"}}'::jsonb),
  ('DE', 'Germany', array['deutschland'], '+49', 'EUR', 'Euro', 'EUR', 'de-DE', 'Berlin', 'Mitte, Berlin', 'Unter den Linden', 'coming_soon', false, '{"mapCenter":{"lat":52.52,"lng":13.405,"label":"Berlin, Germany"}}'::jsonb),
  ('BR', 'Brazil', array['brasil'], '+55', 'BRL', 'Brazilian Real', 'R$', 'pt-BR', 'Sao Paulo', 'Centro, Sao Paulo', 'Avenida Paulista', 'coming_soon', false, '{"mapCenter":{"lat":-23.5558,"lng":-46.6396,"label":"Sao Paulo, Brazil"}}'::jsonb),
  ('IN', 'India', array[]::text[], '+91', 'INR', 'Indian Rupee', 'INR', 'en-IN', 'Mumbai', 'Bandra, Mumbai', 'Bandra West', 'coming_soon', false, '{"mapCenter":{"lat":19.076,"lng":72.8777,"label":"Mumbai, India"}}'::jsonb),
  ('AE', 'United Arab Emirates', array['uae','emirates'], '+971', 'AED', 'UAE Dirham', 'AED', 'en-AE', 'Dubai', 'Deira, Dubai', 'Sheikh Zayed Road', 'coming_soon', false, '{"mapCenter":{"lat":25.2048,"lng":55.2708,"label":"Dubai, United Arab Emirates"}}'::jsonb),
  ('JP', 'Japan', array['nippon'], '+81', 'JPY', 'Japanese Yen', 'JPY', 'ja-JP', 'Tokyo', 'Shibuya, Tokyo', 'Shibuya Crossing', 'coming_soon', false, '{"mapCenter":{"lat":35.6762,"lng":139.6503,"label":"Tokyo, Japan"}}'::jsonb),
  ('AU', 'Australia', array[]::text[], '+61', 'AUD', 'Australian Dollar', 'A$', 'en-AU', 'Sydney', 'Sydney CBD', 'George Street', 'coming_soon', false, '{"mapCenter":{"lat":-33.8688,"lng":151.2093,"label":"Sydney, Australia"}}'::jsonb),
  ('TH', 'Thailand', array['thai'], '+66', 'THB', 'Thai Baht', 'THB', 'th-TH', 'Bangkok', 'Sukhumvit, Bangkok', 'Sukhumvit Road', 'coming_soon', false, '{"mapCenter":{"lat":13.7563,"lng":100.5018,"label":"Bangkok, Thailand"}}'::jsonb)
on conflict (iso2) do update set
  name = excluded.name,
  aliases = excluded.aliases,
  dial_code = excluded.dial_code,
  currency_code = excluded.currency_code,
  currency_name = excluded.currency_name,
  currency_symbol = excluded.currency_symbol,
  locale = excluded.locale,
  default_city = excluded.default_city,
  popular_area = excluded.popular_area,
  address_example = excluded.address_example,
  market_status = excluded.market_status,
  is_default = excluded.is_default,
  metadata = public.kunthai_countries.metadata || excluded.metadata,
  updated_at = now();

with feature_defaults(feature_key, active_enabled, global_enabled) as (
  values
    ('explore', true, true),
    ('urfeed', true, true),
    ('swip', true, true),
    ('direct_messages', true, true),
    ('voice_notes', true, true),
    ('media_uploads', true, true),
    ('your_say', true, true),
    ('urmall', true, false),
    ('seller_registration', true, false),
    ('transport_booking', true, false),
    ('driver_registration', true, false),
    ('company_registration', true, false),
    ('adverts', true, false),
    ('phone_authentication', true, false),
    ('emergency_assistance', true, false)
)
insert into public.kunthai_country_feature_settings (
  country_iso, feature_key, enabled, status, rollout_note
)
select
  country.iso2,
  feature.feature_key,
  case when country.market_status = 'active' then feature.active_enabled else feature.global_enabled end,
  case
    when country.market_status = 'disabled' then 'disabled'
    when case when country.market_status = 'active' then feature.active_enabled else feature.global_enabled end then 'available'
    else 'coming_soon'
  end,
  case
    when country.market_status = 'active' then ''
    when feature.global_enabled then 'Global social experience is available while local operations are prepared.'
    else 'Enable after country-specific local rules, payouts, and operating checks are ready.'
  end
from public.kunthai_countries country
cross join feature_defaults feature
on conflict (country_iso, feature_key) do update set
  enabled = excluded.enabled,
  status = excluded.status,
  rollout_note = excluded.rollout_note,
  updated_at = now();

with requirements (
  surface, requirement_group, country_iso, field_key, label, inline_note, required,
  applies_to_categories, legacy_label, legacy_document_type, file_field, name_field,
  error_key, public_media_role, sort_order, metadata
) as (
  values
    ('urride', 'fleet_image', '*', 'front_view', 'Front view', 'if applicable', true, array[]::text[], 'Front view', null, null, null, null, null, 10, '{}'::jsonb),
    ('urride', 'fleet_image', '*', 'back_view', 'Back view', 'if applicable', true, array[]::text[], 'Back view', null, null, null, null, null, 20, '{}'::jsonb),
    ('urride', 'fleet_image', '*', 'left_side', 'Left side', 'if applicable', true, array[]::text[], 'Left side', null, null, null, null, null, 30, '{}'::jsonb),
    ('urride', 'fleet_image', '*', 'right_side', 'Right side', 'if applicable', true, array[]::text[], 'Right side', null, null, null, null, null, 40, '{}'::jsonb),
    ('urride', 'company', '*', 'business_registration', 'Business registration', 'if applicable', true, array[]::text[], 'Business registration', null, null, null, null, null, 10, '{}'::jsonb),
    ('urride', 'company', '*', 'transport_permit', 'Transport permit', 'if applicable', true, array[]::text[], 'Transport permit', null, null, null, null, null, 20, '{}'::jsonb),
    ('urride', 'company', '*', 'tax_or_business_id', 'Tax or business ID', 'if applicable', true, array[]::text[], 'Tax or business ID', null, null, null, null, null, 30, '{}'::jsonb),
    ('urride', 'company', '*', 'owner_national_id', 'Owner national ID', 'if applicable', true, array[]::text[], 'Owner national ID', null, null, null, null, null, 40, '{}'::jsonb),
    ('urride', 'operator', '*', 'national_id', 'National ID', 'if applicable', true, array[]::text[], 'National ID', null, null, null, null, null, 10, '{}'::jsonb),
    ('urride', 'operator', '*', 'operator_photo', 'Operator selfie/photo', 'if applicable', true, array[]::text[], 'Operator selfie/photo', null, null, null, null, 'operator_photo', 20, '{}'::jsonb),
    ('urride', 'operator', '*', 'driver_or_rider_license', 'Driver or rider license', 'if applicable', true, array[]::text[], 'Driver or rider license', null, null, null, null, null, 30, '{}'::jsonb),
    ('urride', 'operator', '*', 'vehicle_registration', 'Vehicle registration', 'if applicable', true, array[]::text[], 'Vehicle registration', null, null, null, null, null, 40, '{}'::jsonb),
    ('urride', 'operator', '*', 'insurance_document', 'Insurance document', 'if applicable', true, array[]::text[], 'Insurance document', null, null, null, null, null, 50, '{}'::jsonb),
    ('urride', 'operator', '*', 'roadworthiness_certificate', 'Road worthiness or inspection certificate', 'if applicable', true, array['Transport','Both'], 'Road worthiness or inspection certificate', null, null, null, null, null, 60, '{}'::jsonb),
    ('urride', 'operator', '*', 'passenger_interior_photo', 'Passenger interior or seating photo', 'if applicable', true, array['Transport','Both'], 'Passenger interior or seating photo', null, null, null, null, null, 70, '{}'::jsonb),
    ('urride', 'operator', '*', 'delivery_storage_photo', 'Delivery box, bag, or storage photo', 'if applicable', true, array['Delivery','Both'], 'Delivery box, bag, or storage photo', null, null, null, null, null, 80, '{}'::jsonb),
    ('urride', 'operator', '*', 'item_handling_agreement', 'Item handling agreement', 'if applicable', true, array['Delivery','Both'], 'Item handling agreement', null, null, null, null, null, 90, '{}'::jsonb),
    ('urmall', 'seller', '*', 'owner_identity', 'Owner/representative ID', 'if applicable', true, array[]::text[], null, 'id', 'idDocumentFile', 'idDocumentName', 'idDocument', null, 10, '{}'::jsonb),
    ('urmall', 'seller', '*', 'business_registration', 'Business registration document', 'if applicable', true, array[]::text[], null, 'business', 'businessDocumentFile', 'businessDocumentName', 'businessDocument', null, 20, '{}'::jsonb)
)
insert into public.kunthai_document_requirements (
  surface, requirement_group, country_iso, field_key, label, inline_note, required,
  applies_to_categories, legacy_label, legacy_document_type, file_field, name_field,
  error_key, public_media_role, sort_order, metadata
)
select * from requirements
on conflict (surface, requirement_group, country_iso, field_key) do update set
  label = excluded.label,
  inline_note = excluded.inline_note,
  required = excluded.required,
  applies_to_categories = excluded.applies_to_categories,
  legacy_label = excluded.legacy_label,
  legacy_document_type = excluded.legacy_document_type,
  file_field = excluded.file_field,
  name_field = excluded.name_field,
  error_key = excluded.error_key,
  public_media_role = excluded.public_media_role,
  sort_order = excluded.sort_order,
  metadata = public.kunthai_document_requirements.metadata || excluded.metadata,
  updated_at = now();

create or replace function public.kunthai_default_country_iso()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select country.iso2 from public.kunthai_countries country where country.is_default order by country.iso2 limit 1),
    'SL'
  );
$$;

create or replace function public.kunthai_normalize_country_iso(country_value text default null)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  raw_value text := btrim(coalesce(country_value, ''));
  upper_value text := upper(btrim(coalesce(country_value, '')));
  normalized_value text;
  resolved_iso text;
begin
  if raw_value = '' then
    return '';
  end if;

  normalized_value := lower(btrim(regexp_replace(raw_value, '[^a-z0-9+]+', ' ', 'gi')));

  select country.iso2 into resolved_iso
  from public.kunthai_countries country
  where country.iso2 = upper_value
     or country.currency_code = upper_value
     or country.dial_code = raw_value
     or lower(country.name) = lower(raw_value)
     or normalized_value = any(country.aliases)
     or normalized_value = lower(btrim(regexp_replace(country.name, '[^a-z0-9+]+', ' ', 'gi')))
  order by
    case
      when country.iso2 = upper_value then 0
      when country.currency_code = upper_value then 1
      when country.dial_code = raw_value then 2
      else 3
    end
  limit 1;

  return coalesce(resolved_iso, '');
end;
$$;

create or replace function public.kunthai_resolve_country_iso(country_value text default null)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(public.kunthai_normalize_country_iso(country_value), ''), public.kunthai_default_country_iso());
$$;

create or replace function public.kunthai_resolve_currency(
  country_value text default null,
  currency_value text default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  supplied_currency text := upper(btrim(coalesce(currency_value, '')));
  resolved_iso text;
  resolved_currency text;
begin
  if supplied_currency ~ '^[A-Z]{3,5}$' then
    return supplied_currency;
  end if;

  resolved_iso := public.kunthai_resolve_country_iso(country_value);

  select country.currency_code into resolved_currency
  from public.kunthai_countries country
  where country.iso2 = resolved_iso
  limit 1;

  return coalesce(resolved_currency, 'SLE');
end;
$$;

create or replace function public.kunthai_country_feature_enabled(
  country_value text,
  feature_value text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_iso text := public.kunthai_resolve_country_iso(country_value);
  normalized_feature text := lower(btrim(coalesce(feature_value, '')));
  feature_enabled boolean;
begin
  if normalized_feature = '' then
    return false;
  end if;

  select setting.enabled into feature_enabled
  from public.kunthai_country_feature_settings setting
  where setting.country_iso = resolved_iso
    and setting.feature_key = normalized_feature
  limit 1;

  return coalesce(feature_enabled, false);
end;
$$;

create or replace function public.kunthai_get_document_requirements(
  p_surface text,
  p_requirement_group text default null,
  p_country_iso text default null,
  p_category text default null
)
returns setof public.kunthai_document_requirements
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_iso text := public.kunthai_resolve_country_iso(p_country_iso);
  normalized_surface text := lower(btrim(coalesce(p_surface, '')));
  normalized_group text := lower(btrim(coalesce(p_requirement_group, '')));
  normalized_category text := lower(btrim(coalesce(p_category, '')));
begin
  return query
  select
    ranked.id,
    ranked.surface,
    ranked.requirement_group,
    ranked.country_iso,
    ranked.field_key,
    ranked.label,
    ranked.inline_note,
    ranked.required,
    ranked.applies_to_categories,
    ranked.legacy_label,
    ranked.legacy_document_type,
    ranked.file_field,
    ranked.name_field,
    ranked.error_key,
    ranked.public_media_role,
    ranked.sort_order,
    ranked.metadata,
    ranked.created_at,
    ranked.updated_at
  from (
    select
      requirement.*,
      row_number() over (
        partition by requirement.surface, requirement.requirement_group, requirement.field_key
        order by case when requirement.country_iso = resolved_iso then 0 else 1 end, requirement.sort_order, requirement.label
      ) as requirement_rank
    from public.kunthai_document_requirements requirement
    where requirement.surface = normalized_surface
      and (normalized_group = '' or requirement.requirement_group = normalized_group)
      and requirement.country_iso in ('*', resolved_iso)
      and (
        normalized_category = ''
        or cardinality(requirement.applies_to_categories) = 0
        or exists (
          select 1
          from unnest(requirement.applies_to_categories) category
          where lower(btrim(category)) = normalized_category
        )
      )
  ) ranked
  where ranked.requirement_rank = 1
  order by ranked.sort_order, ranked.label;
end;
$$;

alter table public.kunthai_countries enable row level security;
alter table public.kunthai_country_feature_settings enable row level security;
alter table public.kunthai_document_requirements enable row level security;

drop policy if exists "public reads kunthai countries" on public.kunthai_countries;
create policy "public reads kunthai countries"
on public.kunthai_countries for select
to anon, authenticated
using (true);

drop policy if exists "admins manage kunthai countries" on public.kunthai_countries;
create policy "admins manage kunthai countries"
on public.kunthai_countries for all
to authenticated
using (public.is_kunthai_admin())
with check (public.is_kunthai_admin());

drop policy if exists "public reads kunthai country features" on public.kunthai_country_feature_settings;
create policy "public reads kunthai country features"
on public.kunthai_country_feature_settings for select
to anon, authenticated
using (true);

drop policy if exists "admins manage kunthai country features" on public.kunthai_country_feature_settings;
create policy "admins manage kunthai country features"
on public.kunthai_country_feature_settings for all
to authenticated
using (public.is_kunthai_admin())
with check (public.is_kunthai_admin());

drop policy if exists "public reads kunthai document requirements" on public.kunthai_document_requirements;
create policy "public reads kunthai document requirements"
on public.kunthai_document_requirements for select
to anon, authenticated
using (true);

drop policy if exists "admins manage kunthai document requirements" on public.kunthai_document_requirements;
create policy "admins manage kunthai document requirements"
on public.kunthai_document_requirements for all
to authenticated
using (public.is_kunthai_admin())
with check (public.is_kunthai_admin());

grant select on public.kunthai_countries to anon, authenticated;
grant select on public.kunthai_country_feature_settings to anon, authenticated;
grant select on public.kunthai_document_requirements to anon, authenticated;
grant insert, update, delete on public.kunthai_countries to authenticated;
grant insert, update, delete on public.kunthai_country_feature_settings to authenticated;
grant insert, update, delete on public.kunthai_document_requirements to authenticated;
grant execute on function public.kunthai_default_country_iso() to anon, authenticated;
grant execute on function public.kunthai_normalize_country_iso(text) to anon, authenticated;
grant execute on function public.kunthai_resolve_country_iso(text) to anon, authenticated;
grant execute on function public.kunthai_resolve_currency(text, text) to anon, authenticated;
grant execute on function public.kunthai_country_feature_enabled(text, text) to anon, authenticated;
grant execute on function public.kunthai_get_document_requirements(text, text, text, text) to anon, authenticated;

do $$
begin
  if to_regclass('public.explore_ad_campaigns') is not null then
    alter table public.explore_ad_campaigns
      alter column currency set default public.kunthai_resolve_currency();
  end if;
  if to_regclass('public.transport_trips') is not null then
    alter table public.transport_trips
      alter column fare_currency set default public.kunthai_resolve_currency();
  end if;
  if to_regclass('public.transport_operator_transactions') is not null then
    alter table public.transport_operator_transactions
      alter column currency set default public.kunthai_resolve_currency();
  end if;
end;
$$;

create or replace function public.create_explore_ad_campaign(
  p_post_id uuid,
  p_placement text default 'urfeed',
  p_objective text default 'brand_awareness',
  p_audience_type text default 'recommended',
  p_minimum_age integer default 13,
  p_maximum_age integer default null,
  p_gender_target text default 'all',
  p_interest_categories text[] default '{}',
  p_target_area text default null,
  p_duration_days integer default 14,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_budget_type text default 'total',
  p_budget_amount numeric default 0,
  p_currency text default null
)
returns public.explore_ad_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.explore_posts;
  v_start timestamptz := coalesce(p_starts_at, timezone('utc', now()));
  v_end timestamptz;
  v_campaign public.explore_ad_campaigns;
  v_post_safe boolean;
  v_currency text := public.kunthai_resolve_currency(null, p_currency);
begin
  select * into v_post from public.explore_posts where id = p_post_id;
  if v_post.id is null or v_post.user_id is distinct from auth.uid() then
    raise exception 'Advertisement creative was not found or is not owned by the current user';
  end if;

  if not (v_post.post_type = 'advert' or v_post.category = 'advert' or coalesce(v_post.media_meta, '{}'::jsonb) ? 'advert') then
    raise exception 'Only Explore advertisement creatives can create campaigns';
  end if;

  if p_placement in ('swip', 'both') and nullif(btrim(coalesce(v_post.video_url, '')), '') is null then
    raise exception 'Swip placement requires a reviewed video';
  end if;

  if p_placement in ('urfeed', 'both')
    and nullif(btrim(coalesce(v_post.video_url, '')), '') is not null
    and nullif(btrim(coalesce(v_post.image_url, '')), '') is null
  then
    raise exception 'UrFeed placement for a video advertisement requires an image';
  end if;

  v_end := coalesce(p_ends_at, v_start + make_interval(days => greatest(1, least(coalesce(p_duration_days, 14), 365))));
  v_post_safe := coalesce(v_post.moderation_status, 'not_required') in ('not_required', 'approved', 'legacy');

  insert into public.explore_ad_campaigns (
    creative_post_id, advertiser_id, placement, objective, audience_type,
    minimum_age, maximum_age, gender_target, interest_categories, target_area,
    duration_days, starts_at, ends_at, budget_type, budget_amount, currency,
    status, moderation_status, updated_at
  ) values (
    v_post.id, auth.uid(), lower(coalesce(p_placement, 'urfeed')),
    lower(coalesce(p_objective, 'brand_awareness')),
    lower(coalesce(p_audience_type, 'recommended')),
    greatest(13, least(coalesce(p_minimum_age, 13), 120)),
    case when p_maximum_age is null then null else greatest(coalesce(p_minimum_age, 13), least(p_maximum_age, 120)) end,
    lower(coalesce(p_gender_target, 'all')),
    coalesce(p_interest_categories, '{}'::text[]), nullif(btrim(coalesce(p_target_area, '')), ''),
    greatest(1, least(coalesce(p_duration_days, 14), 365)), v_start, v_end,
    lower(coalesce(p_budget_type, 'total')), greatest(0, coalesce(p_budget_amount, 0)),
    v_currency,
    case when v_post_safe then 'active' else 'pending_review' end,
    case when v_post_safe then 'approved' else 'pending' end,
    timezone('utc', now())
  )
  on conflict (creative_post_id) do update set
    placement = excluded.placement,
    objective = excluded.objective,
    audience_type = excluded.audience_type,
    minimum_age = excluded.minimum_age,
    maximum_age = excluded.maximum_age,
    gender_target = excluded.gender_target,
    interest_categories = excluded.interest_categories,
    target_area = excluded.target_area,
    duration_days = excluded.duration_days,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    budget_type = excluded.budget_type,
    budget_amount = excluded.budget_amount,
    currency = excluded.currency,
    status = excluded.status,
    moderation_status = excluded.moderation_status,
    updated_at = timezone('utc', now())
  returning * into v_campaign;

  update public.explore_posts
  set post_privacy = 'public', post_type = 'advert', category = 'advert'
  where id = v_post.id;

  return v_campaign;
end;
$$;

grant execute on function public.create_explore_ad_campaign(uuid, text, text, text, integer, integer, text, text[], text, integer, timestamptz, timestamptz, text, numeric, text) to authenticated;

create or replace function public.transport_company_provision_runtime_fleet(
  company_fleet_uuid uuid,
  operator_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  company_fleet public.transport_company_fleets%rowtype;
  company_record public.transport_companies%rowtype;
  runtime_fleet_id uuid;
  runtime_service_category public.transport_service_category;
  runtime_fleet_type public.transport_fleet_type;
  runtime_verification public.transport_verification_status;
  runtime_active_status text;
  runtime_visible boolean;
  runtime_country_iso text;
  runtime_currency text;
begin
  if company_fleet_uuid is null or operator_uuid is null then
    return null;
  end if;

  select * into company_fleet
  from public.transport_company_fleets
  where id = company_fleet_uuid
  for update;

  if not found then
    return null;
  end if;

  select * into company_record
  from public.transport_companies
  where id = company_fleet.company_id;

  runtime_service_category := case company_fleet.service_category
    when 'Ride only' then 'transport'::public.transport_service_category
    when 'Delivery only' then 'delivery'::public.transport_service_category
    else 'both'::public.transport_service_category
  end;
  runtime_fleet_type := case company_fleet.fleet_type
    when 'Motorbike' then 'motorcycle'::public.transport_fleet_type
    when 'Tricycle' then 'tricycle'::public.transport_fleet_type
    else 'car'::public.transport_fleet_type
  end;
  runtime_verification := case company_fleet.verification_status
    when 'verified' then 'verified'::public.transport_verification_status
    when 'rejected' then 'not_verified'::public.transport_verification_status
    when 'suspended' then 'not_verified'::public.transport_verification_status
    else 'verification_pending'::public.transport_verification_status
  end;
  runtime_active_status := case when company_fleet.active_status = 'active' then 'active' else 'offline' end;
  runtime_visible := coalesce(company_fleet.is_visible_to_passengers, false) and runtime_active_status = 'active';
  runtime_country_iso := public.kunthai_resolve_country_iso(
    coalesce(nullif(company_record.country_iso, ''), nullif(company_record.country, ''))
  );
  runtime_currency := public.kunthai_resolve_currency(
    runtime_country_iso,
    nullif(company_record.currency, '')
  );

  select fleet.id into runtime_fleet_id
  from public.transport_fleets fleet
  where fleet.company_fleet_id = company_fleet.id
  limit 1;

  if runtime_fleet_id is null and nullif(btrim(company_fleet.plate_number), '') is not null then
    select fleet.id into runtime_fleet_id
    from public.transport_fleets fleet
    where fleet.operator_id = operator_uuid
      and upper(regexp_replace(btrim(fleet.plate_number), '[[:space:]]+', ' ', 'g')) =
          upper(regexp_replace(btrim(company_fleet.plate_number), '[[:space:]]+', ' ', 'g'))
    order by fleet.updated_at desc nulls last
    limit 1;
  end if;

  if runtime_fleet_id is null then
    insert into public.transport_fleets (
      operator_id,
      service_category,
      fleet_type,
      fleet_name,
      plate_number,
      make,
      model,
      manufacture_year,
      color,
      operating_area,
      home_base_location,
      safety_answers,
      verification_status,
      active_status,
      is_visible_to_passengers,
      accepts_ride,
      accepts_delivery,
      country,
      country_iso,
      currency,
      company_id,
      company_fleet_id,
      fleet_code,
      updated_at
    ) values (
      operator_uuid,
      runtime_service_category,
      runtime_fleet_type,
      coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), 'NO-PLATE'),
      company_fleet.make,
      company_fleet.model,
      company_fleet.manufacture_year,
      company_fleet.color,
      coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      coalesce(company_fleet.safety_answers, '{}'::jsonb),
      runtime_verification,
      runtime_active_status,
      runtime_visible,
      company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      company_record.country,
      runtime_country_iso,
      runtime_currency,
      company_fleet.company_id,
      company_fleet.id,
      company_fleet.fleet_code,
      now()
    )
    returning id into runtime_fleet_id;
  else
    update public.transport_fleets
    set
      operator_id = operator_uuid,
      service_category = runtime_service_category,
      fleet_type = runtime_fleet_type,
      fleet_name = coalesce(nullif(company_fleet.fleet_name, ''), company_fleet.fleet_type || ' fleet'),
      plate_number = coalesce(nullif(upper(btrim(company_fleet.plate_number)), ''), plate_number),
      make = company_fleet.make,
      model = company_fleet.model,
      manufacture_year = company_fleet.manufacture_year,
      color = company_fleet.color,
      operating_area = coalesce(nullif(company_fleet.operating_area, ''), company_record.city),
      home_base_location = coalesce(nullif(company_fleet.home_base_location, ''), company_record.address),
      safety_answers = coalesce(company_fleet.safety_answers, '{}'::jsonb),
      verification_status = runtime_verification,
      active_status = runtime_active_status,
      is_visible_to_passengers = runtime_visible,
      accepts_ride = company_fleet.service_category in ('Ride only', 'Ride and delivery'),
      accepts_delivery = company_fleet.service_category in ('Delivery only', 'Ride and delivery'),
      country = coalesce(nullif(company_record.country, ''), country),
      country_iso = coalesce(nullif(runtime_country_iso, ''), country_iso),
      currency = coalesce(nullif(runtime_currency, ''), currency),
      company_id = company_fleet.company_id,
      company_fleet_id = company_fleet.id,
      fleet_code = company_fleet.fleet_code,
      updated_at = now()
    where id = runtime_fleet_id;
  end if;

  update public.transport_company_fleets
  set
    operator_id = operator_uuid,
    transport_fleet_id = runtime_fleet_id,
    updated_at = now()
  where id = company_fleet.id;

  return runtime_fleet_id;
end;
$$;

revoke all on function public.transport_company_provision_runtime_fleet(uuid, uuid) from public;

create or replace function public.marketplace_require_registration_documents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  missing_requirement record;
begin
  if new.verification_status in ('verified', 'approved')
     and old.verification_status is distinct from new.verification_status then
    select requirement.* into missing_requirement
    from public.kunthai_get_document_requirements(
      'urmall',
      'seller',
      coalesce(nullif(new.country_iso, ''), nullif(new.country, '')),
      null
    ) requirement
    where requirement.required = true
      and not exists (
        select 1
        from public.marketplace_business_documents document
        where document.business_id = new.id
          and lower(document.document_type) = lower(coalesce(requirement.legacy_document_type, requirement.field_key))
      )
    order by requirement.sort_order
    limit 1;

    if found then
      raise exception '% (%) is required before approval.',
        missing_requirement.label,
        coalesce(nullif(missing_requirement.inline_note, ''), 'if applicable');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists marketplace_business_required_documents on public.marketplace_businesses;
create trigger marketplace_business_required_documents
before update of verification_status on public.marketplace_businesses
for each row execute function public.marketplace_require_registration_documents();

do $$
begin
  if to_regclass('public.transport_fleets') is not null
     and to_regclass('public.transport_company_fleets') is not null
     and to_regclass('public.transport_companies') is not null then
    update public.transport_fleets runtime
    set
      country = coalesce(nullif(runtime.country, ''), nullif(company.country, ''), runtime.country),
      country_iso = public.kunthai_resolve_country_iso(
        coalesce(nullif(company.country_iso, ''), nullif(company.country, ''), nullif(runtime.country_iso, ''))
      ),
      currency = public.kunthai_resolve_currency(
        coalesce(nullif(company.country_iso, ''), nullif(company.country, ''), nullif(runtime.country_iso, '')),
        nullif(company.currency, '')
      ),
      updated_at = now()
    from public.transport_company_fleets company_fleet
    join public.transport_companies company on company.id = company_fleet.company_id
    where runtime.company_fleet_id = company_fleet.id;
  end if;

  if to_regclass('public.marketplace_businesses') is not null then
    update public.marketplace_businesses business
    set
      country_iso = public.kunthai_resolve_country_iso(coalesce(nullif(business.country_iso, ''), nullif(business.country, ''))),
      currency = public.kunthai_resolve_currency(
        coalesce(nullif(business.country_iso, ''), nullif(business.country, '')),
        nullif(business.currency, '')
      ),
      updated_at = now()
    where nullif(business.country, '') is not null
      and (nullif(business.country_iso, '') is null or nullif(business.currency, '') is null);
  end if;

  if to_regclass('public.marketplace_products') is not null
     and to_regclass('public.marketplace_businesses') is not null then
    update public.marketplace_products product
    set
      country = coalesce(nullif(product.country, ''), nullif(business.country, ''), product.country),
      country_iso = public.kunthai_resolve_country_iso(
        coalesce(nullif(product.country_iso, ''), nullif(business.country_iso, ''), nullif(product.country, ''), nullif(business.country, ''))
      ),
      currency = public.kunthai_resolve_currency(
        coalesce(nullif(product.country_iso, ''), nullif(business.country_iso, ''), nullif(product.country, ''), nullif(business.country, '')),
        coalesce(nullif(product.currency, ''), nullif(business.currency, ''))
      ),
      updated_at = now()
    from public.marketplace_businesses business
    where product.business_id = business.id
      and (
        nullif(product.country_iso, '') is null
        or nullif(product.currency, '') is null
        or product.country_iso is distinct from business.country_iso
      );
  end if;
end;
$$;

comment on table public.kunthai_countries is
  'Global country registry used by KunThai country, phone, currency, and rollout configuration.';
comment on table public.kunthai_country_feature_settings is
  'Per-country feature availability. Existing West African markets remain active; newer global markets default to social features while operations are prepared.';
comment on table public.kunthai_document_requirements is
  'Country-aware UrRide and UrMall registration evidence fields. Labels include inline applicability notes for global compliance.';
